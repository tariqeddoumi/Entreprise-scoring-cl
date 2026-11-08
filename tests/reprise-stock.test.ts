import { describe, expect, it } from "vitest";
import { groupBilans, parseWorkbook, sheetKind, toAmount, toIsoDate } from "@/reference/stock-import";
import { readXlsx, writeWorkbook } from "@/lib/xlsx";

const T = "2026-11-08";

describe("Reprise du stock : lecture du classeur", () => {
  it("feuilles reconnues sans casse ni accent ; dates et montants tolérants", () => {
    expect(sheetKind("clients")).toBe("CLIENTS");
    expect(sheetKind("WATCH LIST")).toBe("WATCHLIST");
    expect(sheetKind("Lisez-moi")).toBeNull();
    expect(toIsoDate("31/12/2024")).toBe("2024-12-31");
    expect(toIsoDate("45657")).toBe("2024-12-31");
    expect(toIsoDate("2024-13-45")).toBeNull();
    expect(toAmount("1 234 567,50")).toBe(1234567.5);
    expect(toAmount("abc")).toBeNull();
  });

  it("clients : identification par code T24 ou ICE ; ICE contrôlé au Maroc", () => {
    const wb = parseWorkbook(
      [
        {
          name: "Clients",
          rows: [
            ["Code client T24", "Raison sociale *", "ICE", "Entité (code) *", "Pays"],
            ["100245", "Conserverie", "001234567000089", "ca-casa", "MA"],
            ["", "Sans identifiant", "", "CA-CASA", ""],
            ["", "ICE court", "123", "CA-CASA", "MA"],
            ["", "Filiale CI", "CI-998", "CI-ABJ", "CI"],
            ["ABC", "Code alpha", "", "CA-CASA", ""],
            ["", "", "", "", ""],
          ],
        },
      ],
      { today: T }
    );
    expect(wb.clients.map((c) => [c.line, c.value.code, c.value.entity])).toEqual([
      [2, "100245", "CA-CASA"],
      [5, null, "CI-ABJ"],
    ]);
    expect(wb.errors.map((e) => e.line)).toEqual([3, 4, 6]);
  });

  it("notes : échelle, chronologie, doublons du classeur", () => {
    const wb = parseWorkbook(
      [
        {
          name: "Notes",
          rows: [
            ["Client (code T24 ou ICE)", "Date d'arrêté", "Date de validation", "Note (1 à 10 ou DEF1 à DEF3)", "Note d'origine", "Engagement global"],
            ["100245", "2024-12-31", "15/04/2025", "5", "B+", "22 800 000"],
            ["100245", "2024-12-31", "2025-05-01", "6", "", ""],
            ["100245", "2023-12-31", "2023-06-01", "5", "", ""],
            ["100246", "2023-12-31", "2024-04-01", "B", "", ""],
            ["100246", "2022-12-31", "2023-04-01", "def2", "", ""],
            ["100247", "2025-12-31", "2027-01-01", "4", "", ""],
          ],
        },
      ],
      { today: T }
    );
    expect(wb.notes.map((n) => [n.line, n.value.grade, n.value.exposure])).toEqual([
      [2, "5", 22_800_000],
      [6, "DEF2", null],
    ]);
    const msgs = Object.fromEntries(wb.errors.map((e) => [e.line, e.messageFr]));
    expect(msgs[3]).toMatch(/Doublon/);
    expect(msgs[4]).toMatch(/précède/);
    expect(msgs[5]).toMatch(/hors échelle/);
    expect(msgs[7]).toMatch(/future/);
  });

  it("bilans : postes du format en vigueur, regroupement par clôture", () => {
    const wb = parseWorkbook(
      [
        {
          name: "Bilans",
          rows: [
            ["Client (code T24 ou ICE)", "Exercice", "Date de clôture", "Poste (code)", "Montant"],
            ["100245", "2024", "2024-12-31", "CHIFFRE_AFFAIRES", "100000000"],
            ["100245", "2024", "2024-12-31", "resultat_net", "5000000"],
            ["100245", "2023", "2023-12-31", "CHIFFRE_AFFAIRES", "92000000"],
            ["100245", "2023", "2023-12-31", "POSTE_FAUX", "1"],
          ],
        },
      ],
      { today: T, knownPostes: ["CHIFFRE_AFFAIRES", "RESULTAT_NET"] }
    );
    expect(wb.errors.map((e) => [e.line, e.messageFr.slice(0, 20)])).toEqual([[5, "Poste « POSTE_FAUX »"]]);
    const g = groupBilans(wb.bilans);
    expect(g.map((x) => [x.closingDate, x.values])).toEqual([
      ["2024-12-31", { CHIFFRE_AFFAIRES: 100_000_000, RESULTAT_NET: 5_000_000 }],
      ["2023-12-31", { CHIFFRE_AFFAIRES: 92_000_000 }],
    ]);
  });

  it("watch list : ordre des dates ; colonne obligatoire absente signalée", () => {
    const wb = parseWorkbook(
      [
        { name: "Watch list", rows: [["Client (code T24 ou ICE)", "Niveau", "Date d'entrée", "Date de sortie"], ["100245", "wl1", "2024-06-01", "2025-03-01"], ["100245", "WL2", "2025-06-01", "2025-01-01"]] },
        { name: "Notes", rows: [["Client (code T24 ou ICE)", "Note (1 à 10 ou DEF1 à DEF3)"]] },
      ],
      { today: T }
    );
    expect(wb.watchlist.map((w) => [w.value.level, w.value.exitDate])).toEqual([["WL1", "2025-03-01"]]);
    expect(wb.errors.map((e) => [e.sheet, e.messageFr.slice(0, 22)])).toEqual([
      ["WATCHLIST", "La sortie précède l'en"],
      ["NOTES", "Colonne(s) obligatoire"],
    ]);
  });

  it("aller-retour Excel : le modèle écrit se relit", () => {
    const bytes = writeWorkbook([
      { name: "Lisez-moi", rows: [[{ value: "texte" }]], widths: [20] },
      { name: "Notes", rows: [[{ value: "Client (code T24 ou ICE) *" }, { value: "Date d'arrêté *" }, { value: "Date de validation *" }, { value: "Note (1 à 10 ou DEF1 à DEF3) *" }], [{ value: "100245" }, { value: "2024-12-31" }, { value: "2025-04-15" }, { value: 5 }]], widths: [20, 20, 20, 20], freezeRows: 1 },
    ]);
    const sheets = readXlsx(bytes);
    expect(sheets.map((s) => s.name)).toEqual(["Lisez-moi", "Notes"]);
    const wb = parseWorkbook(sheets, { today: T });
    expect(wb.notes.map((n) => n.value.grade)).toEqual(["5"]);
  });
});
