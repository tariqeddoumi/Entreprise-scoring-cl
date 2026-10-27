import { Prisma, type PrismaClient } from "@/generated/prisma";
import { prisma as basePrisma } from "./prisma";

/**
 * Périmètre multi-banques et cloisonnement des données.
 *
 * Les entités (groupe, banques, banques régionales, filiales) forment un arbre
 * de profondeur quelconque. Règles, celles du cloisonnement attendu d'un groupe
 * bancaire :
 *  - LECTURE : un utilisateur voit les dossiers de son entité et de toute sa
 *    descendance (la maison mère consulte ses filiales, jamais l'inverse ; deux
 *    banques sœurs ne se voient pas) ;
 *  - ÉCRITURE : sur sa seule entité par défaut ; avec la portée BRANCH, sur toute
 *    sa descendance ;
 *  - un administrateur (ADMIN) sans entité administre tout le groupe ; tout autre
 *    compte sans entité ne voit RIEN tant qu'on ne l'a pas rattaché (refus par
 *    défaut) ;
 *  - une entité désactivée (elle ou une ascendante) ferme l'accès de ses
 *    utilisateurs, sans masquer ses dossiers à la maison mère.
 *
 * Le filtre est appliqué DANS le client de base de données (`scopedPrisma`), pas
 * écran par écran : une page ou une route oubliée ne peut pas exposer les
 * dossiers d'une autre banque (OWASP API1, « Broken Object Level
 * Authorization »). Les écrans et les routes n'importent jamais le client brut ;
 * le vérificateur d'alignement le contrôle.
 */

export interface EntityNode {
  id: string;
  code: string;
  name: string;
  type: string;
  parentId: string | null;
  path: string;
  level: number;
  country: string | null;
  currency: string;
  isActive: boolean;
  toolName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
}

export const ENTITY_TYPES = ["GROUP", "BANK", "REGIONAL_BANK", "SUBSIDIARY_GROUP", "SUBSIDIARY"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  GROUP: "Groupe",
  BANK: "Banque",
  REGIONAL_BANK: "Banque régionale",
  SUBSIDIARY_GROUP: "Groupe de filiales",
  SUBSIDIARY: "Filiale",
};

export const WRITE_SCOPES = ["ENTITY", "BRANCH"] as const;
export type WriteScope = (typeof WRITE_SCOPES)[number];

export interface Perimeter {
  /** Tout le groupe : aucun filtre. */
  all: boolean;
  /** Entité de rattachement (nulle pour le groupe entier). */
  entityId: string | null;
  /** Entités dont les dossiers sont visibles. */
  read: string[];
  /** Entités où l'on peut créer et modifier. */
  write: string[];
}

export const PERIMETER_ALL: Perimeter = { all: true, entityId: null, read: [], write: [] };
export const PERIMETER_NONE: Perimeter = { all: false, entityId: null, read: [], write: [] };

/** Chemin matérialisé : celui du parent suivi de l'identifiant. */
export function pathOf(id: string, parentPath: string | null): string {
  return `${parentPath ?? "/"}${id}/`;
}

/** L'entité et toute sa descendance. */
export function descendants(tree: EntityNode[], id: string): string[] {
  const root = tree.find((e) => e.id === id);
  if (!root) return [];
  return tree.filter((e) => e.path.startsWith(root.path)).map((e) => e.id);
}

