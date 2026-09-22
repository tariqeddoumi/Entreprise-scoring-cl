/**
 * Convertit un document Markdown du dépôt en fichier Word.
 *
 * Écrit pour les notes et argumentaires de `docs/` : titres, tableaux,
 * citations, blocs de code et emphase. Aucune dépendance à un service externe.
 *
 * La page de garde est construite depuis l'en-tête du document source — titre,
 * champs « **Nom :** valeur » et bloc de citation d'avertissement — de sorte
 * qu'une correction dans le Markdown se répercute dans le Word sans édition
 * manuelle. C'est la même règle que pour les grilles du modèle : une seule
 * source, jamais de recopie.
 *
 * Usage :
 *   node scripts/md-to-docx.mjs <source.md> <sortie.docx> [titre] [sous-titre]
 *                               [accroche] [version] [en-tête de page]
 */
import fs from "node:fs";
import path from "node:path";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  BorderStyle,
  AlignmentType,
  PageBreak,
  Header,
  Footer,
  PageNumber,
  VerticalAlign,
  TabStopType,
  TabStopPosition,
} from "docx";

const [, , srcArg, outArg, ...coverArgs] = process.argv;
if (!srcArg || !outArg) {
  console.error(
    "Usage : node scripts/md-to-docx.mjs <source.md> <sortie.docx> [titre] [sous-titre] [accroche] [version] [en-tête]"
  );
  process.exit(1);
}

const SRC = path.resolve(srcArg);
const OUT = path.resolve(outArg);
const raw = fs.readFileSync(SRC, "utf8");
const lines = raw.split("\n");

const COVER = {
  title: coverArgs[0] ?? firstHeading() ?? path.basename(SRC, ".md"),
  subtitle: coverArgs[1] ?? "",
  tagline: coverArgs[2] ?? "",
  version: coverArgs[3] ?? "",
  header: coverArgs[4] ?? COVER_HEADER_FALLBACK(),
};

function COVER_HEADER_FALLBACK() {
  return coverArgs[0] ?? firstHeading() ?? "";
}

function firstHeading() {
  const h = lines.find((l) => /^# /.test(l));
  return h ? h.replace(/^#\s+/, "").trim() : null;
}

const BRAND = "1F3864";
const BRAND2 = "2E5395";
const LIGHT = "EDF2FA";
const FONT = "Calibri";
const CONTENT_WIDTH = 9600; // dxa

// ---------------------------------------------------------------------------
// Markdown en ligne
// ---------------------------------------------------------------------------

/**
 * Découpe le texte en fragments {text, bold, italics, code}.
 *
 * Renvoie des descripteurs simples, JAMAIS des TextRun : c'est l'appelant —
 * paragraphe ou cellule — qui applique sa taille et sa couleur de base. Un
 * TextRun déjà construit ne se relit pas, et tenter de le faire produit des
 * cellules vides.
 */
function parseInline(text) {
  const frags = [];
  let i = 0;
  let buf = "";
  const flush = () => {
    if (buf.length) frags.push({ text: buf });
    buf = "";
  };
  while (i < text.length) {
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end !== -1) {
        flush();
        frags.push({ text: text.slice(i + 2, end), bold: true });
        i = end + 2;
        continue;
      }
    }
    if (text[i] === "*" && text[i + 1] !== "*" && (i === 0 || text[i - 1] !== "*")) {
      const end = text.indexOf("*", i + 1);
      if (end !== -1 && end > i + 1) {
        flush();
        frags.push({ text: text.slice(i + 1, end), italics: true });
        i = end + 1;
        continue;
      }
    }
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        flush();
        frags.push({ text: text.slice(i + 1, end), code: true });
        i = end + 1;
        continue;
      }
    }
    buf += text[i];
    i += 1;
  }
  flush();
  return frags.length ? frags : [{ text: "" }];
}

