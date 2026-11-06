/**
 * Remise à zéro des données métier puis jeu de démonstration complet, sur
 * l'échelle de notation 1 à 10 en vigueur.
 *
 * Supprimé : clients, groupes d'affaires, dossiers (pièces, propositions), bilans du référentiel,
 * notations, dérogations, lots et planifications de renotation, cours de
 * change, webhooks et outbox, paramétrage (retour aux valeurs par défaut).
 *
 * Les paramètres de l'IA (clés AI_*) sont conservés avec le reste de leur
 * configuration : activation, fournisseur, modèle, adresse.
 *
 * Conservé : comptes utilisateurs et leurs sessions, entités (le seed les
 * recrée ou les met à jour), journal d'audit (en ajout seul : jamais purgé).
 *
 * Usage (les identifiants de la base viennent de l'environnement) :
 *   DATABASE_URL=... DIRECT_URL=... npx tsx scripts/reset-seed.mts            # affiche le plan
 *   DATABASE_URL=... DIRECT_URL=... npx tsx scripts/reset-seed.mts --confirm  # exécute
 *
 * Toute la suppression se fait dans UNE transaction : en cas d'erreur, rien
 * n'est supprimé. Le seed est exécuté ensuite (sinon la base resterait vide :
 * relancer le script).
 */
import { prisma } from "../src/lib/prisma";

const confirm = process.argv.includes("--confirm");

function target(): string {
  try {
    const u = new URL((process.env.DATABASE_URL ?? "").replace(/^DATABASE_URL=/, ""));
    return `${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname} (schéma ${u.searchParams.get("schema") ?? "public"})`;
  } catch {
    return "base inconnue (DATABASE_URL absente ou illisible)";
  }
}

async function counts() {
  const [counterparties, runs, cases, overrides, groups, batches, rates, settings, users, entities] = await Promise.all([
    prisma.counterparty.count(),
    prisma.ratingRun.count(),
    prisma.ratingCase.count(),
    prisma.override.count(),
    prisma.economicGroup.count(),
    prisma.renotationBatch.count(),
    prisma.exchangeRate.count(),
    prisma.appSetting.count({ where: { NOT: { key: { startsWith: "AI_" } } } }),
    prisma.user.count(),
    prisma.entity.count(),
  ]);
  return { counterparties, runs, cases, overrides, groups, batches, rates, settings, users, entities };
}

async function main() {
  console.log(`Base visée : ${target()}\n`);
  const before = await counts();
  console.log("À supprimer :");
  console.log(
    `  ${before.counterparties} client(s), ${before.runs} notation(s), ${before.cases} dossier(s), ${before.overrides} dérogation(s), ` +
      `${before.groups} groupe(s), ${before.batches} lot(s), ${before.rates} cours, ${before.settings} paramètre(s) hors IA`
  );
  console.log(`À conserver : ${before.users} compte(s), ${before.entities} entité(s), paramètres de l'IA, journal d'audit\n`);
  if (!confirm) {
    console.log("Aucune suppression : relancer avec --confirm pour exécuter.");
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.renotationItem.deleteMany();
      await tx.renotationBatch.deleteMany();
      await tx.renotationSchedule.deleteMany();
      await tx.aiProposal.deleteMany();
      await tx.caseDocument.deleteMany();
      await tx.ratingCase.deleteMany();
      await tx.override.deleteMany();
      await tx.ratingRun.deleteMany();
      await tx.committeeDecision.deleteMany();
      await tx.financialStatement.deleteMany();
      await tx.counterparty.deleteMany();
      await tx.economicGroup.deleteMany();
      await tx.webhookDelivery.deleteMany();
      await tx.webhookSubscription.deleteMany();
      await tx.outboxEvent.deleteMany();
      await tx.exchangeRate.deleteMany();
      await tx.appSetting.deleteMany({ where: { NOT: { key: { startsWith: "AI_" } } } });
    },
    { timeout: 120_000 }
  );
  console.log("Données métier supprimées.\n");

  // Le seed s'exécute à l'import ; il rétablit les entités puis les notations.
  await import("../prisma/seed");
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
