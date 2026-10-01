import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma";
import { auditWithin } from "./audit";
import { isRole, type Identity, type Role } from "./auth";
import {
  decoyHash,
  generateTemporaryPassword,
  hashPassword,
  normalizeUsername,
  passwordPolicyErrors,
  verifyPassword,
} from "./password";
import { prisma } from "./prisma";
import { checkRateLimit } from "./rate-limit";

/**
 * Comptes nominatifs de l'interface web.
 *
 * Règles tenues ici, et nulle part ailleurs :
 *  - le mot de passe n'est jamais stocké ni journalisé, seule son empreinte ;
 *  - un échec de connexion ne dit jamais pourquoi (identifiant inconnu,
 *    mot de passe faux, compte verrouillé ou désactivé : même message, même
 *    durée), pour ne pas aider à deviner les comptes existants ;
 *  - cinq échecs consécutifs verrouillent le compte quinze minutes ;
 *  - une session est un jeton aléatoire dont la base ne garde que l'empreinte,
 *    révocable côté serveur ;
 *  - chaque événement de compte est audité dans la même transaction que
 *    l'écriture qu'il trace.
 */

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const SESSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

/**
 * Plafonds de tentatives de connexion par minute, contrôlés AVANT le calcul
 * scrypt et toute écriture en base. Le verrouillage protège un compte ; ces
 * plafonds protègent le serveur : sans eux, des tentatives répétées — même
 * sur un compte inconnu ou déjà verrouillé — consommeraient chacune 32 Mo de
 * mémoire et une ligne d'audit. L'adresse est contrôlée d'abord, pour qu'une
 * rafale d'identifiants inventés depuis une même source ne crée pas autant
 * de compteurs. Compteurs en mémoire, par instance : en déploiement multi-
 * instances, la limite effective est multipliée par le nombre d'instances.
 */
export const LOGIN_LIMIT_PER_IP = 20;
export const LOGIN_LIMIT_PER_USERNAME = 10;

export const LOGIN_FAILED_FR =
  "Identifiant ou mot de passe incorrect, ou compte temporairement verrouillé.";

export class AccountError extends Error {}

export interface SessionInfo {
  identity: Identity;
  displayName: string;
  userId: string;
  sessionId: string;
  mustChangePassword: boolean;
}

function tokenId(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Verrouillage consécutif à un échec, selon le nombre d'échecs consécutifs
 * atteint. Le compteur n'est jamais remis à zéro par l'écoulement du temps,
 * seulement par une connexion réussie : un attaquant qui attend la fin du
 * verrouillage retrouve un compte reverrouillé au premier nouvel échec.
 */
export function lockUntilAfter(failedAttempts: number, now: Date): Date | null {
  return failedAttempts >= MAX_FAILED_ATTEMPTS
    ? new Date(now.getTime() + LOCK_DURATION_MS)
    : null;
}

export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

// ---------------------------------------------------------------------------
// Connexion, session, déconnexion
// ---------------------------------------------------------------------------

export async function login(
  usernameRaw: string,
  password: string,
  meta: { userAgent?: string; clientIp?: string } = {}
): Promise<{ ok: true; token: string; mustChangePassword: boolean } | { ok: false; errorFr: string }> {
  const username = normalizeUsername(usernameRaw);
  const throttled = loginThrottled(
    meta.clientIp ?? "inconnue",
    username ?? usernameRaw.trim().toLowerCase()
  );
  if (throttled) return { ok: false, errorFr: throttled };

  const user = username ? await prisma.user.findUnique({ where: { username } }) : null;
  const now = new Date();

  if (!user || !user.isActive || isLocked(user.lockedUntil, now)) {
    // Même coût de calcul qu'une vraie vérification.
    await verifyPassword(password, await decoyHash());
    await prisma.$transaction((tx) =>
      auditWithin(tx, {
        actor: user ? user.username : "anonyme",
        action: "LOGIN_FAILED",
        resourceType: "User",
        // L'identifiant saisi n'est pas journalisé s'il n'existe pas : c'est
        // souvent un mot de passe tapé dans le mauvais champ.
        resourceId: user ? user.id : "inconnu",
        detail: user
          ? { motif: !user.isActive ? "COMPTE_DESACTIVE" : "COMPTE_VERROUILLE" }
          : { motif: "IDENTIFIANT_INCONNU" },
      })
    );
    return { ok: false, errorFr: LOGIN_FAILED_FR };
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    await prisma.$transaction(async (tx) => {
      // Incrément atomique : des tentatives simultanées ne peuvent pas
      // lire le même compteur et le sous-évaluer.
      const { failedAttempts } = await tx.user.update({
        where: { id: user.id },
        data: { failedAttempts: { increment: 1 } },
        select: { failedAttempts: true },
      });
      const lockedUntil = lockUntilAfter(failedAttempts, now);
      if (lockedUntil) {
        await tx.user.update({ where: { id: user.id }, data: { lockedUntil } });
      }
      await auditWithin(tx, {
        actor: user.username,
        actorRole: user.role,
        action: lockedUntil ? "ACCOUNT_LOCKED" : "LOGIN_FAILED",
        resourceType: "User",
        resourceId: user.id,
        detail: { motif: "MOT_DE_PASSE_INCORRECT", echecsConsecutifs: failedAttempts },
      });
    });
    return { ok: false, errorFr: LOGIN_FAILED_FR };
  }

  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: now },
    });
    // Les sessions expirées sont gardées trente jours pour les besoins d'une
    // enquête, puis purgées : la table ne grossit pas indéfiniment.
    await tx.userSession.deleteMany({
      where: { userId: user.id, expiresAt: { lt: new Date(now.getTime() - SESSION_RETENTION_MS) } },
    });
    await tx.userSession.create({
      data: {
        id: tokenId(token),
        userId: user.id,
        expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
        userAgent: meta.userAgent?.slice(0, 300),
      },
    });
    await auditWithin(tx, {
      actor: user.username,
      actorRole: user.role,
      action: "LOGIN_SUCCEEDED",
      resourceType: "User",
      resourceId: user.id,
    });
  });
  return { ok: true, token, mustChangePassword: user.mustChangePassword };
}