function toRuns(fragments, base = {}) {
  return fragments.map((f) => {
    if (f.code) {
      return new TextRun({
        text: f.text,
        font: "Consolas",
        size: Math.max(16, (base.size || 21) - 2),
        shading: { type: ShadingType.CLEAR, fill: "F2F2F2" },
        color: base.color,
      });
    }
    return new TextRun({
      text: f.text,
      font: FONT,
      ...base,
      bold: f.bold || base.bold,
      italics: f.italics || base.italics,
    });
  });
}

// ---------------------------------------------------------------------------
// Tableaux
// ---------------------------------------------------------------------------

function parseAlign(sep) {
  const t = sep.trim();
  if (t.startsWith(":") && t.endsWith(":")) return AlignmentType.CENTER;
  if (t.endsWith(":")) return AlignmentType.RIGHT;
  return AlignmentType.LEFT;
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function longestWord(s) {
  return s
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .split(/\s+/)
    .reduce((m, w) => Math.max(m, w.length), 0);
}

/**
 * Largeurs de colonnes.
 *
 * Deux mesures par colonne : la longueur totale, qui donne la proportion, et le
 * plus long mot insécable, qui impose un plancher. Sans ce plancher, un jeton
 * comme « CREDIT_POLICY » se coupe en plein milieu — il ne contient aucune
 * espace où le rendu puisse revenir à la ligne.
 */
function buildTable(headerCells, aligns, bodyRows) {
  const n = headerCells.length;
  const maxLen = new Array(n).fill(0);
  const maxWord = new Array(n).fill(0);
  const measure = (cells) =>
    cells.forEach((c, idx) => {
      maxLen[idx] = Math.max(maxLen[idx] || 0, c.length);
      maxWord[idx] = Math.max(maxWord[idx] || 0, longestWord(c));
    });
  measure(headerCells);
  bodyRows.forEach(measure);

  const rawWidths = maxLen.map((l) => Math.max(700, Math.min(l * 55, 3000)));
  const total = rawWidths.reduce((a, b) => a + b, 0);
  const widths = rawWidths.map((w) => Math.round((w / total) * CONTENT_WIDTH));
  widths[widths.length - 1] += CONTENT_WIDTH - widths.reduce((a, b) => a + b, 0);

  const floors = maxWord.map((w) => Math.min(2700, Math.max(1000, w * 118 + 300)));
  let deficit = 0;
  for (let idx = 0; idx < widths.length; idx += 1) {
    if (widths[idx] < floors[idx]) {
      deficit += floors[idx] - widths[idx];
      widths[idx] = floors[idx];
    }
  }
  while (deficit > 0) {
    const donor = widths.reduce(
      (best, w, idx) => (w - floors[idx] > widths[best] - floors[best] ? idx : best),
      0
    );
    const room = widths[donor] - floors[donor];
    if (room <= 0) break;
    const take = Math.min(room, deficit);
    widths[donor] -= take;
    deficit -= take;
  }

  const cell = (text, { header = false, align = AlignmentType.LEFT, width }) =>
    new TableCell({
      width: { size: width, type: WidthType.DXA },
      shading: header ? { type: ShadingType.CLEAR, fill: BRAND } : undefined,
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [
        new Paragraph({
          alignment: align,
          children: toRuns(parseInline(text), {
            bold: header,
            size: 18,
            color: header ? "FFFFFF" : undefined,
          }),
        }),
      ],
    });

  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: "B7C6E5" },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: "B7C6E5" },
      left: { style: BorderStyle.SINGLE, size: 2, color: "B7C6E5" },
      right: { style: BorderStyle.SINGLE, size: 2, color: "B7C6E5" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "D7DFF2" },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "D7DFF2" },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headerCells.map((h, idx) =>
          cell(h, { header: true, align: AlignmentType.CENTER, width: widths[idx] })
        ),
      }),
      ...bodyRows.map(
        (r) =>
          new TableRow({
            children: r.map((c, idx) =>
              cell(c, { align: aligns[idx] || AlignmentType.LEFT, width: widths[idx] })
            ),
          })
      ),
    ],
  });
}

// ---------------------------------------------------------------------------
// Corps du document
// ---------------------------------------------------------------------------

