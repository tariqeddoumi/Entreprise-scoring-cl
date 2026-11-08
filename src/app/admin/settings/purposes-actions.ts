"use server";

import { revalidatePath } from "next/cache";
import { auditWithin } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getPerimeter, getSessionIdentity } from "@/lib/session";
import { checkClassification, checkWatchlistLevels, CLASSIFICATION_KEY, WATCHLIST_LEVELS_KEY, type ClassificationSettings, type WatchlistLevel } from "@/reference/classification";
import { checkFacilityTypes, FACILITY_TYPES_KEY, type FacilityType } from "@/reference/facilities";
import { checkSurveillance, KRI_CATALOG, SURVEILLANCE_KEY, type SurveillanceSettings } from "@/reference/portfolio";
import { CASE_PURPOSES_KEY, checkPurposes, checkRefItems, COMMERCIAL_SEGMENTS_KEY, CREDIT_TYPES_KEY, ENTITY_TIERS_KEY, type CasePurpose, type RefItem } from "@/reference/case-purposes";

export interface PurposesActionState {
  okFr?: string;
  errorFr?: string;
}

/**
 * Motifs d'ouverture des dossiers. Réservé à un administrateur du groupe. Un
 * motif déjà utilisé ne se supprime pas : il se désactive (les dossiers
 * existants gardent leur motif).
 */
export async function savePurposesAction(list: CasePurpose[]): Promise<PurposesActionState> {
  const session = await getSessionIdentity("ADMIN");
  if (!session.ok) return { errorFr: session.reasonFr };
  if (!(await getPerimeter()).all) return { errorFr: "Réservé à un administrateur du groupe." };
  const clean: CasePurpose[] = (Array.isArray(list) ? list : []).slice(0, 30).map((p) => ({
    code: String(p.code ?? "").trim().toUpperCase(),
    labelFr: String(p.labelFr ?? "").trim(),
    active: !!p.active,
    ...(p.defaultExercise === "SUIVANT" || p.defaultExercise === "CONSERVE" ? { defaultExercise: p.defaultExercise } : {}),
    ...(p.defaultCreditType ? { defaultCreditType: String(p.defaultCreditType).toUpperCase() } : {}),
    ...(Array.isArray(p.requiredDocs) ? { requiredDocs: [...new Set(p.requiredDocs.map((c) => String(c).toUpperCase()))].slice(0, 20) } : {}),
  }));
  const issues = checkPurposes(clean);
  if (issues.length) return { errorFr: issues.join(" ") };
  const used = await prisma.ratingCase.findMany({ where: { purpose: { not: null } }, distinct: ["purpose"], select: { purpose: true } });
  const removed = used.map((u) => u.purpose!).filter((code) => !clean.some((p) => p.code === code));
  if (removed.length) return { errorFr: `Motif déjà utilisé par des dossiers : ${removed.join(", ")}. Désactivez-le au lieu de le supprimer.` };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.appSetting.upsert({
        where: { key: CASE_PURPOSES_KEY },
        update: { value: JSON.stringify(clean), updatedBy: session.identity.name },
        create: { key: CASE_PURPOSES_KEY, value: JSON.stringify(clean), updatedBy: session.identity.name },
      });
      await auditWithin(tx, {
        actor: session.identity.name,
        actorRole: session.identity.role,
        action: "CASE_PURPOSES_UPDATED",
        resourceType: "AppSetting",
        resourceId: CASE_PURPOSES_KEY,
        detail: { purposes: clean },
      });
    });
  } catch {
    return { errorFr: "Enregistrement impossible : la base de données ne répond pas." };
  }
  revalidatePath("/admin/settings");
  return { okFr: "Motifs enregistrés." };
}

/**
 * Listes paramétrables simples (types de crédit, catégories de délégation).
 * Un code utilisé (dossier, entité) ne se supprime pas : il se désactive.
 */
