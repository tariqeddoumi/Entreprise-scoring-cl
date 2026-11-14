/**
 * Jeu de démonstration COMPLET, en complément du seed de base (prisma/seed.ts :
 * entités, 10 clients notés par le moteur, dérogations).
 *
 * Ajoute de quoi faire vivre tous les écrans :
 *  - 2 centres d'affaires (Casablanca, Rabat) sous la banque de démonstration ;
 *  - 60 clients fictifs « Société démo NN », signalétique par les listes de
 *    saisie (formes juridiques, secteurs NMAE, villes), deux sur trois
 *    rattachés à T24, un tiers en saisie minimale ;
 *  - 24 mois d'historique de notes (reprise du stock) pour la surveillance :
 *    migrations, défauts, notes expirées, engagement global enregistré ;
 *  - watch list (entrées et sorties en comité) ;
 *  - lignes d'engagement T24, lignes saisies, et des cas de rapprochement
 *    (lignes à rapprocher, rapprochées, gardées) ;
 *  - bilans du référentiel (deux exercices équilibrés) ;
 *  - dossiers décidés (délais d'instruction, rejets) ;
 *  - un groupe d'affaires et des cours de change.
 *
 * Identifiants déterministes préfixés « demo_ » : le script est rejouable
 * sans doublon et n'efface jamais rien (pas de suppression).
 *
 * Usage :
 *   DATABASE_URL=... DIRECT_URL=... npx tsx prisma/seed.ts
 *   DATABASE_URL=... DIRECT_URL=... npx tsx scripts/seed-complet.mts
 */
import { prisma } from "../src/lib/prisma";
import { DEFAULT_CITIES, DEFAULT_LEGAL_FORMS, DEFAULT_SECTORS } from "../src/reference/entry-lists";

// Générateur de Park et Miller : calcul entier exact (produit < 2^53), donc
// reproduit à l'identique par la version SQL (prisma/sql/18-seed-complet.sql).
let seed = 42;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const round = (x: number) => Math.floor(x + 0.5);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addM = (d: Date, m: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m, Math.min(d.getUTCDate(), 28)));
const pad = (n: number) => String(n).padStart(2, "0");
const BY = "seed-complet";

const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), Math.min(new Date().getUTCDate(), 28)));
const bank = await prisma.entity.findUnique({ where: { id: "ent_demo_maroc" } });
if (!bank) throw new Error("Entité ent_demo_maroc absente : lancez d'abord prisma/seed.ts.");

// --- Centres d'affaires ----------------------------------------------------------
const centres = [
  { id: "ent_ca_casa", code: "CA-CASA", name: "Centre d'affaires Casablanca" },
  { id: "ent_ca_rabat", code: "CA-RABAT", name: "Centre d'affaires Rabat" },
];
for (const c of centres) {
  await prisma.entity.upsert({
    where: { id: c.id },
    update: {},
    create: { ...c, type: "BUSINESS_CENTER", parentId: bank.id, path: `${bank.path}${c.id}/`, level: bank.level + 1, country: "MA", currency: "MAD" },
  });
}

// --- Cours de change ----------------------------------------------------------------
const fxDate = iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
for (const [currency, rate] of [["EUR", 10.85], ["USD", 9.96], ["XOF", 0.01654]] as const) {
  await prisma.exchangeRate.upsert({
    where: { currency_effectiveDate: { currency, effectiveDate: fxDate } },
    update: {},
    create: { id: `demo_fx_${currency}_${fxDate}`, currency, effectiveDate: fxDate, rate, source: "Démonstration (cours indicatif)", createdBy: BY },
  });
}

// --- Groupe d'affaires --------------------------------------------------------------
const group = await prisma.economicGroup.upsert({
  where: { entityId_code: { entityId: bank.id, code: "GRP-DEMO-ATLAS" } },
  update: {},
  create: { id: "demo_grp_atlas", code: "GRP-DEMO-ATLAS", name: "Groupe Atlas Démonstration (fictif)", entityId: bank.id, createdBy: BY },
});