/** Le corps démarre au premier titre de section : l'en-tête sert la couverture. */
let startIdx = 0;
for (let i = 0; i < lines.length; i += 1) {
  if (/^#{1,2} (Partie|Sommaire|\d+\.)/.test(lines[i])) {
    startIdx = i;
    break;
  }
}

/** Champ « **Nom :** valeur » de l'en-tête. */
function headerField(name) {
  const m = new RegExp(`\\*\\*${name}\\s*:\\*\\*\\s*([^\\n]+)`).exec(raw.slice(0, 2500));
  return m ? `${name} : ${m[1].replace(/\*\*/g, "").trim()}` : null;
}

/** Avertissement de tête : les lignes « > » situées avant la première section. */
function coverQuotes() {
  return lines
    .slice(0, startIdx)
    .filter((l) => l.startsWith(">"))
    .map((l) => l.replace(/^>\s?/, "").trim())
    .filter(Boolean);
}

const body = [];
let blockquote = [];

function flushBlockquote() {
  for (const l of blockquote) {
    body.push(
      new Paragraph({
        indent: { left: 360 },
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: BRAND2, space: 8 } },
        shading: { type: ShadingType.CLEAR, fill: LIGHT },
        spacing: { after: 80 },
        children: toRuns(parseInline(l), { italics: true, size: 20, color: "3B4A66" }),
      })
    );
  }
  blockquote = [];
}

let i = startIdx;
while (i < lines.length) {
  const line = lines[i];

  if (line.trim() === "" || line.trim() === "---") {
    flushBlockquote();
    i += 1;
    continue;
  }

  if (line.trim() === "```") {
    flushBlockquote();
    i += 1;
    const code = [];
    while (i < lines.length && lines[i].trim() !== "```") {
      code.push(lines[i]);
      i += 1;
    }
    i += 1;
    code.forEach((cl, idx) =>
      body.push(
        new Paragraph({
          shading: { type: ShadingType.CLEAR, fill: "F2F2F2" },
          spacing: { after: idx === code.length - 1 ? 160 : 0 },
          children: [new TextRun({ text: cl, font: "Consolas", size: 18 })],
        })
      )
    );
    continue;
  }

  if (line.startsWith(">")) {
    blockquote.push(line.replace(/^>\s?/, ""));
    i += 1;
    continue;
  }
  flushBlockquote();

  const heading = /^(#{1,4})\s+(.*)$/.exec(line);
  if (heading) {
    const level = heading[1].length;
    const text = heading[2].trim();
    const levels = {
      1: HeadingLevel.HEADING_1,
      2: HeadingLevel.HEADING_2,
      3: HeadingLevel.HEADING_3,
      4: HeadingLevel.HEADING_4,
    };
    body.push(
      new Paragraph({
        heading: levels[level],
        pageBreakBefore: level === 1 && /^Partie /.test(text),
        spacing: { before: level === 1 ? 400 : 240, after: 160 },
        children: toRuns(parseInline(text)),
      })
    );
    i += 1;
    continue;
  }

  if (line.trim().startsWith("|")) {
    const tbl = [];
    while (i < lines.length && lines[i].trim().startsWith("|")) {
      tbl.push(lines[i]);
      i += 1;
    }
    if (tbl.length >= 2) {
      body.push(
        buildTable(splitRow(tbl[0]), splitRow(tbl[1]).map(parseAlign), tbl.slice(2).map(splitRow))
      );
      body.push(new Paragraph({ text: "", spacing: { after: 160 } }));
    }
    continue;
  }

  // Une puce ou un élément numéroté garde sa marque : la conserver en texte
  // évite une numérotation Word qui repartirait à 1 à chaque liste.
  const listItem = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
  if (listItem) {
    const marker = /^\d/.test(listItem[2]) ? `${listItem[2]} ` : "• ";
    body.push(
      new Paragraph({
        indent: { left: 360, hanging: 200 },
        spacing: { after: 80 },
        children: toRuns(parseInline(marker + listItem[3])),
      })
    );
    i += 1;
    continue;
  }

  body.push(
    new Paragraph({ spacing: { after: 140 }, children: toRuns(parseInline(line.trim())) })
  );
  i += 1;
}
flushBlockquote();

// ---------------------------------------------------------------------------
// Page de garde
// ---------------------------------------------------------------------------

const centered = (text, opts) =>
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: opts.spacing,
    children: [new TextRun({ text, font: FONT, ...opts.run })],
  });

