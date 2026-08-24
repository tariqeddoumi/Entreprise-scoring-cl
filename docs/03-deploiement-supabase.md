# Raccordement à Supabase puis à PostgreSQL autonome

**Version :** 1.0 · **Date :** 19 août 2026

Ce document décrit le raccordement de la plateforme de notation à la base
Supabase du projet **ProjectFinanceScoring**, puis la migration vers un
PostgreSQL autonome. Il consigne également les décisions prises et un point
de sécurité concernant l'existant.

---

## 1. Constat initial

Le projet Supabase `lerlqgorfvnvsytngczs` (PostgreSQL 17, région eu-west-1)
héberge déjà environ **220 tables dans le schéma `public`**, issues de
plusieurs applications successives : Project Finance dans plusieurs
générations (`BP_PF_*`, `BCP_SCORE_GP_*`, `pf_scoring_*`), Promotion
Immobilière (`pi_*`) et suivi des recommandations (`missions`,
`recommendations`, `actions`…).

Plusieurs noms génériques sont déjà occupés : `users`, `roles`,
`permissions`, `audit_logs`, `notifications`, `comments`, `entities`,
`projects`, `clients`, `evaluations`.

## 2. Décision : un schéma dédié

Les tables de la plateforme de notation sont créées dans le schéma
**`corp_scoring`**, jamais dans `public`.

| Bénéfice | Détail |
|---|---|
| Aucune collision | Les six tables cohabitent avec les 220 existantes sans risque de nom déjà pris |
| Non exposé publiquement | PostgREST ne sert que `public` et les schémas explicitement déclarés : la clé anon, publique par nature, ne peut atteindre aucune donnée de notation |
| Migration simplifiée | Le passage à un PostgreSQL autonome consiste à rejouer le même schéma, sans démêler les tables d'autres applications |
| Sauvegarde ciblée | `pg_dump --schema=corp_scoring` extrait exactement le périmètre de la plateforme |

Les six tables : `counterparties`, `rating_runs`, `overrides`,
`webhook_subscriptions`, `webhook_deliveries`, `audit_events`.

## 3. Durcissement appliqué

Trois protections que Prisma ne gère pas ont été ajoutées, et sont rejouables
via `prisma/sql/01-postgresql-hardening.sql` :

1. **Retrait des droits** aux rôles `anon` et `authenticated`, y compris sur
   les tables futures (`ALTER DEFAULT PRIVILEGES`).
2. **Sécurité au niveau des lignes activée sans aucune politique** — défense
   en profondeur : même si le schéma venait à être exposé, aucun rôle non
   privilégié n'obtiendrait de ligne. Le rôle applicatif la contourne, le
   fonctionnement normal n'est pas affecté.
3. **Piste d'audit en ajout seul** : un déclencheur refuse toute mise à jour
   ou suppression sur `audit_events`. Seul le propriétaire de la table peut
   désactiver ce déclencheur, opération elle-même tracée par le moteur.

Ces trois propriétés sont vérifiées par `npm run db:check`.

### Contrôle effectué

| Vérification | Résultat |
|---|---|
| Tables créées dans `corp_scoring` | 6 / 6 |
| Lisibles par `anon` ou `authenticated` | 0 |
| Sécurité au niveau des lignes | activée sur les 6 tables |
| `UPDATE` sur `audit_events` | refusé (`insufficient_privilege`) |
| `DELETE` sur `audit_events` | refusé (`insufficient_privilege`) |
| Index conformes au schéma Prisma | 15 attendus, 15 présents, 0 écart |

## 4. Configuration de la connexion

Deux chaînes distinctes sont nécessaires, pour une raison technique :
le pooler Supabase fonctionne en **mode transaction** et ne supporte pas les
requêtes préparées de Prisma ni les migrations.

| Variable | Usage | Port | Paramètres requis |
|---|---|---|---|
| `DATABASE_URL` | Application | 6543 (pooler) | `pgbouncer=true`, `schema=corp_scoring` |
| `DIRECT_URL` | Migrations | 5432 (direct) | `schema=corp_scoring` |

```bash
DATABASE_URL="postgresql://postgres.lerlqgorfvnvsytngczs:<MOT_DE_PASSE>@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&schema=corp_scoring&sslmode=require"
DIRECT_URL="postgresql://postgres.lerlqgorfvnvsytngczs:<MOT_DE_PASSE>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?schema=corp_scoring&sslmode=require"
```

