import { describe, expect, it } from "vitest";
import {
  isLocked,
  LOCK_DURATION_MS,
  lockUntilAfter,
  MAX_FAILED_ATTEMPTS,
} from "@/lib/accounts";
import {
  generateTemporaryPassword,
  hashPassword,
  normalizeUsername,
  passwordPolicyErrors,
  verifyPassword,
} from "@/lib/password";

describe("Empreinte des mots de passe", () => {
  it("vérifie le bon mot de passe et refuse les autres", async () => {
    const stored = await hashPassword("une phrase de passe correcte");
    expect(await verifyPassword("une phrase de passe correcte", stored)).toBe(true);
    expect(await verifyPassword("une phrase de passe correctE", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("ne stocke jamais le mot de passe et sale chaque empreinte", async () => {
    const a = await hashPassword("même mot de passe");
    const b = await hashPassword("même mot de passe");
    expect(a).not.toBe(b);
    expect(a).not.toContain("même mot de passe");
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  });

  it("une empreinte illisible ne correspond à rien, sans exception", async () => {
    for (const bad of ["", "scrypt$1$2", "bcrypt$x$y$z$a$b", "scrypt$32768$8$1$$", "scrypt$abc$8$1$c2Fs$a2V5"]) {
      expect(await verifyPassword("x", bad)).toBe(false);
    }
  });
});

describe("Politique de mot de passe", () => {
  it("exige douze caractères", () => {
    expect(passwordPolicyErrors("court", "p.nom")).toContain("au moins 12 caractères");
    expect(passwordPolicyErrors("assez long maintenant", "p.nom")).toEqual([]);
  });

  it("refuse un mot de passe qui reprend l'identifiant", () => {
    expect(passwordPolicyErrors("P.Nom-2026-octobre", "p.nom")).toContain(
      "ne pas contenir l'identifiant"
    );
  });

  it("refuse une suite répétitive", () => {
    expect(passwordPolicyErrors("aaaaaaaaaaaaaaaa", "p.nom")).toContain(
      "ne pas répéter quelques caractères seulement"
    );
  });
});

describe("Mot de passe provisoire et identifiant", () => {
  it("tire 16 caractères sans caractère ambigu, jamais deux fois le même", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = generateTemporaryPassword();
      expect(p).toMatch(/^[A-HJ-NP-Za-km-np-z2-9]{16}$/);
      seen.add(p);
    }
    expect(seen.size).toBe(200);
  });

  it("le mot de passe provisoire respecte la politique", () => {
    expect(passwordPolicyErrors(generateTemporaryPassword(), "p.nom")).toEqual([]);
  });

  it("normalise l'identifiant et refuse les formes invalides", () => {
    expect(normalizeUsername("  P.Nom ")).toBe("p.nom");
    expect(normalizeUsername("ab")).toBeNull();
    expect(normalizeUsername("nom prénom")).toBeNull();
    expect(normalizeUsername("x".repeat(65))).toBeNull();
  });
});

describe("Verrouillage après échecs", () => {
  const now = new Date("2026-10-01T10:00:00Z");

  it(`verrouille au ${MAX_FAILED_ATTEMPTS}e échec consécutif, pas avant`, () => {
    expect(lockUntilAfter(MAX_FAILED_ATTEMPTS - 1, now)).toBeNull();
    const until = lockUntilAfter(MAX_FAILED_ATTEMPTS, now)!;
    expect(until.getTime() - now.getTime()).toBe(LOCK_DURATION_MS);
  });

  it("reverrouille au premier échec suivant la fin du verrouillage", () => {
    expect(lockUntilAfter(MAX_FAILED_ATTEMPTS + 1, now)).not.toBeNull();
  });

  it("le verrouillage expire", () => {
    const until = lockUntilAfter(MAX_FAILED_ATTEMPTS, now)!;
    expect(isLocked(until, now)).toBe(true);
    expect(isLocked(until, new Date(until.getTime() + 1))).toBe(false);
    expect(isLocked(null, now)).toBe(false);
  });
});
