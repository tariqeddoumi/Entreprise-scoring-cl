/**
 * Création d'un compte depuis la console — amorçage du premier administrateur
 * et secours lorsqu'aucun administrateur ne peut plus se connecter.
 *
 * Usage :
 *   npm run users:create -- --username a.admin --name "Prénom Nom" --role ADMIN
 *   npm run users:create -- --username a.admin --reset
 *
 * Le mot de passe provisoire est affiché UNE fois, sur la sortie standard ; il
 * n'est conservé nulle part en clair et doit être changé à la première
 * connexion. --reset réinitialise le mot de passe d'un compte existant, le
 * déverrouille, le réactive et ferme ses sessions.
 *
 * Contrairement au jeu de démonstration, ce script s'exécute aussi en
 * production : c'est l'outil d'exploitation prévu pour cela. Chaque opération
 * est auditée sous l'acteur « console-administration ».
 */
import { parseArgs } from "node:util";
import { AccountError, createUser, resetUserPassword, setUserActive } from "../src/lib/accounts";
import type { Identity } from "../src/lib/auth";
import { prisma } from "../src/lib/prisma";
import { normalizeUsername } from "../src/lib/password";

const CONSOLE: Identity = { name: "console-administration", role: "ADMIN" };

const { values } = parseArgs({
  options: {
    username: { type: "string" },
    name: { type: "string" },
    role: { type: "string", default: "ADMIN" },
    reset: { type: "boolean", default: false },
  },
});

async function main(): Promise<void> {
  const username = normalizeUsername(values.username ?? "");
  if (!username) {
    throw new AccountError(
      "--username requis : 3 à 64 caractères parmi lettres minuscules, chiffres, point, tiret et tiret bas."
    );
  }

  if (values.reset) {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) throw new AccountError(`Compte « ${username} » introuvable.`);
    if (!user.isActive) await setUserActive(CONSOLE, user.id, true);
    const { temporaryPassword } = await resetUserPassword(CONSOLE, user.id);
    print(username, user.role, temporaryPassword, "réinitialisé");
    return;
  }

  const { temporaryPassword } = await createUser(CONSOLE, {
    username,
    displayName: values.name ?? username,
    role: (values.role ?? "ADMIN").toUpperCase(),
  });
  print(username, (values.role ?? "ADMIN").toUpperCase(), temporaryPassword, "créé");
}

function print(username: string, role: string, password: string, verb: string): void {
  console.log(`Compte « ${username} » (${role}) ${verb}.`);
  console.log(`Mot de passe provisoire : ${password}`);
  console.log("À remettre par un canal distinct ; il devra être changé à la première connexion.");
}

main()
  .catch((e) => {
    console.error(e instanceof AccountError ? `Erreur : ${e.message}` : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
