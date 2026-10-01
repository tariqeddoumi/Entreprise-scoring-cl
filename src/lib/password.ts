import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Empreinte et politique des mots de passe des comptes de l'interface.
 *
 * scrypt (RFC 7914), disponible nativement dans Node : aucune dépendance
 * ajoutée, et une fonction volontairement coûteuse en mémoire, qui rend
 * l'attaque par force brute d'une base dérobée lente et chère. Les paramètres
 * sont enregistrés dans l'empreinte elle-même : ils pourront être relevés
 * sans invalider les comptes existants.
 *
 * Format : scrypt$N$r$p$<sel base64>$<empreinte base64>
 */

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
// 128 × N × r octets : 32 Mo pour les paramètres ci-dessus. La limite par
// défaut de Node (32 Mo) est trop juste ; on la porte au double.
const MAX_MEMORY = 64 * 1024 * 1024;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

function derive(
  password: string,
  salt: Buffer,
  n: number,
  r: number,
  p: number,
  keyLength: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, { N: n, r, p, maxmem: MAX_MEMORY }, (err, key) =>
      err ? reject(err) : resolve(key)
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, N, R, P, KEY_LENGTH);
  return ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
}

/**
 * Compare un mot de passe à une empreinte, en temps constant.
 * Une empreinte illisible ne correspond à rien — jamais d'exception
 * remontant jusqu'à l'écran de connexion.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, "base64");
  if (expected.length === 0) return false;
  try {
    const actual = await derive(
      password,
      Buffer.from(saltB64, "base64"),
      Number(n),
      Number(r),
      Number(p),
      expected.length
    );
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * Empreinte d'un mot de passe que personne ne connaît. Comparer à elle lorsque
 * l'identifiant est inconnu donne à l'échec le même temps de réponse qu'avec
 * un compte existant : la durée ne trahit pas quels identifiants existent.
 */
let decoy: Promise<string> | null = null;
export function decoyHash(): Promise<string> {
  decoy ??= hashPassword(randomBytes(32).toString("base64"));
  return decoy;
}

/**
 * Politique : la longueur avant la complexité (recommandation NIST SP 800-63B).
 * Une règle de composition pousse vers « Motdepasse1! », pas vers un secret
 * robuste ; une longueur minimale de douze caractères, si.
 */
export function passwordPolicyErrors(password: string, username: string): string[] {
  const errors: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`au moins ${PASSWORD_MIN_LENGTH} caractères`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    errors.push(`au plus ${PASSWORD_MAX_LENGTH} caractères`);
  }
  if (username && password.toLowerCase().includes(username.toLowerCase())) {
    errors.push("ne pas contenir l'identifiant");
  }
  if (password.length >= PASSWORD_MIN_LENGTH && new Set(password).size < 5) {
    errors.push("ne pas répéter quelques caractères seulement");
  }
  return errors;
}

/** Alphabet sans caractères ambigus à la lecture (0/O, 1/l/I). */
const TEMP_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/**
 * Mot de passe provisoire, à communiquer hors de l'outil et à changer dès la
 * première connexion. Tirage cryptographique, 16 caractères (~ 90 bits).
 */
export function generateTemporaryPassword(length = 16): string {
  let out = "";
  for (let i = 0; i < length; i++) out += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
  return out;
}

/** Identifiant normalisé : minuscules, 3 à 64 caractères parmi [a-z0-9._-]. */
export function normalizeUsername(raw: string): string | null {
  const u = raw.trim().toLowerCase();
  return /^[a-z0-9._-]{3,64}$/.test(u) ? u : null;
}