/**
 * Message de refus si l'adresse ou l'identifiant a dépassé son plafond, null
 * sinon. Le message est le même que le compte existe ou non.
 */
export function loginThrottled(clientIp: string, username: string, now = Date.now()): string | null {
  const byIp = checkRateLimit(`login:ip:${clientIp}`, now, LOGIN_LIMIT_PER_IP);
  if (!byIp.allowed) return tooManyFr(byIp.retryAfterSeconds);
  const byUser = checkRateLimit(
    `login:user:${username.slice(0, 64)}`,
    now,
    LOGIN_LIMIT_PER_USERNAME
  );
  if (!byUser.allowed) return tooManyFr(byUser.retryAfterSeconds);
  return null;
}

function tooManyFr(seconds: number): string {
  return `Trop de tentatives de connexion : réessayez dans ${seconds} seconde${seconds > 1 ? "s" : ""}.`;
}

/** Résout le jeton du cookie. null si absent, inconnu, expiré, révoqué ou compte inactif. */
export async function resolveSession(token: string | undefined): Promise<SessionInfo | null> {
  if (!token || token.length > 200) return null;
  const session = await prisma.userSession.findUnique({
    where: { id: tokenId(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) return null;
  const { user } = session;
  if (!user.isActive || !isRole(user.role)) return null;
  return {
    identity: { name: user.username, role: user.role },
    displayName: user.displayName,
    userId: user.id,
    sessionId: session.id,
    mustChangePassword: user.mustChangePassword,
  };
}

export async function logout(token: string | undefined): Promise<void> {
  if (!token) return;
  const session = await prisma.userSession.findUnique({
    where: { id: tokenId(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt) return;
  await prisma.$transaction(async (tx) => {
    await tx.userSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    await auditWithin(tx, {
      actor: session.user.username,
      actorRole: session.user.role,
      action: "LOGOUT",
      resourceType: "User",
      resourceId: session.userId,
    });
  });
}

export async function changeOwnPassword(
  session: SessionInfo,
  current: string,
  next: string
): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  if (!(await verifyPassword(current, user.passwordHash))) {
    throw new AccountError("Mot de passe actuel incorrect.");
  }
  const errors = passwordPolicyErrors(next, user.username);
  if (errors.length > 0) {
    throw new AccountError(`Le nouveau mot de passe doit : ${errors.join(", ")}.`);
  }
  if (await verifyPassword(next, user.passwordHash)) {
    throw new AccountError("Le nouveau mot de passe doit différer de l'actuel.");
  }
  const passwordHash = await hashPassword(next);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false, passwordChangedAt: now },
    });
    // Les autres sessions sont fermées : un mot de passe changé parce qu'il
    // a fuité ne doit pas laisser ouverte la session de celui qui l'a volé.
    await tx.userSession.updateMany({
      where: { userId: user.id, revokedAt: null, id: { not: session.sessionId } },
      data: { revokedAt: now },
    });
    await auditWithin(tx, {
      actor: user.username,
      actorRole: user.role,
      action: "PASSWORD_CHANGED",
      resourceType: "User",
      resourceId: user.id,
    });
  });
}

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------

