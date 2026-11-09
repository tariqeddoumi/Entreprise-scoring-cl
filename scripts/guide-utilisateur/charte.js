// Charte Word commune (guide utilisateur, expression de besoin) : couleurs et
// logo Groupe BCP des présentations.
const fs = require("fs");
const d = require("docx");
const {
  Document, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, LevelFormat, Footer, Header, PageNumber, TableOfContents,
  PageBreak, TabStopType, VerticalAlign,
} = d;

const ORANGE = "E37B05", BRUN = "462016", GRIS = "3D3D3B", TINT = "F2E8DB", TINT2 = "FBF6F0", BORD = "D9C7B0";
const DIR = __dirname;
const LOGO = fs.readFileSync(`${DIR}/../assets/groupe-bcp-logo.png`);
const BAND = fs.readFileSync(`${DIR}/../assets/groupe-bcp-bandeau.png`);
const CONTENT_W = 9638; // A4, marges 2 cm : 11906 - 2 x 1134

const t = (text, o = {}) => new TextRun({ text, font: "Arial", ...o });
const p = (children, o = {}) => new Paragraph({ children: Array.isArray(children) ? children : [t(children)], spacing: { after: 120, line: 276 }, ...o });
const body = (text) => p([t(text, { size: 21, color: GRIS })]);
const bullets = (items, ref = "puces") => items.map((x) => new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 60 }, children: Array.isArray(x) ? x : [t(x, { size: 21, color: GRIS })] }));
const numbered = (items, instance) => items.map((x, i) => new Paragraph({ numbering: { reference: "etapes", level: 0, instance }, keepNext: i < items.length - 1, keepLines: true, spacing: { after: 60 }, children: [t(x, { size: 21, color: GRIS })] }));
const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [t(text)] });
const h2 = (text, o = {}) => new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [t(text)], ...o });
const h3 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_3, keepNext: true, children: [t(text)] });

/** Encadré coloré (une cellule de tableau ombrée), pour « À savoir » ou une règle. */
function box(title, lines, fill = TINT) {
  const cellBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [new TableRow({ children: [new TableCell({
      width: { size: CONTENT_W, type: WidthType.DXA },
      shading: { fill, type: ShadingType.CLEAR, color: "auto" },
      margins: { top: 140, bottom: 140, left: 220, right: 220 },
      borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder },
      children: [
        ...(title ? [new Paragraph({ spacing: { after: 60 }, children: [t(title, { bold: true, color: ORANGE, size: 20 })] })] : []),
        ...lines.map((l) => new Paragraph({ spacing: { after: 40 }, children: Array.isArray(l) ? l : [t(l, { size: 20, color: GRIS })] })),
      ],
    })] })],
  });
}

/** Tableau à en-tête orangé et lignes alternées. */
function table(headers, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const border = { style: BorderStyle.SINGLE, size: 4, color: BORD };
  const borders = { top: border, bottom: border, left: border, right: border };
  const cell = (text, i, j, head) => new TableCell({
    width: { size: widths[j], type: WidthType.DXA },
    shading: { fill: head ? ORANGE : i % 2 ? TINT2 : TINT, type: ShadingType.CLEAR, color: "auto" },
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    verticalAlign: VerticalAlign.CENTER,
    borders,
    children: String(text).split("\n").map((line) => new Paragraph({ spacing: { after: 0 }, children: [t(line, head ? { bold: true, color: "FFFFFF", size: 19 } : { size: 19, color: j === 0 ? BRUN : GRIS, bold: j === 0 })] })),
  });
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    rows: [new TableRow({ tableHeader: true, children: headers.map((h, j) => cell(h, 0, j, true)) }),
      ...rows.map((r, i) => new TableRow({ cantSplit: true, children: r.map((v, j) => cell(v, i, j, false)) }))],
  });
}