const cover = [
  new Paragraph({ spacing: { before: 1200 }, text: "" }),
  centered(COVER.title, {
    spacing: { after: 120 },
    run: { bold: true, size: 52, color: BRAND },
  }),
];
if (COVER.subtitle) {
  cover.push(
    centered(COVER.subtitle, {
      spacing: { before: 120, after: 100 },
      run: { bold: true, size: 30, color: BRAND2 },
    })
  );
}
if (COVER.tagline) {
  cover.push(
    centered(COVER.tagline, {
      spacing: { after: 400 },
      run: { italics: true, size: 24, color: "44546A" },
    })
  );
}
for (const field of ["Public", "Destinataires", "Durée de présentation conseillée", "Version", "Date"]) {
  const value = headerField(field);
  if (value) {
    cover.push(centered(value, { spacing: { after: 40 }, run: { size: 20, color: "44546A" } }));
  }
}
const classification = headerField("Classification");
cover.push(
  centered(classification ?? "Classification : usage interne", {
    spacing: { after: 420 },
    run: { size: 20, italics: true, color: "44546A" },
  })
);
for (const quote of coverQuotes()) {
  cover.push(
    new Paragraph({
      indent: { left: 360, right: 360 },
      border: { left: { style: BorderStyle.SINGLE, size: 18, color: BRAND2, space: 8 } },
      shading: { type: ShadingType.CLEAR, fill: LIGHT },
      spacing: { after: 160 },
      children: toRuns(parseInline(quote), { italics: true, size: 20, color: "3B4A66" }),
    })
  );
}
cover.push(new Paragraph({ children: [new PageBreak()] }));

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

const headingStyle = (id, name, size, color, extra = {}) => ({
  id,
  name,
  basedOn: "Normal",
  next: "Normal",
  quickFormat: true,
  run: { font: FONT, size, bold: true, color },
  paragraph: { spacing: { before: 280, after: 140 }, keepNext: true, ...extra },
});

const doc = new Document({
  creator: "Direction des Risques",
  title: COVER.title,
  description: COVER.subtitle,
  styles: {
    default: { document: { run: { font: FONT, size: 21 } } },
    paragraphStyles: [
      headingStyle("Heading1", "Heading 1", 30, BRAND, { spacing: { before: 360, after: 180 } }),
      headingStyle("Heading2", "Heading 2", 25, BRAND2, {
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "C3CFE8", space: 4 } },
      }),
      headingStyle("Heading3", "Heading 3", 22, "31456A"),
      {
        ...headingStyle("Heading4", "Heading 4", 21, "44546A"),
        run: { font: FONT, size: 21, bold: true, italics: true, color: "44546A" },
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1000, bottom: 1000, left: 1150, right: 1150 },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "C3CFE8", space: 4 } },
              children: [
                new TextRun({ text: COVER.header, size: 15, color: "6B7A99", font: FONT }),
                new TextRun({
                  text: `\t${COVER.version.split(" · ")[0]}`,
                  size: 15,
                  color: "6B7A99",
                  font: FONT,
                }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "Usage interne — ", size: 15, color: "6B7A99", font: FONT }),
                new TextRun({ children: [PageNumber.CURRENT], size: 15, color: "6B7A99", font: FONT }),
                new TextRun({ text: " / ", size: 15, color: "6B7A99", font: FONT }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 15, color: "6B7A99", font: FONT }),
              ],
            }),
          ],
        }),
      },
      children: [...cover, ...body],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, buffer);
console.log(`${path.relative(process.cwd(), OUT)} — ${(buffer.length / 1024).toFixed(0)} Ko`);
