import type { PrismaClient } from "@/generated/prisma";
import type { Identity } from "./auth";
import { auditWithin } from "./audit";
import { prisma as basePrisma } from "./prisma";
import { ancestors, canWrite, entityCurrency, loadTree, OutOfScopeError, type Perimeter } from "./scope";
import { loadSettings } from "./settings";
import {
  checkT24Code,
  counterpartyFieldsFromT24,
  diffWithT24,
  mapT24Customer,
  normalizeT24Code,
  parseFieldMap,
  type CoreBankingCustomer,
  type FieldChange,
  type T24CodeRule,
} from "@/reference/core-banking";

/**
 * Connecteur T24 : lecture de la fiche client par son code, création et
 * actualisation de la fiche de l'outil. Le jeton d'accès reste une variable
 * d'environnement (T24_API_TOKEN), jamais en base ; la correspondance des
 * champs se paramètre (clé T24_FIELD_MAP, JSON).
 */

export type CoreBankingErrorKind = "DESACTIVE" | "INDISPONIBLE" | "INTROUVABLE" | "INVALIDE" | "CONFLIT";

export class CoreBankingError extends Error {
  constructor(
    public kind: CoreBankingErrorKind,
    message: string
  ) {
    super(message);
  }
}

export const T24_FIELD_MAP_KEY = "T24_FIELD_MAP";

export interface T24Config {
  enabled: boolean;
  baseUrl: string;
  path: string;
  rule: T24CodeRule;
}

export async function t24Config(): Promise<T24Config> {
  const s = await loadSettings();
  return {
    enabled: s.T24_ENABLED === "true" && !!s.T24_BASE_URL,
    baseUrl: s.T24_BASE_URL ?? "",
    path: s.T24_CUSTOMER_PATH ?? "",
    rule: { minDigits: Number(s.T24_CODE_MIN_DIGITS ?? 1), maxDigits: Number(s.T24_CODE_MAX_DIGITS ?? 10) },
  };
}

/** Lecture d'un client dans T24. Toute panne se traduit par une erreur explicite qui ouvre la saisie minimale. */
export async function fetchT24Customer(db: PrismaClient, rawCode: string, opts: { timeoutMs?: number } = {}): Promise<CoreBankingCustomer> {
  const cfg = await t24Config();
  const code = normalizeT24Code(rawCode);
  const invalid = checkT24Code(code, cfg.rule);
  if (invalid) throw new CoreBankingError("INVALIDE", invalid);
  if (!cfg.enabled) throw new CoreBankingError("DESACTIVE", "Rapatriement T24 non activé (Paramétrage › Référentiels externes) : saisissez les informations minimales.");
  const mapRaw = (await db.appSetting.findUnique({ where: { key: T24_FIELD_MAP_KEY } }).catch(() => null))?.value;
  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/${cfg.path.replace(/^\/+/, "")}${encodeURIComponent(code)}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.T24_API_TOKEN) headers.Authorization = `Bearer ${process.env.T24_API_TOKEN}`;
  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000), cache: "no-store" });
  } catch {
    throw new CoreBankingError("INDISPONIBLE", "T24 ne répond pas. Vous pouvez saisir les informations minimales et rattacher la fiche à T24 plus tard.");
  }
  if (res.status === 404) throw new CoreBankingError("INTROUVABLE", `Aucun client ${code} dans T24.`);
  if (!res.ok) throw new CoreBankingError("INDISPONIBLE", `T24 a répondu en erreur (${res.status}). Vous pouvez saisir les informations minimales.`);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new CoreBankingError("INDISPONIBLE", "Réponse de T24 illisible.");
  }
  const customer = mapT24Customer(code, json, parseFieldMap(mapRaw));
  if (!customer.name && !customer.shortName) throw new CoreBankingError("INTROUVABLE", `Client ${code} sans intitulé dans T24 : vérifiez le code.`);
  return customer;
}

/**
 * Un code client T24 ne figure qu'une fois dans l'outil. La recherche porte sur
 * toute la base (un chargé d'affaires ne voit que son portefeuille) ; le nom
 * n'est donné que si la fiche est visible de la personne.
 */