export async function listUsers() {
  return prisma.user.findMany({
    orderBy: { username: "asc" },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      isActive: true,
      mustChangePassword: true,
      lockedUntil: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
}

export async function createUser(
  actor: Identity,
  input: { username: string; displayName: string; role: string }
): Promise<{ username: string; temporaryPassword: string }> {
  const username = normalizeUsername(input.username);
  if (!username) {
    throw new AccountError(
      "Identifiant invalide : 3 à 64 caractères parmi lettres minuscules, chiffres, point, tiret et tiret bas."
    );
  }
  const displayName = input.displayName.trim();
  if (displayName.length < 2 || displayName.length > 120) {
    throw new AccountError("Nom affiché requis (2 à 120 caractères).");
  }
  if (!isRole(input.role)) throw new AccountError(`Rôle inconnu : ${input.role}`);
  if (await prisma.user.findUnique({ where: { username } })) {
    throw new AccountError(`L'identifiant « ${username} » est déjà utilisé.`);
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username,
        displayName,
        role: input.role,
        passwordHash,
        mustChangePassword: true,
        createdBy: actor.name,
      },
    });
    await auditWithin(tx, {
      actor: actor.name,
      actorRole: actor.role,
      action: "USER_CREATED",
      resourceType: "User",
      resourceId: user.id,
      detail: { username, displayName, role: input.role },
    });
  });
  return { username, temporaryPassword };
}

export async function resetUserPassword(
  actor: Identity,
  userId: string
): Promise<{ username: string; temporaryPassword: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AccountError("Compte introuvable.");
  if (user.username === actor.name) {
    throw new AccountError(
      "Pour votre propre compte, utilisez « Changer de mot de passe » : une réinitialisation fermerait votre session."
    );
  }
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: true, failedAttempts: 0, lockedUntil: null },
    });
    await tx.userSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: now },
    });
    await auditWithin(tx, {
      actor: actor.name,
      actorRole: actor.role,
      action: "USER_PASSWORD_RESET",
      resourceType: "User",
      resourceId: user.id,
      detail: { username: user.username },
    });
  });
  return { username: user.username, temporaryPassword };
}

/**
 * Garde-fou : l'outil ne doit jamais se retrouver sans administrateur actif,
 * faute de quoi plus personne ne pourrait créer ni débloquer un compte.
 *
 * Le décompte et la modification s'exécutent dans la MÊME transaction,
 * sérialisable : deux administrateurs qui se rétrogradent ou se désactivent
 * l'un l'autre au même instant verraient sinon chacun l'autre encore actif,
 * et les deux opérations réussiraient. En isolation sérialisable, le moteur
 * en annule une ; elle est signalée comme opération concurrente.
 */
async function assertAnotherActiveAdmin(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<void> {
  const others = await tx.user.count({
    where: { role: "ADMIN", isActive: true, id: { not: userId } },
  });
  if (others === 0) {
    throw new AccountError("Opération refusée : ce compte est le dernier administrateur actif.");
  }
}

const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };

/** Conflit de sérialisation (P2034) : l'autre opération concurrente l'a emporté. */
function asConcurrencyError(e: unknown): unknown {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") {
    return new AccountError(
      "Opération concurrente sur les comptes : rien n'a été modifié. Rechargez la page et réessayez."
    );
  }
  return e;
}

export async function setUserRole(actor: Identity, userId: string, role: string): Promise<void> {
  if (!isRole(role)) throw new AccountError(`Rôle inconnu : ${role}`);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AccountError("Compte introuvable.");
  if (user.role === role) return;
  if (user.username === actor.name) {
    throw new AccountError("Un administrateur ne modifie pas son propre rôle.");
  }
  await prisma
    .$transaction(async (tx) => {
      if (user.role === "ADMIN") await assertAnotherActiveAdmin(tx, user.id);
      await tx.user.update({ where: { id: user.id }, data: { role } });
      await auditWithin(tx, {
        actor: actor.name,
        actorRole: actor.role,
        action: "USER_ROLE_CHANGED",
        resourceType: "User",
        resourceId: user.id,
        detail: { username: user.username, avant: user.role, apres: role },
      });
    }, SERIALIZABLE)
    .catch((e) => {
      throw asConcurrencyError(e);
    });
}

export async function setUserActive(actor: Identity, userId: string, active: boolean): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AccountError("Compte introuvable.");
  if (user.isActive === active) return;
  if (!active && user.username === actor.name) {
    throw new AccountError("Un administrateur ne désactive pas son propre compte.");
  }
  const now = new Date();
  await prisma
    .$transaction(async (tx) => {
      if (!active && user.role === "ADMIN") await assertAnotherActiveAdmin(tx, user.id);
      await tx.user.update({
        where: { id: user.id },
        data: active ? { isActive: true, failedAttempts: 0, lockedUntil: null } : { isActive: false },
      });
      if (!active) {
        await tx.userSession.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: now },
        });
      }
      await auditWithin(tx, {
        actor: actor.name,
        actorRole: actor.role,
        action: active ? "USER_REACTIVATED" : "USER_DEACTIVATED",
        resourceType: "User",
        resourceId: user.id,
        detail: { username: user.username },
      });
    }, SERIALIZABLE)
    .catch((e) => {
      throw asConcurrencyError(e);
    });
}

export type { Role };