/** De l'entité jusqu'à la racine, l'entité d'abord. */
export function ancestors(tree: EntityNode[], id: string): EntityNode[] {
  const byId = new Map(tree.map((e) => [e.id, e]));
  const chain: EntityNode[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.push(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}

export function computePerimeter(
  tree: EntityNode[],
  account: { entityId: string | null; writeScope?: string | null; role: string }
): Perimeter {
  if (!account.entityId) return account.role === "ADMIN" ? PERIMETER_ALL : PERIMETER_NONE;
  const chain = ancestors(tree, account.entityId);
  if (chain.length === 0 || chain.some((e) => !e.isActive)) {
    return { ...PERIMETER_NONE, entityId: account.entityId };
  }
  const read = descendants(tree, account.entityId);
  const write = account.writeScope === "BRANCH" ? read : [account.entityId];
  return { all: false, entityId: account.entityId, read, write };
}

export function canRead(p: Perimeter, entityId: string | null | undefined): boolean {
  return p.all || (!!entityId && p.read.includes(entityId));
}

export function canWrite(p: Perimeter, entityId: string | null | undefined): boolean {
  return p.all || (!!entityId && p.write.includes(entityId));
}

/** Entités où l'utilisateur peut créer, dans l'ordre de l'arbre. */
export function writableEntities(tree: EntityNode[], p: Perimeter): EntityNode[] {
  return tree.filter((e) => e.isActive && canWrite(p, e.id));
}

/** Entités visibles, dans l'ordre de l'arbre. */
export function readableEntities(tree: EntityNode[], p: Perimeter): EntityNode[] {
  return tree.filter((e) => canRead(p, e.id));
}

/**
 * Habillage d'une entité : pour chaque élément, la première valeur renseignée
 * en remontant vers la racine. Le reste vient du paramétrage par défaut.
 */
export function inheritedBranding(
  tree: EntityNode[],
  entityId: string | null
): { toolName: string | null; logoUrl: string | null; primaryColor: string | null; entityName: string | null } {
  const chain = entityId ? ancestors(tree, entityId) : [];
  const first = (k: "toolName" | "logoUrl" | "primaryColor") =>
    chain.map((e) => e[k]).find((v) => v && v.trim()) ?? null;
  return {
    toolName: first("toolName"),
    logoUrl: first("logoUrl"),
    primaryColor: first("primaryColor"),
    entityName: chain[0]?.name ?? null,
  };
}

/** Devise de référence d'une entité (la sienne, sinon celle de son ascendance). */
export function entityCurrency(tree: EntityNode[], entityId: string | null, fallback = "MAD"): string {
  if (!entityId) return fallback;
  return ancestors(tree, entityId).map((e) => e.currency).find(Boolean) ?? fallback;
}

/** Ordre d'affichage : parcours en profondeur, frères triés par nom. */
export function sortTree(tree: EntityNode[]): EntityNode[] {
  const children = new Map<string | null, EntityNode[]>();
  for (const e of tree) {
    const list = children.get(e.parentId) ?? [];
    list.push(e);
    children.set(e.parentId, list);
  }
  for (const list of children.values()) list.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const ids = new Set(tree.map((e) => e.id));
  const roots = tree.filter((e) => !e.parentId || !ids.has(e.parentId)).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const out: EntityNode[] = [];
  const walk = (e: EntityNode) => {
    out.push(e);
    for (const c of children.get(e.id) ?? []) walk(c);
  };
  roots.forEach(walk);
  return out;
}

// --- Arbre en mémoire (30 s) -------------------------------------------------

const TREE_TTL_MS = 30_000;
let treeCache: { tree: EntityNode[]; expires: number } | null = null;

export async function loadTree(): Promise<EntityNode[]> {
  if (treeCache && treeCache.expires > Date.now()) return treeCache.tree;
  const tree = await basePrisma.entity.findMany({
    orderBy: [{ level: "asc" }, { name: "asc" }],
    select: {
      id: true, code: true, name: true, type: true, parentId: true, path: true, level: true,
      country: true, currency: true, isActive: true, toolName: true, logoUrl: true, primaryColor: true,
    },
  });
  treeCache = { tree, expires: Date.now() + TREE_TTL_MS };
  return tree;
}

/** À appeler après toute modification de l'arbre. */
export function forgetTree(): void {
  treeCache = null;
}

// --- Client cloisonné ----------------------------------------------------------

export class OutOfScopeError extends Error {
  readonly code = "OUT_OF_SCOPE";
  constructor(message = "Ce dossier n'appartient pas à votre périmètre.") {
    super(message);
    this.name = "OutOfScopeError";
  }
}

type Filter = (ids: string[]) => Record<string, unknown>;

const byCounterparty: Filter = (ids) => ({ counterparty: { entityId: { in: ids } } });
const byCase: Filter = (ids) => ({ ratingCase: { counterparty: { entityId: { in: ids } } } });

/** Modèles cloisonnés et chemin jusqu'à leur entité. */
export const SCOPED_MODELS: Record<string, Filter> = {
  Counterparty: (ids) => ({ entityId: { in: ids } }),
  RatingRun: byCounterparty,
  RatingCase: byCounterparty,
  Override: (ids) => ({ ratingRun: { counterparty: { entityId: { in: ids } } } }),
  CaseDocument: byCase,
  AiProposal: byCase,
  AuditEvent: (ids) => ({ entityId: { in: ids } }),
  User: (ids) => ({ entityId: { in: ids } }),
};

const READS = new Set([
  "findMany", "findFirst", "findFirstOrThrow", "findUnique", "findUniqueOrThrow", "count", "aggregate", "groupBy",
]);
const UPDATES = new Set(["update", "updateMany", "delete", "deleteMany", "upsert"]);
const CREATES = new Set(["create", "createMany", "createManyAndReturn"]);

function restrict(where: unknown, filter: Record<string, unknown>): Record<string, unknown> {
  const w = (where ?? {}) as Record<string, unknown>;
  const and = w.AND === undefined ? [] : Array.isArray(w.AND) ? w.AND : [w.AND];
  return { ...w, AND: [...and, filter] };
}

function ref(data: Record<string, unknown>, field: string, relation: string): string | null {
  const direct = data[field];
  if (typeof direct === "string") return direct;
  const rel = data[relation] as { connect?: { id?: string } } | undefined;
  return rel?.connect?.id ?? null;
}

/**
 * Contrôle d'une création : la nouvelle ligne doit relever d'une entité où l'on
 * peut écrire. Une contrepartie sans entité reçoit celle de l'utilisateur.
 */
async function checkCreate(model: string, data: Record<string, unknown>, p: Perimeter): Promise<void> {
  const writableCounterparty = async (id: string | null) => {
    if (!id) throw new OutOfScopeError("Contrepartie absente.");
    const c = await basePrisma.counterparty.findUnique({ where: { id }, select: { entityId: true } });
    if (!c || !canWrite(p, c.entityId)) throw new OutOfScopeError();
  };
  const writableCase = async (id: string | null) => {
    if (!id) throw new OutOfScopeError("Dossier absent.");
    const c = await basePrisma.ratingCase.findUnique({
      where: { id },
      select: { counterparty: { select: { entityId: true } } },
    });
    if (!c || !canWrite(p, c.counterparty.entityId)) throw new OutOfScopeError();
  };
  switch (model) {
    case "Counterparty": {
      const target = ref(data, "entityId", "entity") ?? p.entityId;
      if (!target || !canWrite(p, target)) throw new OutOfScopeError("Entité hors de votre périmètre d'écriture.");
      if (!data.entityId && !data.entity) data.entityId = target;
      return;
    }
    case "RatingRun":
    case "RatingCase":
      return writableCounterparty(ref(data, "counterpartyId", "counterparty"));
    case "Override": {
      const runId = ref(data, "ratingRunId", "ratingRun");
      const run = runId
        ? await basePrisma.ratingRun.findUnique({ where: { id: runId }, select: { counterpartyId: true } })
        : null;
      return writableCounterparty(run?.counterpartyId ?? null);
    }
    case "CaseDocument":
    case "AiProposal":
      return writableCase(ref(data, "caseId", "ratingCase"));
    case "User": {
      const target = ref(data, "entityId", "entity");
      if (!target || !canWrite(p, target)) throw new OutOfScopeError("Entité hors de votre périmètre.");
      return;
    }
    case "AuditEvent":
      // Le journal est écrit par l'application elle-même, jamais saisi.
      return;
  }
}

/**
 * Client de base de données restreint au périmètre. C'est le SEUL client que
 * les écrans, actions serveur et routes de l'API manipulent.
 */
export function scopedPrisma(p: Perimeter): PrismaClient {
  if (p.all) return basePrisma;
  return basePrisma.$extends({
    name: "cloisonnement-entites",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const filter = model ? SCOPED_MODELS[model] : undefined;
          if (!filter) return query(args);
          const a = { ...((args ?? {}) as Record<string, unknown>) };
          if (READS.has(operation)) {
            a.where = restrict(a.where, filter(p.read));
          } else if (UPDATES.has(operation)) {
            a.where = restrict(a.where, filter(p.write));
            const data = (operation === "upsert" ? a.update : a.data) as Record<string, unknown> | undefined;
            const target = data?.entityId;
            if (typeof target === "string" && !canWrite(p, target)) throw new OutOfScopeError();
            if (operation === "upsert" && a.create) await checkCreate(model!, a.create as Record<string, unknown>, p);
          } else if (CREATES.has(operation)) {
            const rows = Array.isArray(a.data) ? a.data : [a.data];
            for (const row of rows) if (row) await checkCreate(model!, row as Record<string, unknown>, p);
          }
          return query(a as typeof args);
        },
      },
    },
  }) as unknown as PrismaClient;
}

/** Identité nécessaire au calcul du périmètre. */
export interface ScopedAccount {
  entityId: string | null;
  writeScope?: string | null;
  role: string;
}

export async function perimeterFor(account: ScopedAccount): Promise<Perimeter> {
  if (!account.entityId) return computePerimeter([], account);
  return computePerimeter(await loadTree(), account);
}

export function isOutOfScope(e: unknown): boolean {
  return (
    e instanceof OutOfScopeError ||
    (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")
  );
}