Le mot de passe se récupère dans **Supabase → Project Settings → Database**.
Il n'est jamais écrit dans le dépôt.

### Mise en service

```bash
cp .env.example .env          # renseigner DATABASE_URL, DIRECT_URL, API_KEYS
npm run db:provider           # génère le schéma pour PostgreSQL
npm run db:generate
npm run db:check              # vérifie connexion, isolation et garde-fous
npm run db:seed               # facultatif : 4 contreparties fictives
npm run dev
```

Les tables existent déjà : `db:push` n'est pas nécessaire au premier
démarrage. Il le deviendra lors d'une évolution du schéma, suivi d'un
nouveau passage du script de durcissement.

## 5. Migration vers PostgreSQL autonome

Le passage ne demande aucune modification de code.

```bash
# 1. Extraction du périmètre de la plateforme, schéma et données
pg_dump "$DIRECT_URL" --schema=corp_scoring --no-owner --no-acl -Fc -f corp_scoring.dump

# 2. Restauration sur la nouvelle instance
pg_restore -d "$NOUVELLE_URL" --no-owner --no-acl corp_scoring.dump

# 3. Rejeu du durcissement (les blocs liés aux rôles Supabase sont ignorés)
psql "$NOUVELLE_URL" -f prisma/sql/01-postgresql-hardening.sql

# 4. Bascule de la configuration
#    DATABASE_URL et DIRECT_URL prennent la même valeur en l'absence de pooler.

# 5. Contrôle
npm run db:check
```

Le script de durcissement est conditionnel : les blocs concernant `anon` et
`authenticated` ne s'exécutent que si ces rôles existent. Il est donc
applicable tel quel sur un PostgreSQL autonome.

## 6. Point de sécurité sur l'existant — hors périmètre de cette plateforme

L'analyse de la base a fait apparaître un problème qui **concerne les
applications déjà en place**, pas la plateforme de notation.

**106 tables du schéma `public` ont la sécurité au niveau des lignes
désactivée.** Elles sont accessibles aux rôles `anon` et `authenticated`.
La clé anon étant publique par construction — elle est embarquée dans les
interfaces web — toute personne la détenant peut lire et modifier chaque
ligne de ces tables.

Sont notamment concernées : `pi_evaluations`, `pi_audit_log`,
`BP_PF_v7pp_scoring_models`, `BCP_SCORE_GP_v7pp_evaluation_answers`,
`import_batches`, `profiles`, `app_settings`, `_prisma_migrations`.

Les tables sont actuellement vides, ce qui suggère un environnement de
développement. Le point devient bloquant dès l'insertion de données réelles.

**Aucune correction n'a été appliquée** : activer la sécurité au niveau des
lignes sans définir de politiques d'accès bloquerait immédiatement les
applications concernées. La remédiation demande, pour chaque table, de
décider qui doit lire et écrire, puis d'écrire les politiques
correspondantes. C'est une décision qui appartient aux équipes qui
maintiennent ces applications.

Deux orientations possibles, à arbitrer :

1. **Isoler comme ici** — déplacer chaque application dans son propre schéma,
   non exposé. C'est l'approche la plus simple si ces applications accèdent
   à la base par leur propre serveur et non par la clé anon depuis le
   navigateur.
2. **Activer la sécurité au niveau des lignes avec des politiques explicites** —
   nécessaire si les interfaces interrogent Supabase directement depuis le
   navigateur.

## 7. Décisions consignées

| # | Décision | Motif |
|---|---|---|
| 1 | Schéma `corp_scoring` plutôt que `public` | 220 tables existantes, noms génériques déjà pris, exposition PostgREST |
| 2 | Sécurité au niveau des lignes activée sans politique | Défense en profondeur, sans effet sur le rôle applicatif |
| 3 | Audit en ajout seul par déclencheur | La piste d'audit devient non falsifiable depuis l'application |
| 4 | `DIRECT_URL` obligatoire en PostgreSQL | Les migrations ne peuvent pas passer par un pooler de transactions |
| 5 | Noms d'index alignés sur la casse Prisma | Évite une dérive détectée à chaque `migrate diff` |
| 6 | Durcissement versionné en SQL | Rejouable à l'identique sur le futur PostgreSQL autonome |
| 7 | Aucune correction sur les 106 tables exposées | Activer la sécurité sans politiques romprait les applications existantes |
