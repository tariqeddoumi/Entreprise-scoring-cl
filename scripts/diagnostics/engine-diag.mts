/** Sonde de robustesse du moteur : cherche des comportements non désirés. */
import { computeRating } from "../../src/core/engine.js";
import { CORP_STD_V1 } from "../../src/models/index.js";
import type { RatingInput } from "../../src/core/types.js";

const base = (): RatingInput => ({
  modelId: "CORP_STD_V1",
  segment: "PME",
  asOfDate: "2026-08-19",
  confidence: { completeness: 100, freshness: 100, reliability: 100, provenance: 100 },
  criteria: Object.fromEntries(
    CORP_STD_V1.criteria
      .filter((c) => (c.weightsBps.PME ?? 0) > 0)
      .map((c) => [
        c.code,
        c.type === "QUANTITATIVE"
          ? { status: "AVAILABLE" as const, value: c.direction === "LOWER_IS_BETTER" ? 0 : 1000 }
          : { status: "AVAILABLE" as const, score: 100 as const },
      ])
  ),
});

const ref = computeRating(CORP_STD_V1, base());
console.log(`Référence (tout au maximum) : score ${ref.rawScore?.toFixed(2)} grade ${ref.finalGrade}`);

console.log("\n=== SONDE 1 : cas spécial arbitraire sur un critère qui n'en déclare aucun ===");
const i1 = base();
i1.criteria["D4.2"] = { status: "AVAILABLE", specialCase: "N_IMPORTE_QUOI" };
const r1 = computeRating(CORP_STD_V1, i1);
const c1 = r1.domainResults.flatMap(d => d.criteria).find(c => c.code === "D4.2");
console.log(`D4.2 déclare des cas spéciaux ? ${CORP_STD_V1.criteria.find(c=>c.code==="D4.2")?.specialCases ? "oui" : "NON"}`);
console.log(`Score obtenu avec un cas spécial inventé : ${c1?.score} (attendu : refus)`);
if (c1?.score === 0) console.log("  >>> FAILLE : un client peut forcer un score 0 sur n'importe quel critère");

console.log("\n=== SONDE 2 : red flag déclaré incohérent avec les données ===");
const i2 = base();
i2.redFlags = ["RF06"]; // DPD >= seuil de défaut, alors que D3.1 = 0 jour
const r2 = computeRating(CORP_STD_V1, i2);
const dpd = r2.domainResults.flatMap(d=>d.criteria).find(c=>c.code==="D3.1");
console.log(`D3.1 (DPD) score ${dpd?.score} mais RF06 « DPD >= seuil de défaut » déclaré`);
console.log(`Résultat : ${r2.outcome}, aucune incohérence signalée ? ${r2.warningsFr.length === 0 ? "AUCUNE ALERTE" : r2.warningsFr.join("; ")}`);

console.log("\n=== SONDE 3 : score qualitatif hors ancrage passé directement au moteur ===");
const i3 = base();
i3.criteria["D4.2"] = { status: "AVAILABLE", score: 33 as never };
try {
  computeRating(CORP_STD_V1, i3);
  console.log("  >>> le moteur a accepté un score 33");
} catch (e) {
  console.log(`  moteur : rejet correct (${e instanceof Error ? e.message.slice(0,60) : e})`);
}

console.log("\n=== SONDE 4 : monotonie globale sur chaque critère quantitatif ===");
let nonMono = 0;
for (const c of CORP_STD_V1.criteria.filter(c => c.type === "QUANTITATIVE" && (c.weightsBps.PME ?? 0) > 0)) {
  const bins = c.binsBySegment?.PME ?? c.binsBySegment?.ALL;
  if (!bins) continue;
  const pts = [...new Set(bins.flatMap(b => [b.min, b.max]).filter((v): v is number => v !== null))].sort((a,b)=>a-b);
  const probes = pts.flatMap(p => [p - 0.001, p, p + 0.001]);
  let prev: number | null = null;
  let dir: "up" | "down" | null = null;
  for (const v of probes) {
    const inp = base();
    inp.criteria[c.code] = { status: "AVAILABLE", value: v };
    const s = computeRating(CORP_STD_V1, inp).rawScore!;
    if (prev !== null) {
      const d = s > prev ? "up" : s < prev ? "down" : null;
      if (d && dir && d !== dir) { nonMono++; console.log(`  ${c.code} : non monotone autour de ${v}`); break; }
      if (d) dir = d;
    }
    prev = s;
  }
}
console.log(nonMono === 0 ? "  toutes monotones" : `  ${nonMono} critère(s) non monotone(s)`);

console.log("\n=== SONDE 5 : explicabilité — codes de raison normalisés ? ===");
console.log(`Le résultat expose-t-il des codes stables ? ${"reasonCodes" in ref ? "oui" : "NON — seulement du texte libre"}`);
console.log(`Exemple d'explication : "${ref.domainResults[0].criteria[0].explanationFr.slice(0, 70)}..."`);
