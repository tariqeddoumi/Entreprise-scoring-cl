import { beforeEach, describe, expect, it } from "vitest";
import {
  isLocked,
  LOCK_DURATION_MS,
  LOGIN_LIMIT_PER_IP,
  LOGIN_LIMIT_PER_USERNAME,
  lockUntilAfter,
  loginThrottled,
  MAX_FAILED_ATTEMPTS,
} from "@/lib/accounts";
import { resetRateLimits } from "@/lib/rate-limit";
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

describe("Plafond de tentatives de connexion, avant tout calcul", () => {
  beforeEach(() => resetRateLimits());
  const t0 = Date.parse("2026-10-01T10:00:00Z");

  it(`refuse au-delà de ${LOGIN_LIMIT_PER_USERNAME} tentatives par minute sur un même identifiant`, () => {
    for (let i = 0; i < LOGIN_LIMIT_PER_USERNAME; i++) {
      // Adresses distinctes : seul le plafond par identifiant joue.
      expect(loginThrottled(`10.0.0.${i}`, "cible", t0)).toBeNull();
    }
    expect(loginThrottled("10.0.0.99", "cible", t0)).toMatch(/Trop de tentatives/);
    expect(loginThrottled("10.0.0.99", "autre", t0)).toBeNull();
  });

  it(`refuse au-delà de ${LOGIN_LIMIT_PER_IP} tentatives par minute depuis une même adresse`, () => {
    for (let i = 0; i < LOGIN_LIMIT_PER_IP; i++) {
      expect(loginThrottled("10.1.1.1", `invente${i}`, t0)).toBeNull();
    }
    expect(loginThrottled("10.1.1.1", "encore.un", t0)).toMatch(/Trop de tentatives/);
  });

  it("une adresse bloquée ne crée plus de compteur par identifiant", () => {
    for (let i = 0; i <= LOGIN_LIMIT_PER_IP; i++) loginThrottled("10.2.2.2", "x" + i, t0);
    // « victime » n'a jamais été comptée : une autre adresse peut l'essayer
    // autant de fois que le plafond par identifiant le permet.
    for (let i = 0; i < LOGIN_LIMIT_PER_USERNAME; i++) {
      loginThrottled("10.2.2.2", "victime", t0);
    }
    expect(loginThrottled("10.3.3.3", "victime", t0)).toBeNull();
  });

  it("le plafond se lève après une minute", () => {
    for (let i = 0; i <= LOGIN_LIMIT_PER_USERNAME; i++) loginThrottled(`10.4.0.${i}`, "cible", t0);
    expect(loginThrottled("10.4.1.1", "cible", t0 + 1_000)).not.toBeNull();
    expect(loginThrottled("10.4.1.1", "cible", t0 + 61_000)).toBeNull();
  });

  it("s'applique même si la limite générale de l'API est désactivée", () => {
    const before = process.env.RATE_LIMIT_PER_MINUTE;
    process.env.RATE_LIMIT_PER_MINUTE = "0";
    try {
      for (let i = 0; i < LOGIN_LIMIT_PER_USERNAME; i++) loginThrottled(`10.5.0.${i}`, "cible", t0);
      expect(loginThrottled("10.5.1.1", "cible", t0)).not.toBeNull();
    } finally {
      if (before === undefined) delete process.env.RATE_LIMIT_PER_MINUTE;
      else process.env.RATE_LIMIT_PER_MINUTE = before;
    }
  });
});
