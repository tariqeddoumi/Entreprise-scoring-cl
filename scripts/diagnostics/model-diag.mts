import { CORP_STD_V1, CORP_TPE_BEHAV_V1 } from "../../src/models/index.js";
import type { ModelConfig } from "../../src/core/types.js";

const issues: string[] = [];
const warn = (s: string) => issues.push(s);

function diag(m: ModelConfig) {
  console.log(`\n### ${m.modelId}`);
  const segs = m.segments;

  // 1. Répartition quantitatif / qualitatif par domaine
  console.log("\nPart qualitative par domaine (poids qualitatif / poids total) :");
  for (const d of m.domains) {
    for (const s of segs) {
      const crits = m.criteria.filter(c => c.domainCode === d.code && (c.weightsBps[s] ?? 0) > 0);
      const total = crits.reduce((a, c) => a + (c.weightsBps[s] ?? 0), 0);
      if (total === 0) continue;
      const qual = crits.filter(c => c.type === "QUALITATIVE").reduce((a, c) => a + (c.weightsBps[s] ?? 0), 0);
      const pct = (qual / total) * 100;
      if (s === segs[0]) console.log(`  ${d.code} ${s}: ${pct.toFixed(0)}% qualitatif (${crits.length} critères)`);
      if (pct === 100 && crits.length > 2) {
        warn(`${m.modelId} ${d.code}/${s} : 100 % qualitatif sur ${crits.length} critères — aucun ancrage chiffré vérifiable`);
      }
    }
  }

  // 2. Critères critiques
  const critical = m.criteria.filter(c => c.critical);
  console.log(`\nCritères critiques (blocage si absent) : ${critical.map(c => c.code).join(", ") || "aucun"}`);

  // 3. Poids max d'un critère
  for (const s of segs) {
    const max = m.criteria.reduce((mx, c) => Math.max(mx, c.weightsBps[s] ?? 0), 0);
    const top = m.criteria.find(c => (c.weightsBps[s] ?? 0) === max);
    console.log(`Poids max ${s} : ${(max/100).toFixed(2)} % (${top?.code})`);
    if (max > 600) warn(`${m.modelId} ${s} : ${top?.code} pèse ${(max/100).toFixed(2)} % — au-delà du plafond de 6 % annoncé`);
  }

  // 4. specialCase : déclarés dans le modèle mais non typés
  const withSpecial = m.criteria.filter(c => c.specialCases?.length);
  console.log(`\nCritères à cas spéciaux : ${withSpecial.length}`);

  // 5. Red flags jamais reliés à un critère
  console.log(`Red flags : ${m.redFlags.length}, caps : ${m.structuralCaps.length}`);

  // 6. Couverture des triggers de cap
  console.log(`Triggers de cap : ${m.structuralCaps.map(c => c.trigger).join(", ")}`);
}

diag(CORP_STD_V1);
diag(CORP_TPE_BEHAV_V1);

console.log("\n\n=== CONSTATS ===");
issues.forEach((i, n) => console.log(`${n + 1}. ${i}`));