async function assertCodeFree(db: PrismaClient, code: string, exceptId?: string) {
  const any = await basePrisma.counterparty.findFirst({ where: { coreBankingId: code, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
  if (!any) return;
  const visible = await db.counterparty.findFirst({ where: { id: any.id }, select: { name: true } });
  throw new CoreBankingError(
    "CONFLIT",
    visible
      ? `Le client T24 ${code} existe déjà dans l'outil : ${visible.name}.`
      : `Le client T24 ${code} existe déjà dans l'outil, hors de votre portefeuille ou de votre périmètre : voyez son gestionnaire ou le directeur du centre.`
  );
}

/** Entité de rattachement : le centre d'affaires de T24 s'il est connu et dans le périmètre, sinon celle choisie. */
async function resolveEntity(perimeter: Perimeter, customer: CoreBankingCustomer, fallback: string | null | undefined) {
  const tree = await loadTree();
  const byCode = customer.businessCenterCode ? tree.find((e) => e.code.toUpperCase() === customer.businessCenterCode.toUpperCase() && e.isActive) : undefined;
  const chosen = byCode && canWrite(perimeter, byCode.id) ? byCode : tree.find((e) => e.id === (fallback ?? perimeter.entityId));
  if (!chosen) throw new CoreBankingError("INVALIDE", "Précisez l'entité (centre d'affaires) qui porte la relation.");
  if (!canWrite(perimeter, chosen.id)) throw new OutOfScopeError("Entité hors de votre périmètre d'écriture.");
  return { entity: chosen, tree };
}

/** Groupe d'affaires de T24 : rattaché s'il existe dans l'entité ou l'une de ses mères. */
async function groupId(db: PrismaClient, entityId: string, code: string): Promise<string | null> {
  if (!code) return null;
  const lineage = ancestors(await loadTree(), entityId).map((e) => e.id);
  const g = await db.economicGroup.findFirst({ where: { code, isActive: true, entityId: { in: lineage } }, select: { id: true } });
  return g?.id ?? null;
}

const t24Payload = (c: CoreBankingCustomer) => JSON.stringify({ ...c, fetchedAt: new Date().toISOString() });

/** Création d'une fiche depuis T24. */
export async function createFromT24(db: PrismaClient, perimeter: Perimeter, identity: Identity, input: { code: string; entityId?: string | null }) {
  const customer = await fetchT24Customer(db, input.code);
  const { entity, tree } = await resolveEntity(perimeter, customer, input.entityId);
  await assertCodeFree(db, customer.code);
  const fields = counterpartyFieldsFromT24(customer);
  const economicGroupId = await groupId(db, entity.id, customer.economicGroupCode);
  return db.$transaction(async (tx) => {
    const row = await tx.counterparty.create({
      data: {
        ...fields,
        country: fields.country ?? entity.country ?? null,
        currency: fields.currency ?? entityCurrency(tree, entity.id),
        entityId: entity.id,
        coreBankingId: customer.code,
        dataSource: "T24",
        coreBankingSyncedAt: new Date(),
        coreBankingData: t24Payload(customer),
        ...(economicGroupId ? { economicGroupId } : {}),
      },
    });
    await auditWithin(tx, {
      actor: identity.name,
      actorRole: identity.role,
      action: "COUNTERPARTY_CREATED_FROM_T24",
      resourceType: "Counterparty",
      resourceId: row.id,
      entityId: entity.id,
      detail: { code: customer.code, name: row.name, entity: entity.code },
    });
    return row;
  });
}

/**
 * Rattachement d'une fiche saisie à son code T24, ou actualisation d'une fiche
 * T24. Les données de T24 remplacent la saisie (un champ vide dans T24 ne
 * l'efface pas) ; chaque changement est journalisé.
 */
export async function syncFromT24(
  db: PrismaClient,
  perimeter: Perimeter,
  identity: Identity,
  counterpartyId: string,
  rawCode?: string
): Promise<{ changes: FieldChange[]; code: string }> {
  const cp = await db.counterparty.findUnique({ where: { id: counterpartyId } });
  if (!cp) throw new CoreBankingError("INTROUVABLE", "Client introuvable.");
  if (!canWrite(perimeter, cp.entityId)) throw new OutOfScopeError("Client hors de votre périmètre d'écriture.");
  const code = normalizeT24Code(rawCode ?? cp.coreBankingId ?? "");
  // Une fiche rapatriée garde son code ; une saisie minimale peut porter un code
  // non vérifié (T24 indisponible à la création), corrigé au rattachement.
  if (cp.dataSource === "T24" && cp.coreBankingId && rawCode && normalizeT24Code(rawCode) !== cp.coreBankingId)
    throw new CoreBankingError("CONFLIT", `Fiche déjà rattachée au client T24 ${cp.coreBankingId}.`);
  await assertCodeFree(db, code, cp.id);
  const customer = await fetchT24Customer(db, code);
  const fields = counterpartyFieldsFromT24(customer);
  const changes = diffWithT24(cp, fields);
  const update: Record<string, string | null> = {};
  for (const c of changes) update[c.field] = c.after;
  const economicGroupId = cp.economicGroupId ?? (await groupId(db, cp.entityId, customer.economicGroupCode));
  await db.$transaction(async (tx) => {
    await tx.counterparty.update({
      where: { id: cp.id },
      data: {
        ...update,
        coreBankingId: code,
        dataSource: "T24",
        coreBankingSyncedAt: new Date(),
        coreBankingData: t24Payload(customer),
        ...(economicGroupId ? { economicGroupId } : {}),
      },
    });
    await auditWithin(tx, {
      actor: identity.name,
      actorRole: identity.role,
      action: cp.coreBankingId ? "COUNTERPARTY_SYNCED_FROM_T24" : "COUNTERPARTY_LINKED_TO_T24",
      resourceType: "Counterparty",
      resourceId: cp.id,
      entityId: cp.entityId,
      detail: { code, changes },
    });
  });
  return { changes, code };
}

export function parseT24Data(raw: string | null | undefined): (CoreBankingCustomer & { fetchedAt?: string }) | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CoreBankingCustomer & { fetchedAt?: string };
  } catch {
    return null;
  }
}