/** Capture d'écran pleine largeur, avec légende. */
function figure(path, caption, widthPx = 640) {
  const buf = fs.readFileSync(path);
  // dimensions JPEG
  let w = 1600, h = 900;
  for (let i = 2; i < buf.length;) {
    if (buf[i] !== 0xff) break;
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xc3) { h = buf.readUInt16BE(i + 5); w = buf.readUInt16BE(i + 7); break; }
    i += 2 + len;
  }
  const width = w < h ? 260 : widthPx;
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 80, after: 60 },
      children: [new ImageRun({ type: "jpg", data: buf, transformation: { width, height: Math.round(width * h / w) },
        altText: { title: caption, description: caption, name: caption } })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { after: 160 }, children: [t(caption, { italics: true, size: 17, color: "8A7A6A" })] }),
  ];
}

function cover({ titre, sousTitre, date, mention }) {
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600, after: 600 }, children: [new ImageRun({ type: "png", data: LOGO, transformation: { width: 230, height: 120 }, altText: { title: "Groupe BCP", description: "Logo Groupe BCP", name: "logo" } })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [t(titre.toUpperCase(), { bold: true, size: 56, color: ORANGE })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [t(sousTitre, { size: 28, color: BRUN })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 1400 }, children: [new ImageRun({ type: "png", data: BAND, transformation: { width: 620, height: 45 }, altText: { title: "Bandeau", description: "Bandeau décoratif Groupe BCP", name: "bandeau" } })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [t(date, { size: 22, color: GRIS })] }),
    ...(mention ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [t(mention, { size: 18, italics: true, color: "8A7A6A" })] })] : []),
  ];
}

function document({ titreCourt, children }) {
  return new Document({
    creator: "Groupe BCP", title: titreCourt, description: titreCourt,
    styles: {
      default: { document: { run: { font: "Arial", size: 21, color: GRIS } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: "Arial", size: 34, bold: true, color: ORANGE }, paragraph: { spacing: { before: 120, after: 220 }, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: "Arial", size: 26, bold: true, color: BRUN }, paragraph: { spacing: { before: 320, after: 140 }, outlineLevel: 1 } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: "Arial", size: 22, bold: true, color: ORANGE }, paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 } },
      ],
    },
    numbering: { config: [
      { reference: "puces", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } }, run: { color: ORANGE } } }] },
      { reference: "etapes", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } }, run: { color: ORANGE, bold: true } } }] },
    ] },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1134, left: 1134, right: 1134, header: 600, footer: 500 } }, titlePage: true },
      headers: {
        default: new Header({ children: [new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ORANGE, space: 4 } },
          children: [new ImageRun({ type: "png", data: LOGO, transformation: { width: 69, height: 36 }, altText: { title: "Groupe BCP", description: "Logo", name: "logo-entete" } }), t(`\t${titreCourt}`, { size: 16, color: BRUN })] })] }),
        first: new Header({ children: [new Paragraph({ children: [] })] }),
      },
      footers: {
        default: new Footer({ children: [new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
          children: [t("Groupe BCP — document interne", { size: 16, color: "8A7A6A" }), t("\tPage ", { size: 16, color: "8A7A6A" }), new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: "8A7A6A" }), t(" / ", { size: 16, color: "8A7A6A" }), new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Arial", size: 16, color: "8A7A6A" })] })] }),
        first: new Footer({ children: [new Paragraph({ children: [] })] }),
      },
      children,
    }],
  });
}

/** Sommaire écrit (lisible dans tout lecteur, sans mise à jour de champ). */
const toc = (entries) => [new Paragraph({ pageBreakBefore: true, spacing: { after: 240 }, children: [t("Sommaire", { bold: true, size: 34, color: ORANGE })] }),
  ...entries.flatMap(([title, subs]) => [
    new Paragraph({ spacing: { before: 140, after: 60 }, keepNext: true, children: [t(title, { bold: true, size: 23, color: BRUN })] }),
    ...(subs || []).map((x) => new Paragraph({ spacing: { after: 20 }, indent: { left: 360 }, children: [t(x, { size: 19, color: GRIS })] })),
  ])];

module.exports = { d, t, p, body, bullets, numbered, h1, h2, h3, box, table, figure, cover, document, toc, ORANGE, BRUN, GRIS, TINT, TINT2, CONTENT_W, PageBreak, Paragraph };
