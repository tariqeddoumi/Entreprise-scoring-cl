/**
 * Jeu de démonstration SYNTHÉTIQUE.
 *
 * Les contreparties ci-dessous sont fictives et servent uniquement à la
 * démonstration et aux tests d'intégration. Elles ne doivent jamais être
 * chargées dans un environnement de production — le script refuse d'ailleurs
 * de s'exécuter si NODE_ENV vaut "production".
 *
 * Usage : npm run db:seed
 */
import { PrismaClient } from "../src/generated/prisma/index.js";

const prisma = new PrismaClient();

const COUNTERPARTIES = [
  {
    name: "Société de Démonstration Agroalimentaire (fictive)",
    ice: "DEMO-000000000000001",
    legalForm: "SARL",
    sectorCode: "DEMO-AGRO",
    city: "Casablanca",
    segment: "PME",
  },
  {
    name: "Atelier de Démonstration Textile (fictif)",
    ice: "DEMO-000000000000002",
    legalForm: "SARL AU",
    sectorCode: "DEMO-TEXTILE",
    city: "Fès",
    segment: "TPE",
  },
  {
    name: "Groupe Industriel de Démonstration (fictif)",
    ice: "DEMO-000000000000003",
    legalForm: "SA",
    sectorCode: "DEMO-INDUSTRIE",
    city: "Tanger",
    segment: "GE",
  },
  {
    name: "Distribution de Démonstration (fictive)",
    ice: "DEMO-000000000000004",
    legalForm: "SARL",
    sectorCode: "DEMO-COMMERCE",
    city: "Marrakech",
    segment: "PME",
  },
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refus d'exécuter le jeu de démonstration en production : ces données sont fictives."
    );
  }

  for (const c of COUNTERPARTIES) {
    await prisma.counterparty.upsert({
      where: { ice: c.ice },
      update: {},
      create: c,
    });
  }

  const count = await prisma.counterparty.count();
  console.log(
    `Jeu de démonstration chargé : ${COUNTERPARTIES.length} contreparties fictives (${count} au total).`
  );
  console.log(
    "Aucune notation n'est pré-enregistrée : lancez-les depuis l'interface ou POST /api/v1/rating-runs."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
