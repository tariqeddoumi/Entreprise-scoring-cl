/**
 * Mise en service des raccordements externes (T24, crédit bureau, IA).
 *
 * Au démarrage, toutes les API sont désactivées : l'outil fonctionne en saisie
 * (saisie minimale du client, saisie des lignes d'engagement, rapport chargé ou
 * saisi). Une API ne s'active qu'après un **test de connexion réussi** sur
 * l'adresse paramétrée, fait depuis Administration › Raccordements : le test
 * appelle l'API même désactivée, n'enregistre aucune donnée client et est
 * journalisé. Le dernier test est conservé (clé INTEGRATION_TEST_<code>).
 */
import type { PrismaClient } from "@/generated/prisma";

import { pingAi, aiConfig, missingConfig } from "./ai";
import type { Identity } from "./auth";
import { auditWithin } from "./audit";
import { fetchT24Customer } from "./core-banking";
import { requestCreditBureau } from "./external-data";
import { facilityTotals } from "@/reference/facilities";
import { fetchT24Facilities } from "./facilities";
import { forgetSettings, loadSettings } from "./settings";

export type IntegrationCode = "T24" | "CREDIT_BUREAU" | "AI";

export interface IntegrationDef {
  code: IntegrationCode;
  labelFr: string;
  /** Paramètre d'activation. */
  flag: string;
  /** Paramètres qui définissent la cible : un test ne vaut que pour eux. */
  targetKeys: string[];
  /** Variable d'environnement du jeton (jamais affichée, seulement sa présence). */
  tokenEnv: string[];
  sampleLabelFr: string | null;
  helpFr: string;
}

export const INTEGRATIONS: IntegrationDef[] = [
  {
    code: "T24",
    labelFr: "T24 — fiche client et engagements",
    flag: "T24_ENABLED",
    targetKeys: ["T24_BASE_URL", "T24_CUSTOMER_PATH", "T24_FACILITIES_PATH"],
    tokenEnv: ["T24_API_TOKEN"],
    sampleLabelFr: "Code client T24 de test",
    helpFr: "Lit la fiche du client et, si le chemin est paramétré, ses lignes d'engagement. Rien n'est enregistré.",
  },
  {
    code: "CREDIT_BUREAU",
    labelFr: "Crédit bureau — rapport de solvabilité",
    flag: "CREDIT_BUREAU_API_ENABLED",
    targetKeys: ["CREDIT_BUREAU_PROVIDER", "CREDIT_BUREAU_BASE_URL", "CREDIT_BUREAU_PATH"],
    tokenEnv: ["CREDIT_BUREAU_API_TOKEN"],
    sampleLabelFr: "ICE de test",
    helpFr: "Lit le rapport d'une entreprise par son ICE. Rien n'est enregistré.",
  },
  {
    code: "AI",
    labelFr: "Intelligence artificielle — lecture des pièces",
    flag: "AI_ENABLED",
    targetKeys: ["AI_PROVIDER", "AI_MODEL", "AI_BASE_URL"],
    tokenEnv: ["ANTHROPIC_API_KEY", "IA_CLE_API"],
    sampleLabelFr: null,
    helpFr: "Envoie une requête minimale, sans pièce ni donnée client.",
  },
];

/** Durée de validité d'un test pour autoriser l'activation. */
export const TEST_VALIDITY_DAYS = 30;

export interface IntegrationTest {
  ok: boolean;
  at: string;
  by: string;
  /** Empreinte de la cible testée : valeurs des targetKeys au moment du test. */
  target: Record<string, string>;
  sample: string | null;
  messageFr: string;
  details: string[];
  durationMs: number;
}

export const testKey = (code: IntegrationCode) => `INTEGRATION_TEST_${code}`;

export function parseTest(raw: string | null | undefined): IntegrationTest | null {
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as IntegrationTest;
    return typeof t.ok === "boolean" && typeof t.at === "string" ? t : null;
  } catch {
    return null;
  }
}

export function targetOf(def: IntegrationDef, settings: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(def.targetKeys.map((k) => [k, (settings[k] ?? "").trim()]));
}

/**
 * Motif de refus d'une activation, ou null. Il faut un test réussi, de moins de
 * TEST_VALIDITY_DAYS jours, sur la cible qui sera en vigueur après l'enregistrement.
 */
export function activationBlocker(def: IntegrationDef, test: IntegrationTest | null, nextSettings: Record<string, string | undefined>, now: Date = new Date()): string | null {
  const how = "faites d'abord un test de connexion réussi (Administration › Raccordements).";
  if (!test) return `Activation « ${def.labelFr} » refusée : aucun test de connexion ; ${how}`;
  if (!test.ok) return `Activation « ${def.labelFr} » refusée : le dernier test a échoué (${test.messageFr}) ; ${how}`;
  if (now.getTime() - new Date(test.at).getTime() > TEST_VALIDITY_DAYS * 86_400_000)
    return `Activation « ${def.labelFr} » refusée : le dernier test réussi date de plus de ${TEST_VALIDITY_DAYS} jours ; ${how}`;
  const target = targetOf(def, nextSettings);
  const changed = def.targetKeys.filter((k) => (test.target[k] ?? "") !== target[k]);
  if (changed.length) return `Activation « ${def.labelFr} » refusée : ${changed.join(", ")} modifié(s) depuis le dernier test ; ${how}`;
  return null;
}

function errorText(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Erreur inconnue.";
}