export async function saveRefListAction(key: "CREDIT_TYPES" | "ENTITY_TIERS" | "COMMERCIAL_SEGMENTS", list: RefItem[]): Promise<PurposesActionState> {
  const session = await getSessionIdentity("ADMIN");
  if (!session.ok) return { errorFr: session.reasonFr };
  if (!(await getPerimeter()).all) return { errorFr: "Réservé à un administrateur du groupe." };
  if (key !== CREDIT_TYPES_KEY && key !== ENTITY_TIERS_KEY && key !== COMMERCIAL_SEGMENTS_KEY) return { errorFr: "Liste inconnue." };
  const clean: RefItem[] = (Array.isArray(list) ? list : []).slice(0, 30).map((p) => ({
    code: String(p.code ?? "").trim().toUpperCase(),
    labelFr: String(p.labelFr ?? "").trim(),
    active: !!p.active,
    ...(p.helpFr ? { helpFr: String(p.helpFr).trim().slice(0, 500) } : {}),
  }));
  const what = key === CREDIT_TYPES_KEY ? "Types de crédit" : key === COMMERCIAL_SEGMENTS_KEY ? "Segments commerciaux" : "Catégories de délégation";
  const issues = checkRefItems(clean, what);
  if (issues.length) return { errorFr: issues.join(" ") };
  const used =
    key === CREDIT_TYPES_KEY
      ? (await prisma.ratingCase.findMany({ where: { creditType: { not: null } }, distinct: ["creditType"], select: { creditType: true } })).map((u) => u.creditType!)
      : key === COMMERCIAL_SEGMENTS_KEY
        ? (await prisma.counterparty.findMany({ where: { commercialSegment: { not: null } }, distinct: ["commercialSegment"], select: { commercialSegment: true } })).map((u) => u.commercialSegment!)
        : (await prisma.entity.findMany({ where: { riskTier: { not: null } }, distinct: ["riskTier"], select: { riskTier: true } })).map((u) => u.riskTier!);
  const removed = used.filter((code) => !clean.some((p) => p.code === code));
  if (removed.length) return { errorFr: `Code déjà utilisé : ${removed.join(", ")}. Désactivez-le au lieu de le supprimer.` };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.appSetting.upsert({
        where: { key },
        update: { value: JSON.stringify(clean), updatedBy: session.identity.name },
        create: { key, value: JSON.stringify(clean), updatedBy: session.identity.name },
      });
      await auditWithin(tx, {
        actor: session.identity.name,
        actorRole: session.identity.role,
        action: `${key}_UPDATED`,
        resourceType: "AppSetting",
        resourceId: key,
        detail: { list: clean },
      });
    });
  } catch {
    return { errorFr: "Enregistrement impossible : la base de données ne répond pas." };
  }
  revalidatePath("/admin/settings");
  return { okFr: `${what} enregistrés.` };
}

/** Critères de classement BAM et effet de chaque famille sur la note (D-57). */
export async function saveClassificationAction(value: ClassificationSettings): Promise<PurposesActionState> {
  const session = await getSessionIdentity("ADMIN");
  if (!session.ok) return { errorFr: session.reasonFr };
  if (!(await getPerimeter()).all) return { errorFr: "Réservé à un administrateur du groupe." };
  const clean: ClassificationSettings = {
    caps: { SENSIBLE: String(value.caps?.SENSIBLE ?? ""), PREDOUTEUX: String(value.caps?.PREDOUTEUX ?? ""), DOUTEUX: String(value.caps?.DOUTEUX ?? ""), COMPROMIS: String(value.caps?.COMPROMIS ?? "") },
    criteria: (Array.isArray(value.criteria) ? value.criteria : []).slice(0, 80).map((x) => ({
      code: String(x.code ?? "").trim().toUpperCase(),
      family: x.family,
      labelFr: String(x.labelFr ?? "").trim(),
      article: String(x.article ?? "").trim().slice(0, 80),
      source: x.source === "BILAN" ? "BILAN" : "DECLARE",
      ...(x.alertKey ? { alertKey: String(x.alertKey).trim().toUpperCase() } : {}),
      active: !!x.active,
    })),
  };
  const issues = checkClassification(clean);
  if (issues.length) return { errorFr: issues.join(" ") };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.appSetting.upsert({
        where: { key: CLASSIFICATION_KEY },
        update: { value: JSON.stringify(clean), updatedBy: session.identity.name },
        create: { key: CLASSIFICATION_KEY, value: JSON.stringify(clean), updatedBy: session.identity.name },
      });
      await auditWithin(tx, {
        actor: session.identity.name,
        actorRole: session.identity.role,
        action: "CLASSIFICATION_UPDATED",
        resourceType: "AppSetting",
        resourceId: CLASSIFICATION_KEY,
        detail: clean,
      });
    });
  } catch {
    return { errorFr: "Enregistrement impossible : la base de données ne répond pas." };
  }
  revalidatePath("/admin/settings");
  return { okFr: "Critères de classement enregistrés : ils s'appliquent aux prochains calculs." };
}

/** Niveaux de watch list : plafond, revue, délai de renotation (D-58). */
export async function saveWatchlistLevelsAction(list: WatchlistLevel[]): Promise<PurposesActionState> {
  const session = await getSessionIdentity("ADMIN");
  if (!session.ok) return { errorFr: session.reasonFr };
  if (!(await getPerimeter()).all) return { errorFr: "Réservé à un administrateur du groupe." };
  const clean: WatchlistLevel[] = (Array.isArray(list) ? list : []).slice(0, 10).map((l) => ({
    code: String(l.code ?? "").trim().toUpperCase(),
    labelFr: String(l.labelFr ?? "").trim().slice(0, 120),
    cap: String(l.cap ?? "").trim(),
    reviewDays: Number(l.reviewDays),
    renotationDays: Number(l.renotationDays),
    ...(l.helpFr ? { helpFr: String(l.helpFr).trim().slice(0, 500) } : {}),
    active: !!l.active,
  }));
  const issues = checkWatchlistLevels(clean);
  if (issues.length) return { errorFr: issues.join(" ") };
  const used = (await prisma.committeeDecision.findMany({ where: { level: { not: null } }, distinct: ["level"], select: { level: true } })).map((u) => u.level!);
  const removed = used.filter((code) => !clean.some((l) => l.code === code));
  if (removed.length) return { errorFr: `Niveau déjà utilisé : ${removed.join(", ")}. Désactivez-le au lieu de le supprimer.` };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.appSetting.upsert({
        where: { key: WATCHLIST_LEVELS_KEY },
        update: { value: JSON.stringify(clean), updatedBy: session.identity.name },
        create: { key: WATCHLIST_LEVELS_KEY, value: JSON.stringify(clean), updatedBy: session.identity.name },
      });
      await auditWithin(tx, { actor: session.identity.name, actorRole: session.identity.role, action: "WATCHLIST_LEVELS_UPDATED", resourceType: "AppSetting", resourceId: WATCHLIST_LEVELS_KEY, detail: { levels: clean } });
    });
  } catch {
    return { errorFr: "Enregistrement impossible : la base de données ne répond pas." };
  }
  revalidatePath("/admin/settings");
  return { okFr: "Niveaux de watch list enregistrés." };
}