// --- Clients, historique, watch list, engagements, bilans, dossiers ---------------
const legalForms = DEFAULT_LEGAL_FORMS.filter((x) => ["SA", "SARL", "SARL_AU", "SAS"].includes(x.code)).map((x) => x.code);
const sectors = DEFAULT_SECTORS.filter((x) => ["NMAE_C", "NMAE_F", "NMAE_G", "NMAE_H", "NMAE_I", "NMAE_J"].includes(x.code)).map((x) => x.code);
const cities = DEFAULT_CITIES.slice(0, 10).map((x) => x.labelFr);
const segs = ["TPE", "PME", "PME", "GE"] as const;
const officers = ["CA0101", "CA0107", "CA0203", "CA0310"];
let created = 0;
let runs = 0;

for (let i = 0; i < 60; i++) {
  const n = pad(i + 1);
  const id = `demo_cp_${n}`;
  const seg = pick(segs);
  const entityId = pick(["ent_ca_casa", "ent_ca_rabat", bank.id]);
  const start = addM(today, -26 + Math.floor(rnd() * 6));
  const inT24 = i % 3 !== 2;
  const expo = round((seg === "GE" ? 80 + rnd() * 400 : seg === "PME" ? 10 + rnd() * 60 : 1 + rnd() * 6) * 1e6);
  // Tirages faits avant tout test d'existence : la suite pseudo-aléatoire
  // reste identique d'une exécution à l'autre (script rejouable sans écart).
  const legalForm = pick(legalForms), sectorCode = pick(sectors), city = pick(cities), officer = pick(officers);
  const exists = await prisma.counterparty.findUnique({ where: { id }, select: { id: true } });
  if (!exists) {
    await prisma.counterparty.create({
      data: {
        id,
        name: `Société démo ${n} (fictive)`,
        entityId,
        country: "MA",
        currency: "MAD",
        ice: `9${String(100000000000000 + i * 7919).slice(1)}`,
        rc: `${10000 + i * 37}`,
        legalForm,
        sectorCode,
        city,
        segment: seg,
        commercialSegment: seg,
        accountOfficer: officer,
        dataSource: inT24 ? "T24" : "SAISIE",
        coreBankingId: inT24 ? String(200100 + i) : null,
        coreBankingSyncedAt: inT24 ? today : null,
        economicGroupId: i < 4 ? group.id : null,
        createdAt: addM(start, -1),
      },
    });
    created++;
  }

  // Historique des notes (marche aléatoire) : reprise du stock.
  let g = 2 + Math.floor(rnd() * 7);
  const dates: Date[] = [];
  let d = i >= 54 ? addM(today, -8) : start;
  while (d <= today) {
    dates.push(d);
    d = i >= 48 && i < 54 ? addM(d, 30) : addM(d, 11 + Math.floor(rnd() * 3));
  }
  for (const [k, dt] of dates.entries()) {
    if (k > 0) {
      const r = rnd();
      g = Math.max(1, Math.min(11, g + (r < 0.18 ? -1 : r < 0.62 ? 0 : r < 0.85 ? 1 : r < 0.95 ? 2 : 3)));
    }
    const grade = g >= 11 ? "DEF1" : String(g);
    const asOf = iso(addM(dt, -3));
    const exposure = round(expo * (0.9 + 0.2 * rnd()));
    const runId = `demo_run_${n}_${k}`;
    const has = await prisma.ratingRun.findUnique({ where: { id: runId }, select: { id: true } });
    if (!has) {
      await prisma.ratingRun.create({
        data: {
          id: runId,
          counterpartyId: id,
          modelId: "REPRISE_STOCK",
          modelVersion: "historique",
          engineVersion: "reprise",
          asOfDate: asOf,
          segment: seg,
          outcome: g >= 11 ? "DEFAULTED" : "RATED",
          engineGrade: grade,
          cappedGrade: grade,
          finalGrade: grade,
          inputSnapshot: JSON.stringify({ source: "REPRISE_STOCK", noteOrigine: grade, modeleOrigine: "Démonstration", commentaire: "Historique fictif de démonstration", segmentationData: { globalBankExposure: exposure } }),
          resultSnapshot: JSON.stringify({ source: "REPRISE_STOCK" }),
          exposureBase: exposure,
          requestedBy: BY,
          origin: "REPRISE",
          idempotencyKey: `demo:${id}:${asOf}`,
          createdAt: dt,
        },
      });
      runs++;
    }
  }

  // Watch list.
  const wl: Array<{ id: string; kind: string; level?: string; date: Date; reference: string; motif: string }> = [];
  if (g >= 8 && g < 11 && rnd() < 0.8) {
    wl.push({ id: `demo_wl_${n}_e`, kind: "WL_ENTREE", level: g >= 10 ? "WL3" : g === 9 ? "WL2" : "WL1", date: addM(today, -(2 + Math.floor(rnd() * 7))), reference: `PV-DEMO-${n}`, motif: "Dégradation de la situation financière" });
  }
  if (i % 7 === 0) {
    const ent = addM(today, -20);
    wl.push({ id: `demo_wl_${n}_a`, kind: "WL_ENTREE", level: "WL1", date: ent, reference: `PV-DEMO-A${n}`, motif: "Retards de paiement répétés" });
    wl.push({ id: `demo_wl_${n}_b`, kind: "WL_SORTIE", date: addM(ent, 6), reference: `PV-DEMO-B${n}`, motif: "Régularisation des impayés" });
  }
  if (wl.length)
    await prisma.committeeDecision.createMany({
      skipDuplicates: true,
      data: wl.map((w) => ({ id: w.id, counterpartyId: id, kind: w.kind, level: w.level ?? null, committeeDate: iso(w.date), reference: w.reference, motif: w.motif, effectiveDate: iso(w.date), status: "EFFECTIVE", recordedBy: BY })),
    });

  // Lignes d'engagement : T24 (deux clients sur trois), saisie, rapprochement.
  const auth = round(expo * 0.9);
  const used = round(auth * (0.5 + rnd() * 0.65));
  const late = g >= 8 && rnd() < 0.5;
  const lines: Array<Record<string, unknown>> = [];
  if (inT24) {
    lines.push(
      { id: `demo_fac_${n}_1`, source: "API", reference: `${200100 + i}.0001`, typeCode: "FACILITE_CAISSE", authorized: round(auth * 0.3), outstanding: round(used * 0.3), guarantees: "Caution personnelle des dirigeants" },
      { id: `demo_fac_${n}_2`, source: "API", reference: `${200100 + i}.0002`, typeCode: "CMT", authorized: round(auth * 0.6), outstanding: round(used * 0.6), overdue: late ? round(used * 0.05) : 0, overdueDays: late ? 30 + Math.floor(rnd() * 200) : null, guarantees: "Nantissement du matériel" },
      { id: `demo_fac_${n}_3`, source: "API", reference: `${200100 + i}.0003`, typeCode: "CAUTION_MARCHES", authorized: round(auth * 0.1), outstanding: round(auth * 0.05) }
    );
    // Quelques clients saisis avant leur rattachement : lignes saisies à
    // rapprocher (i % 9 === 1) ou déjà rapprochées et gardées (i % 9 === 4).
    if (i % 9 === 1 || i % 9 === 4) {
      const done = i % 9 === 4;
      lines.push(
        { id: `demo_fac_${n}_m1`, source: "SAISIE", reference: "", typeCode: "FACILITE_CAISSE", authorized: round(auth * 0.3), outstanding: round(used * 0.28), ...(done ? { reconciliation: "RAPPROCHEE", matchedReference: `${200100 + i}.0001`, reconciledBy: BY, reconciledAt: today } : {}) },
        { id: `demo_fac_${n}_m2`, source: "SAISIE", reference: "", typeCode: "DECOUVERT", authorized: round(auth * 0.05), outstanding: round(auth * 0.02), ...(done ? { reconciliation: "CONSERVEE", reconciledBy: BY, reconciledAt: today } : {}) }
      );
    }
  } else if (i % 2 === 0) {
    lines.push(
      { id: `demo_fac_${n}_s1`, source: "SAISIE", reference: "", typeCode: "FACILITE_CAISSE", authorized: round(auth * 0.4), outstanding: round(used * 0.4), guarantees: "Caution personnelle des dirigeants" },
      { id: `demo_fac_${n}_s2`, source: "SAISIE", reference: "", typeCode: "CMT", authorized: round(auth * 0.6), outstanding: round(used * 0.6), guarantees: "Hypothèque" }
    );
  }
  if (lines.length)
    await prisma.creditFacility.createMany({ skipDuplicates: true, data: lines.map((l) => ({ counterpartyId: id, asOfDate: iso(today), recordedBy: BY, ...l })) as never });

  // Bilans du référentiel : deux exercices équilibrés, pour un client sur deux.
  if (i % 2 === 0) {
    const year = today.getUTCFullYear() - 1;
    for (const [k, fy] of [year, year - 1].entries()) {
      const ca = round(expo * (1.6 + rnd()) * (k ? 0.92 : 1));
      const achats = round(ca * 0.55), ext = round(ca * 0.12), perso = round(ca * 0.14), dot = round(ca * 0.04), interets = round(expo * 0.06);
      const avantImpot = ca - achats - ext - perso - dot - interets;
      const impots = Math.max(0, round(avantImpot * 0.3));
      const rn = avantImpot - impots;
      const immo = round(ca * 0.5), stocks = round(ca * 0.15), clients = round(ca * 0.25), tresoA = round(ca * 0.04);
      const actif = immo + stocks + clients + tresoA;
      const capital = round(actif * 0.2), reserves = round(actif * 0.15), dettesFin = round(expo * 0.6), tresoP = round(expo * 0.1);
      const fournisseurs = actif - capital - reserves - rn - dettesFin - tresoP;
      const values: Record<string, number> = {
        IMMO_CORPORELLES: immo, STOCKS: stocks, CREANCES_CLIENTS: clients, TRESORERIE_ACTIF: tresoA, TOTAL_ACTIF_DECLARE: actif,
        CAPITAL: capital, PRIMES_RESERVES: reserves, RESULTAT_EXERCICE_BILAN: rn, DETTES_FINANCEMENT: dettesFin, FOURNISSEURS: fournisseurs, TRESORERIE_PASSIF: tresoP, TOTAL_PASSIF_DECLARE: actif,
        VENTES_BIENS_SERVICES: ca, ACHATS_CONSOMMES: achats, AUTRES_CHARGES_EXTERNES: ext, CHARGES_PERSONNEL: perso, DOTATIONS_EXPLOITATION: dot, CHARGES_INTERETS: interets, IMPOTS_RESULTATS: impots, RESULTAT_NET_DECLARE: rn,
      };
      if (fournisseurs < 0) continue;
      await prisma.financialStatement.upsert({
        where: { counterpartyId_closingDate: { counterpartyId: id, closingDate: `${fy}-12-31` } },
        update: {},
        create: { id: `demo_fs_${n}_${fy}`, counterpartyId: id, fiscalYear: String(fy), closingDate: `${fy}-12-31`, statementModel: seg === "TPE" ? "SIMPLIFIE" : "NORMAL", certified: seg !== "TPE", values: JSON.stringify(Object.fromEntries(Object.entries(values).map(([kk, v]) => [kk, String(v)]))), source: "REPRISE_STOCK", createdBy: BY },
      });
    }
  }

  // Dossiers décidés (délais d'instruction, rejets).
  for (let c = 0; c < 2; c++) {
    const sub = addM(today, -(1 + Math.floor(rnd() * 11)));
    const dec = new Date(sub.getTime() + (3 + Math.floor(rnd() * 25)) * 86400000);
    if (dec > today) continue;
    const caseId = `demo_case_${n}_${c}`;
    const rejected = rnd() < 0.12;
    if (await prisma.ratingCase.findUnique({ where: { id: caseId }, select: { id: true } })) continue;
    await prisma.ratingCase.create({
      data: { id: caseId, counterpartyId: id, modelId: "CORP_STD_V1", asOfDate: iso(sub), status: rejected ? "REJECTED" : "VALIDATED", draftInput: "{}", createdBy: "demo.analyste", submittedBy: "demo.analyste", submittedAt: sub, decidedBy: "demo.validateur", decidedAt: dec, decisionComment: "Dossier fictif de démonstration." },
    });
  }
}

console.log(`Seed complet : ${created} client(s) créé(s), ${runs} notation(s) historique(s) ajoutée(s).`);
await prisma.$disconnect();
