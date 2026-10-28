/**
 * Renotation par lot depuis la console — pour un déploiement sur les serveurs
 * de la banque, où la tâche planifiée est une entrée crontab plutôt que Vercel
 * Cron.
 *
 * Usage :
 *   npm run renotation:run                 # planifications échues + lots en cours, jusqu'au bout
 *   npm run renotation:run -- --budget 600 # s'arrête après 600 s (reprise au prochain passage)
 *
 * Exemple crontab (tous les jours à 3 h) :
 *   0 3 * * * cd /opt/notation && npm run renotation:run >> /var/log/notation/renotation.log 2>&1
 *
 * Chaque lot s'exécute dans le périmètre de la personne qui l'a lancé ou
 * planifié ; le traitement est reprenable et ne note jamais deux fois une
 * contrepartie.
 */
import { parseArgs } from "node:util";
import { runScheduler } from "../src/lib/renotation";
import { prisma } from "../src/lib/prisma";

const { values } = parseArgs({ options: { budget: { type: "string" } } });
const budgetS = values.budget ? Number(values.budget) : Infinity;
const started = Date.now();

async function main() {
  let pass = 0;
  for (;;) {
    pass += 1;
    const left = budgetS === Infinity ? 600_000 : Math.max(0, budgetS * 1000 - (Date.now() - started));
    if (left < 5_000) break;
    const r = await runScheduler(new Date(), left);
    for (const id of r.created) console.log(`[renotation] lot créé ${id}`);
    for (const p of r.progressed) console.log(`[renotation] lot ${p.id} : ${p.processed}/${p.total} (${p.status})`);
    if (r.progressed.every((p) => p.status === "DONE" || p.status === "CANCELLED")) break;
    if (pass > 10_000) break;
  }
}

main()
  .catch((e) => {
    console.error("[renotation]", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
