/**
 * Reprise du stock : lecture et contrôle d'un classeur d'import (clients,
 * notes historiques, bilans, watch list). Calculs purs, sans base : le
 * rapprochement avec les données existantes et l'écriture sont dans
 * src/lib/stock-import.ts.
 *
 * Règles :
 *  - en-têtes reconnus sans tenir compte de la casse, des accents ni de
 *    l'astérisque ; colonnes inconnues ignorées ; lignes vides ignorées ;
 *  - dates AAAA-MM-JJ, JJ/MM/AAAA ou numéro de série Excel ;
 *  - montants avec espaces et virgule décimale acceptés ;
 *  - une ligne invalide est écartée avec son motif, les autres restent
 *    importables.
 */

export const STOCK_SHEETS = {
  CLIENTS: "Clients",
  NOTES: "Notes",
  BILANS: "Bilans",
  WATCHLIST: "Watch list",
} as const;
export type StockSheet = keyof typeof STOCK_SHEETS;

/** Colonnes de chaque feuille : clé interne, en-tête du modèle, obligatoire. */
export const STOCK_COLUMNS: Record<StockSheet, Array<{ key: string; header: string; required?: boolean; example: string }>> = {
  CLIENTS: [
    { key: "code", header: "Code client T24", example: "100245" },
    { key: "name", header: "Raison sociale", required: true, example: "CONSERVERIE ATLANTIQUE SA" },
    { key: "ice", header: "ICE", example: "001234567000089" },
    { key: "rc", header: "RC", example: "12345 Casablanca" },
    { key: "legalForm", header: "Forme juridique", example: "SA" },
    { key: "sectorCode", header: "Secteur", example: "C10" },
    { key: "commercialSegment", header: "Segment commercial", example: "PME" },
    { key: "entity", header: "Entité (code)", required: true, example: "CA-CASA" },
    { key: "accountOfficer", header: "Gestionnaire", example: "CA0107" },
    { key: "country", header: "Pays", example: "MA" },
    { key: "currency", header: "Devise", example: "MAD" },
  ],
  NOTES: [
    { key: "client", header: "Client (code T24 ou ICE)", required: true, example: "100245" },
    { key: "asOfDate", header: "Date d'arrêté", required: true, example: "2024-12-31" },
    { key: "validatedOn", header: "Date de validation", required: true, example: "2025-04-15" },
    { key: "grade", header: "Note (1 à 10 ou DEF1 à DEF3)", required: true, example: "5" },
    { key: "originalGrade", header: "Note d'origine", example: "B+" },
    { key: "originalModel", header: "Modèle d'origine", example: "Grille CDC 2007" },
    { key: "segment", header: "Segment", example: "PME" },
    { key: "exposure", header: "Engagement global", example: "22800000" },
    { key: "comment", header: "Commentaire", example: "Note du comité du 15/04/2025" },
  ],
  BILANS: [
    { key: "client", header: "Client (code T24 ou ICE)", required: true, example: "100245" },
    { key: "fiscalYear", header: "Exercice", required: true, example: "2024" },
    { key: "closingDate", header: "Date de clôture", required: true, example: "2024-12-31" },
    { key: "poste", header: "Poste (code)", required: true, example: "CHIFFRE_AFFAIRES" },
    { key: "amount", header: "Montant", required: true, example: "100000000" },
  ],
  WATCHLIST: [
    { key: "client", header: "Client (code T24 ou ICE)", required: true, example: "100245" },
    { key: "level", header: "Niveau", example: "WL1" },
    { key: "entryDate", header: "Date d'entrée", required: true, example: "2024-06-01" },
    { key: "exitDate", header: "Date de sortie", example: "2025-03-01" },
    { key: "motif", header: "Motif", example: "Retards de paiement" },
    { key: "reference", header: "Référence du procès-verbal", example: "PV-2024-06-12" },
  ],
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export function sheetKind(name: string): StockSheet | null {
  const n = norm(name);
  for (const [k, v] of Object.entries(STOCK_SHEETS) as Array<[StockSheet, string]>) if (n === norm(v)) return k;
  if (n === "watchlist" || n === "wl") return "WATCHLIST";
  return null;
}

export function toIsoDate(v: string): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s.slice(0, 10)) && !Number.isNaN(Date.parse(s.slice(0, 10)))) return s.slice(0, 10);
  const fr = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (fr) {
    const iso = `${fr[3]}-${fr[2].padStart(2, "0")}-${fr[1].padStart(2, "0")}`;
    return Number.isNaN(Date.parse(iso)) ? null : iso;
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

export function toAmount(v: string): number | null {
  const s = (v ?? "").replace(/[\s  ]/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export const GRADES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "DEF1", "DEF2", "DEF3"];

export interface RowError {
  sheet: StockSheet;
  line: number;
  messageFr: string;
}

export interface ParsedRow<T> {
  line: number;
  value: T;
}

export interface ClientRow {
  code: string | null;
  name: string;
  ice: string | null;
  rc: string | null;
  legalForm: string | null;
  sectorCode: string | null;
  commercialSegment: string | null;
  entity: string;
  accountOfficer: string | null;
  country: string | null;
  currency: string | null;
}
export interface NoteRow {
  client: string;
  asOfDate: string;
  validatedOn: string;
  grade: string;
  originalGrade: string | null;
  originalModel: string | null;
  segment: string | null;
  exposure: number | null;
  comment: string | null;
}
export interface BilanRow {
  client: string;
  fiscalYear: string;
  closingDate: string;
  poste: string;
  amount: number;
}
export interface WatchlistRow {
  client: string;
  level: string | null;
  entryDate: string;
  exitDate: string | null;
  motif: string | null;
  reference: string | null;
}

export interface ParsedWorkbook {
  clients: ParsedRow<ClientRow>[];
  notes: ParsedRow<NoteRow>[];
  bilans: ParsedRow<BilanRow>[];
  watchlist: ParsedRow<WatchlistRow>[];
  errors: RowError[];
  /** Feuilles reconnues. */
  sheets: StockSheet[];
}

const opt = (v: string | undefined, max = 200) => {
  const s = (v ?? "").trim();
  return s ? s.slice(0, max) : null;
};

/** Lecture d'un classeur (feuilles déjà extraites en texte). */
export function parseWorkbook(sheets: Array<{ name: string; rows: string[][] }>, opts: { knownPostes?: string[]; today: string }): ParsedWorkbook {
  const out: ParsedWorkbook = { clients: [], notes: [], bilans: [], watchlist: [], errors: [], sheets: [] };
  for (const sh of sheets) {
    const kind = sheetKind(sh.name);
    if (!kind) continue;
    out.sheets.push(kind);
    const cols = STOCK_COLUMNS[kind];
    const headerIdx = sh.rows.findIndex((r) => r.some((c) => (c ?? "").trim()));
    if (headerIdx < 0) continue;
    const header = sh.rows[headerIdx].map((h) => norm(h ?? ""));
    const index: Record<string, number> = {};
    for (const c of cols) {
      const i = header.indexOf(norm(c.header));
      if (i >= 0) index[c.key] = i;
    }
    const missingCols = cols.filter((c) => c.required && index[c.key] === undefined);
    if (missingCols.length) {
      out.errors.push({ sheet: kind, line: headerIdx + 1, messageFr: `Colonne(s) obligatoire(s) absente(s) : ${missingCols.map((c) => c.header).join(", ")}.` });
      continue;
    }
    for (let r = headerIdx + 1; r < sh.rows.length; r++) {
      const row = sh.rows[r] ?? [];
      if (!row.some((c) => (c ?? "").trim())) continue;
      const line = r + 1;
      const get = (k: string) => (index[k] === undefined ? "" : (row[index[k]] ?? "").trim());
      const err = (m: string) => out.errors.push({ sheet: kind, line, messageFr: m });
      const missing = cols.filter((c) => c.required && !get(c.key)).map((c) => c.header);
      if (missing.length) {
        err(`Valeur(s) obligatoire(s) manquante(s) : ${missing.join(", ")}.`);
        continue;
      }
      if (kind === "CLIENTS") {
        const code = opt(get("code"), 20);
        const ice = opt(get("ice"), 20)?.replace(/\s/g, "") ?? null;
        if (code && !/^\d{1,20}$/.test(code)) {
          err("Code client T24 numérique attendu.");
          continue;
        }
        if (!code && !ice) {
          err("Code client T24 ou ICE requis (identification du client).");
          continue;
        }
        const country = opt(get("country"), 2)?.toUpperCase() ?? null;
        const currency = opt(get("currency"), 3)?.toUpperCase() ?? null;
        if (ice && (country ?? "MA") === "MA" && !/^\d{15}$/.test(ice)) {
          err("L'ICE compte 15 chiffres.");
          continue;
        }
        out.clients.push({
          line,
          value: {
            code,
            name: get("name").slice(0, 300),
            ice,
            rc: opt(get("rc"), 30),
            legalForm: opt(get("legalForm"), 60),
            sectorCode: opt(get("sectorCode"), 30),
            commercialSegment: opt(get("commercialSegment"), 40)?.toUpperCase() ?? null,
            entity: get("entity").toUpperCase(),
            accountOfficer: opt(get("accountOfficer"), 40),
            country: country && /^[A-Z]{2}$/.test(country) ? country : null,
            currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
          },
        });
      } else if (kind === "NOTES") {
        const asOfDate = toIsoDate(get("asOfDate"));
        const validatedOn = toIsoDate(get("validatedOn"));
        const grade = get("grade").toUpperCase().replace(/\s/g, "");
        if (!asOfDate || !validatedOn) {
          err("Date d'arrêté ou de validation illisible.");
          continue;
        }
        if (validatedOn < asOfDate) {
          err("La validation précède la date d'arrêté.");
          continue;
        }
        if (validatedOn > opts.today) {
          err("Date de validation future.");
          continue;
        }
        if (!GRADES.includes(grade)) {
          err(`Note « ${get("grade")} » hors échelle (1 à 10, DEF1 à DEF3) : convertissez la note d'origine selon la table de correspondance.`);
          continue;
        }
        const exposure = get("exposure") ? toAmount(get("exposure")) : null;
        if (get("exposure") && (exposure === null || exposure < 0)) {
          err("Engagement global illisible ou négatif.");
          continue;
        }
        out.notes.push({
          line,
          value: {
            client: get("client").replace(/\s/g, ""),
            asOfDate,
            validatedOn,
            grade,
            originalGrade: opt(get("originalGrade"), 20),
            originalModel: opt(get("originalModel"), 60),
            segment: opt(get("segment"), 10)?.toUpperCase() ?? null,
            exposure,
            comment: opt(get("comment"), 300),
          },
        });
      } else if (kind === "BILANS") {
        const closingDate = toIsoDate(get("closingDate"));
        const amount = toAmount(get("amount"));
        const poste = get("poste").toUpperCase();
        if (!closingDate) {
          err("Date de clôture illisible.");
          continue;
        }
        if (amount === null) {
          err("Montant illisible.");
          continue;
        }
        if (opts.knownPostes && !opts.knownPostes.includes(poste)) {
          err(`Poste « ${poste} » inconnu du format de bilan en vigueur.`);
          continue;
        }
        out.bilans.push({ line, value: { client: get("client").replace(/\s/g, ""), fiscalYear: get("fiscalYear").slice(0, 10), closingDate, poste, amount } });
      } else {
        const entryDate = toIsoDate(get("entryDate"));
        const exitDate = get("exitDate") ? toIsoDate(get("exitDate")) : null;
        if (!entryDate || (get("exitDate") && !exitDate)) {
          err("Date d'entrée ou de sortie illisible.");
          continue;
        }
        if (exitDate && exitDate < entryDate) {
          err("La sortie précède l'entrée.");
          continue;
        }
        if (entryDate > opts.today || (exitDate && exitDate > opts.today)) {
          err("Date future.");
          continue;
        }
        out.watchlist.push({
          line,
          value: {
            client: get("client").replace(/\s/g, ""),
            level: opt(get("level"), 10)?.toUpperCase() ?? null,
            entryDate,
            exitDate,
            motif: opt(get("motif"), 500),
            reference: opt(get("reference"), 80),
          },
        });
      }
    }
  }
  // Doublons internes au classeur.
  const seen = new Set<string>();
  out.notes = out.notes.filter((n) => {
    const k = `${n.value.client}|${n.value.asOfDate}`;
    if (seen.has(k)) {
      out.errors.push({ sheet: "NOTES", line: n.line, messageFr: "Doublon dans le classeur : même client et même date d'arrêté." });
      return false;
    }
    seen.add(k);
    return true;
  });
  return out;
}

/** Bilans regroupés par client et date de clôture (une ligne par poste dans le classeur). */
export function groupBilans(rows: ParsedRow<BilanRow>[]): Array<{ client: string; fiscalYear: string; closingDate: string; values: Record<string, number>; lines: number[] }> {
  const map = new Map<string, { client: string; fiscalYear: string; closingDate: string; values: Record<string, number>; lines: number[] }>();
  for (const r of rows) {
    const k = `${r.value.client}|${r.value.closingDate}`;
    const g = map.get(k) ?? { client: r.value.client, fiscalYear: r.value.fiscalYear, closingDate: r.value.closingDate, values: {}, lines: [] };
    g.values[r.value.poste] = r.value.amount;
    g.lines.push(r.line);
    map.set(k, g);
  }
  return [...map.values()];
}