/** Seuils et paramètres de la surveillance du portefeuille. Réservé à un administrateur du groupe. */
export async function saveSurveillanceAction(value: SurveillanceSettings): Promise<PurposesActionState> {
  const session = await getSessionIdentity("ADMIN");
  if (!session.ok) return { errorFr: session.reasonFr };
  if (!(await getPerimeter()).all) return { errorFr: "Réservé à un administrateur du groupe." };
  const clean: SurveillanceSettings = {
    highRiskFrom: Number(value?.highRiskFrom),
    horizonMonths: Number(value?.horizonMonths),
    strongDowngradeNotches: Number(value?.strongDowngradeNotches),
    thresholds: Object.fromEntries(
      KRI_CATALOG.map((k) => {
        const t = value?.thresholds?.[k.code];
        return [k.code, { amber: Number(t?.amber), red: Number(t?.red) }];
      })
    ),
  };
  const issues = checkSurveillance(clean);
  if (issues.length) return { errorFr: issues.join(" ") };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.appSetting.upsert({
        where: { key: SURVEILLANCE_KEY },
        update: { value: JSON.stringify(clean), updatedBy: session.identity.name },
        create: { key: SURVEILLANCE_KEY, value: JSON.stringify(clean), updatedBy: session.identity.name },
      });
      await auditWithin(tx, { actor: session.identity.name, actorRole: session.identity.role, action: "SURVEILLANCE_SETTINGS_UPDATED", resourceType: "AppSetting", resourceId: SURVEILLANCE_KEY, detail: clean });
    });
  } catch {
    return { errorFr: "Enregistrement impossible : la base de données ne répond pas." };
  }
  revalidatePath("/admin/settings");
  revalidatePath("/surveillance");
  return { okFr: "Paramètres de la surveillance enregistrés." };
}

/** Types de lignes d'engagement (nature bilan / signature, durée). Réservé à un administrateur du groupe. */
export async function saveFacilityTypesAction(list: FacilityType[]): Promise<PurposesActionState> {
  const session = await getSessionIdentity("ADMIN");
  if (!session.ok) return { errorFr: session.reasonFr };
  if (!(await getPerimeter()).all) return { errorFr: "Réservé à un administrateur du groupe." };
  const clean: FacilityType[] = (Array.isArray(list) ? list : []).slice(0, 40).map((t) => ({
    code: String(t.code ?? "").trim().toUpperCase(),
    labelFr: String(t.labelFr ?? "").trim().slice(0, 120),
    nature: t.nature === "HORS_BILAN" ? "HORS_BILAN" : "BILAN",
    term: t.term === "MLT" ? "MLT" : "CT",
    active: !!t.active,
  }));
  const issues = checkFacilityTypes(clean);
  if (issues.length) return { errorFr: issues.join(" ") };
  const used = (await prisma.creditFacility.findMany({ distinct: ["typeCode"], select: { typeCode: true } })).map((u) => u.typeCode);
  const removed = used.filter((code) => !clean.some((t) => t.code === code));
  if (removed.length) return { errorFr: `Type déjà utilisé : ${removed.join(", ")}. Désactivez-le au lieu de le supprimer.` };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.appSetting.upsert({
        where: { key: FACILITY_TYPES_KEY },
        update: { value: JSON.stringify(clean), updatedBy: session.identity.name },
        create: { key: FACILITY_TYPES_KEY, value: JSON.stringify(clean), updatedBy: session.identity.name },
      });
      await auditWithin(tx, { actor: session.identity.name, actorRole: session.identity.role, action: "FACILITY_TYPES_UPDATED", resourceType: "AppSetting", resourceId: FACILITY_TYPES_KEY, detail: { list: clean } });
    });
  } catch {
    return { errorFr: "Enregistrement impossible : la base de données ne répond pas." };
  }
  revalidatePath("/admin/settings");
  return { okFr: "Types d'engagement enregistrés." };
}
