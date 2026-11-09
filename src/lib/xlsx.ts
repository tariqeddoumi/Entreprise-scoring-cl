import { deflateRawSync, inflateRawSync } from "node:zlib";

/**
 * Lecture et écriture minimales de classeurs Excel (.xlsx), sans dépendance.
 *
 * Un .xlsx est une archive ZIP de fichiers XML. Seul le nécessaire est traité :
 * valeurs des cellules (nombres, textes partagés ou en ligne, booléens) de
 * toutes les feuilles. Aucune formule n'est évaluée — la valeur mise en cache
 * par Excel est lue — et aucune macro n'est exécutée (un .xlsm est refusé par
 * son type).
 *
 * Garde-fous : taille décompressée bornée (archive piège), nombre d'entrées
 * borné, chemins inattendus ignorés.
 */

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const MAX_ENTRIES = 2_000;
const MAX_UNCOMPRESSED = 40 * 1024 * 1024;
const MAX_ROWS = 5_000;
const MAX_COLS = 60;

export class XlsxError extends Error {}

export interface Sheet {
  name: string;
  rows: string[][];
}

// --- ZIP ------------------------------------------------------------------------

function readZip(buf: Buffer): Map<string, Buffer> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new XlsxError("Fichier Excel illisible (archive invalide).");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count > MAX_ENTRIES) throw new XlsxError("Classeur trop complexe.");
  const files = new Map<string, Buffer>();
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new XlsxError("Fichier Excel illisible (répertoire invalide).");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    // Seuls les fichiers XML du classeur sont utiles.
    if (!/^(xl\/|\[Content_Types\]\.xml$)/.test(name) || !/\.(xml|rels)$/.test(name)) continue;
    total += size;
    if (total > MAX_UNCOMPRESSED) throw new XlsxError("Classeur trop volumineux une fois décompressé.");
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new XlsxError("Fichier Excel illisible (entrée invalide).");
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + compSize);
    if (method === 0) files.set(name, Buffer.from(data));
    else if (method === 8) files.set(name, inflateRawSync(data, { maxOutputLength: Math.max(size, 1) + 1024 }));
    else throw new XlsxError("Compression du classeur non prise en charge.");
  }
  return files;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function writeZip(files: Array<[string, string]>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of files) {
    const raw = Buffer.from(content, "utf8");
    const data = deflateRawSync(raw);
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    locals.push(lh, nameBuf, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// --- XML -------------------------------------------------------------------------

function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

function encode(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const attr = (tag: string, name: string): string | undefined => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? decode(m[1]) : undefined;
};

function texts(fragment: string): string {
  return [...fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join("");
}

function colIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Feuilles du classeur, cellules en texte (nombres en notation décimale). */
export function readXlsx(bytes: Uint8Array): Sheet[] {
  const files = readZip(Buffer.from(bytes));
  const workbook = files.get("xl/workbook.xml")?.toString("utf8");
  if (!workbook) throw new XlsxError("Classeur Excel sans feuille.");
  const rels = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (id && target) targets.set(id, target.replace(/^\/?xl\//, "").replace(/^\//, ""));
  }
  const shared = files.get("xl/sharedStrings.xml")?.toString("utf8");
  const strings = shared ? [...shared.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1])) : [];

  const sheets: Sheet[] = [];
  for (const m of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(m[0], "name") ?? `Feuille ${sheets.length + 1}`;
    const rid = attr(m[0], "r:id");
    const target = rid ? targets.get(rid) : undefined;
    const xml = target ? files.get(`xl/${target}`)?.toString("utf8") : undefined;
    if (!xml) continue;
    const rows: string[][] = [];
    for (const r of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const rowNum = Number(attr(`<row${r[1]}>`, "r")) || rows.length + 1;
      if (rowNum > MAX_ROWS) break;
      const row: string[] = [];
      for (const c of r[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const head = `<c${c[1]}>`;
        const ref = attr(head, "r");
        const idx = ref ? colIndex(ref) : row.length;
        if (idx >= MAX_COLS) continue;
        const t = attr(head, "t");
        const body = c[2] ?? "";
        const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let value = "";
        if (t === "s") value = strings[Number(raw)] ?? "";
        else if (t === "inlineStr") value = texts(body);
        else if (t === "b") value = raw === "1" ? "VRAI" : "FAUX";
        else if (raw !== undefined) value = decode(raw);
        row[idx] = value.trim();
      }
      rows[rowNum - 1] = Array.from(row, (x) => x ?? "");
    }
    sheets.push({ name, rows: Array.from(rows, (x) => x ?? []) });
  }
  return sheets;
}

/** Texte tabulé de toutes les feuilles, pour la lecture par l'OCR intelligent. */
export function xlsxToText(bytes: Uint8Array, maxChars = 200_000): string {
  const out = readXlsx(bytes)
    .map((s) => `=== Feuille « ${s.name} » ===\n${s.rows.filter((r) => r.some(Boolean)).map((r) => r.join("\t")).join("\n")}`)
    .join("\n\n");
  return out.slice(0, maxChars);
}

/** Date Excel (numéro de série) ou texte, en AAAA-MM-JJ. */
export function excelDate(v: string): string {
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const fr = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (fr) return `${fr[3]}-${fr[2].padStart(2, "0")}-${fr[1].padStart(2, "0")}`;
  const n = Number(s);
  if (Number.isFinite(n) && n > 20_000 && n < 80_000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86_400_000).toISOString().slice(0, 10);
  }
  return "";
}

// --- Écriture ----------------------------------------------------------------------

export interface WriteCell {
  value: string | number;
  /** 0 normal, 1 gras (titre), 2 montant, 3 gras sur fond (en-tête), 4 italique gris (calculé). */
  style?: 0 | 1 | 2 | 3 | 4;
}

function colName(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Classeur d'une feuille, colonnes de largeur fixée. */
export function writeXlsx(sheetName: string, rows: WriteCell[][], widths: number[]): Uint8Array {
  return writeWorkbook([{ name: sheetName, rows, widths, freezeRows: 4 }]);
}

export interface WriteSheet {
  name: string;
  rows: WriteCell[][];
  widths: number[];
  /** Lignes figées en tête (0 : aucune). */
  freezeRows?: number;
}

function sheetXml(sh: WriteSheet): string {
  const sheetRows = sh.rows
    .map((r, ri) => {
      const cells = r
        .map((c, ci) => {
          const ref = `${colName(ci)}${ri + 1}`;
          const s = c.style ? ` s="${c.style}"` : "";
          if (typeof c.value === "number") return `<c r="${ref}"${s}><v>${c.value}</v></c>`;
          if (c.value === "") return c.style ? `<c r="${ref}"${s}/>` : "";
          return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${encode(c.value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join("");
  const cols = sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  const f = sh.freezeRows ?? 0;
  const pane = f > 0 ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${f}" topLeftCell="A${f + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}<cols>${cols}</cols><sheetData>${sheetRows}</sheetData></worksheet>`;
}

/** Classeur de plusieurs feuilles. */
export function writeWorkbook(sheets: WriteSheet[]): Uint8Array {
  const overrides = sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  const sheetTags = sheets.map((sh, i) => `<sheet name="${encode(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("");
  const rels = sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("");
  const files: Array<[string, string]> = [
    [
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ],
    [
      "_rels/.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ],
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetTags}</sheets></workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ],
    [
      "xl/styles.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><i/><sz val="11"/><color rgb="FF666666"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F1"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="5"><xf/><xf fontId="1" applyFont="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf fontId="2" applyFont="1"/></cellXfs></styleSheet>',
    ],
    ...sheets.map((sh, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sh)]),
  ];
  return new Uint8Array(writeZip(files));
}