/** Test de connexion : appelle l'API même désactivée, n'enregistre que le résultat du test. */
export async function testIntegration(db: PrismaClient, identity: Identity, code: IntegrationCode, rawSample: string): Promise<IntegrationTest> {
  const def = INTEGRATIONS.find((d) => d.code === code);
  if (!def) throw new Error(`Raccordement inconnu : ${code}`);
  // Paramétrage relu en base : le test porte sur l'adresse tout juste enregistrée.
  forgetSettings();
  const settings = await loadSettings();
  const sample = rawSample.trim().slice(0, 40) || null;
  const started = Date.now();
  let ok = false;
  let messageFr = "";
  const details: string[] = [];
  try {
    if (code === "T24") {
      if (!sample) throw new Error("Saisissez un code client T24 réel pour le test.");
      const c = await fetchT24Customer(db, sample, { ignoreEnabled: true, timeoutMs: 15_000 });
      details.push(`Client : ${c.name || c.shortName}`);
      details.push(`ICE : ${c.ice || "absent"} · forme juridique : ${c.legalForm || "absente"} · secteur : ${c.sectorCode || "absent"}`);
      details.push(`Segment commercial : ${c.commercialSegment || "absent"} · gestionnaire : ${c.accountOfficer || "absent"} · centre : ${c.businessCenterCode || "absent"}`);
      if ((settings.T24_FACILITIES_PATH ?? "").trim()) {
        try {
          const lines = await fetchT24Facilities(db, sample, { ignoreEnabled: true, timeoutMs: 15_000 });
          const t = facilityTotals(lines);
          details.push(`Engagements : ${lines.length} ligne(s), autorisé ${t.authorized.toLocaleString("fr-FR")}, encours ${t.outstanding.toLocaleString("fr-FR")}.`);
        } catch (e) {
          throw new Error(`Fiche lue, mais engagements en échec : ${errorText(e)}`);
        }
      } else details.push("Engagements : chemin non paramétré, non testés.");
      messageFr = "Connexion réussie : la fiche client est lue et ses champs sont reconnus.";
    } else if (code === "CREDIT_BUREAU") {
      if (!sample) throw new Error("Saisissez l'ICE d'une entreprise pour le test.");
      const r = await requestCreditBureau(sample, { ignoreEnabled: true });
      details.push(`Entreprise : ${r.data.companyName || "non renseignée"} · date de mise à jour : ${r.reportDate || "absente"}`);
      details.push(`${r.data.lines.length} ligne(s) d'engagement, ${r.data.incidents.length} incident(s).`);
      if (!r.reportDate) throw new Error("Rapport lu, mais sans date de mise à jour : la correspondance des champs est à revoir.");
      messageFr = "Connexion réussie : le rapport est lu et daté.";
    } else {
      const c = await aiConfig();
      const missing = missingConfig(c);
      if (missing) throw new Error(`IA non configurée : ${missing}.`);
      const r = await pingAi();
      details.push(`Fournisseur : ${c.provider} · modèle : ${r.model}`);
      if (!(r.json && typeof r.json === "object" && (r.json as { ok?: unknown }).ok === true)) throw new Error("Réponse reçue, mais pas au format attendu.");
      messageFr = "Connexion réussie : le modèle répond au format attendu.";
    }
    ok = true;
  } catch (e) {
    messageFr = errorText(e);
  }
  const test: IntegrationTest = {
    ok,
    at: new Date().toISOString(),
    by: identity.name,
    target: targetOf(def, settings),
    sample,
    messageFr,
    details,
    durationMs: Date.now() - started,
  };
  await db.$transaction(async (tx) => {
    await tx.appSetting.upsert({
      where: { key: testKey(code) },
      update: { value: JSON.stringify(test), updatedBy: identity.name },
      create: { key: testKey(code), value: JSON.stringify(test), updatedBy: identity.name },
    });
    await auditWithin(tx, {
      actor: identity.name,
      actorRole: identity.role,
      action: "INTEGRATION_TESTED",
      resourceType: "AppSetting",
      resourceId: testKey(code),
      detail: { code, ok, sample, messageFr, target: test.target, durationMs: test.durationMs },
    });
  });
  return test;
}

export interface IntegrationState {
  def: IntegrationDef;
  enabled: boolean;
  target: Record<string, string>;
  tokenPresent: boolean;
  lastTest: IntegrationTest | null;
  /** Ce qui empêcherait d'activer maintenant, ou null. */
  blocker: string | null;
}

export async function integrationStates(db: PrismaClient, now: Date = new Date()): Promise<IntegrationState[]> {
  // Lecture directe en base (pas le cache de 30 s du paramétrage) : l'écran
  // reflète une activation qui vient d'être enregistrée.
  const keys = INTEGRATIONS.flatMap((d) => [testKey(d.code), d.flag, ...d.targetKeys]);
  const rows = await db.appSetting.findMany({ where: { key: { in: keys } } });
  const settings: Record<string, string | undefined> = { ...(await loadSettings()) };
  for (const r of rows) settings[r.key] = r.value;
  const aiProvider = settings.AI_PROVIDER ?? "anthropic";
  return INTEGRATIONS.map((def) => {
    const lastTest = parseTest(rows.find((r) => r.key === testKey(def.code))?.value);
    const tokenEnv = def.code === "AI" ? [aiProvider === "anthropic" ? "ANTHROPIC_API_KEY" : "IA_CLE_API"] : def.tokenEnv;
    return {
      def,
      enabled: settings[def.flag] === "true",
      target: targetOf(def, settings),
      tokenPresent: tokenEnv.every((k) => !!process.env[k]),
      lastTest,
      blocker: activationBlocker(def, lastTest, settings, now),
    };
  });
}
