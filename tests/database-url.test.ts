import { describe, expect, it } from "vitest";
import { databaseUrlError } from "@/lib/env";

describe("Contrôle de forme de DATABASE_URL (incident Vercel / Hostinger)", () => {
  const ok = "postgresql://u:p@h:6543/postgres?pgbouncer=true&schema=corp_scoring";
  it("accepte une chaîne PostgreSQL bien formée", () => {
    expect(databaseUrlError(ok, "postgresql")).toBeNull();
    expect(databaseUrlError(ok.replace("postgresql", "postgres"), "postgresql")).toBeNull();
  });
  it.each([
    [undefined, "absente"],
    ["", "absente"],
    [` ${ok}`, "espace"],
    [`"${ok}"`, "guillemets"],
    [`DATABASE_URL=${ok}`, "NOM="],
    ["https://lerl.supabase.co", "protocole reçu : « https:// »"],
    ["u:p@h:5432/db", "aucun protocole"],
  ])("nomme l'erreur %#", (url, attendu) => {
    const msg = databaseUrlError(url, "postgresql");
    expect(msg).toContain(attendu);
    // Jamais la valeur elle-même : elle contient le mot de passe.
    if (url) expect(msg).not.toContain(":p@");
  });
  it("ne contrôle pas SQLite", () => {
    expect(databaseUrlError("file:./dev.db", "sqlite")).toBeNull();
  });
});
