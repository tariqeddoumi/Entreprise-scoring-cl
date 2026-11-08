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

### Comptes utilisateurs (à partir d'octobre 2026)

La connexion à l'interface se fait par compte nominatif. Les deux tables
`users` et `user_sessions` doivent exister **avant** le déploiement de la
version qui l'introduit — sans elles, plus personne ne peut ouvrir de session :

```bash
psql "$DIRECT_URL" -f prisma/sql/03-comptes-utilisateurs.sql
npm run users:create -- --username <identifiant> --name "<Prénom Nom>" --role ADMIN
```

Le script est idempotent et applique lui-même le durcissement des deux tables
(droits retirés aux rôles `anon` et `authenticated`, sécurité au niveau des
lignes). La seconde commande affiche une fois le mot de passe provisoire du
premier administrateur, qui crée ensuite les autres comptes depuis l'écran
**Utilisateurs**. En cas de perte du dernier accès administrateur :
`npm run users:create -- --username <identifiant> --reset`.

### Banques et filiales, devises, dossiers, IA (à partir de fin octobre 2026)

À appliquer **avant** le déploiement de la version qui introduit ces fonctions
(détail : `docs/11-workflow-multi-entites-ia.md`) :

```bash
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/sql/04-multi-entites-workflow-ia.sql
```

Le script est idempotent et transactionnel. Il crée l'entité racine `GROUPE`, y
rattache les contreparties existantes, crée les tables des cours, du paramétrage,
des dossiers, des pièces et des propositions de l'IA, et les durcit. Ensuite,
l'administrateur du groupe rattache chaque compte non administrateur à sa banque
ou filiale (écran **Utilisateurs**) : sans rattachement, ces comptes n'ont plus
accès à aucun dossier.

### Renotation par lot et corrections du diagnostic (novembre 2026)

Deux scripts, à appliquer dans l'ordre **avant** le déploiement correspondant
(tous deux idempotents et transactionnels ; déjà appliqués en production) :

```bash
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/sql/05-renotation-groupes.sql
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/sql/06-diagnostic-novembre-2026.sql
```

Le premier crée les groupes d'affaires, les lots et les planifications de
renotation ; le second rattache les webhooks à une entité, crée l'outbox des
événements sortants et l'index unique partiel `overrides_one_pending_per_run`
(une seule dérogation en attente par notation).

### Remise à zéro et nouveau jeu de démonstration

`npm run db:reset-seed` supprime toutes les données métier (clients, groupes, dossiers, notations, dérogations, lots, cours de change, webhooks, paramétrage hors IA) puis recharge le jeu de démonstration, calculé par le moteur sur l'échelle 1 à 10 en vigueur. Les comptes, leurs sessions, les entités, les paramètres de l'IA (clés `AI_*`) et le journal d'audit (en ajout seul) sont conservés. Sans option, le script affiche la base visée et ce qu'il supprimerait ; `-- --confirm` exécute. La suppression se fait en une seule transaction. Contre Supabase, utiliser l'adresse **directe** (`DIRECT_URL`) comme `DATABASE_URL` pour cette exécution : une transaction interactive ne passe pas par le pooler.

### Circuit de validation (novembre 2026)

```bash
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/sql/07-circuit-validation.sql
```

Ajoute la fonction des comptes (`users.jobFunction`) et le circuit figé des dossiers (`rating_cases.workflow`). Idempotent et transactionnel. **Après la migration**, renseigner la fonction de chaque valideur (Administration › Utilisateurs) : le circuit par défaut exige un directeur du centre d'affaires puis la contre-étude, et un dossier soumis reste en attente tant que personne ne porte la fonction de l'étape. Le circuit se modifie dans Administration › Paramétrage ; il est enregistré dans `app_settings` (clé `WORKFLOW_CIRCUIT`). Les dossiers soumis avant la migration gardent une validation en une étape.

### Format du bilan, motif des dossiers et référentiel des bilans (novembre 2026)

```bash
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/sql/09-referentiel-bilans-motifs.sql
```

Ajoute le motif et le type de crédit des dossiers (`rating_cases.purpose`, `creditType`), la catégorie de délégation des entités (`entities.riskTier`), la table des décisions de comité (`committee_decisions` : levées de critères, watch list) et la table `financial_statements` (bilans du client par exercice), puis y reprend les bilans des notes déjà validées. Idempotent et transactionnel ; à appliquer **avant** de déployer la version correspondante. Le format du bilan est enregistré dans `app_settings` (clé `FINANCIAL_FORMAT_VERSIONS`) et les motifs sous la clé `CASE_PURPOSES` ; sans enregistrement, le format embarqué (bilan complet) et les motifs embarqués s'appliquent. Le script `08-seed-demonstration-echelle-1-10.sql` est antérieur à cette migration : il ne vide pas `financial_statements` (`npm run db:reset-seed` le fait).

### Référentiel T24, crédit bureau et fiche juridique InfoRisque (novembre 2026)

```bash
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/sql/10-t24-credit-bureau-inforisque.sql
```

Ajoute à `counterparties` le code client T24 (`coreBankingId`, unique par entité), la source de la fiche (`dataSource` : T24 ou SAISIE), la dernière synchronisation et les données rapatriées, le segment commercial (`commercialSegment`, distinct du segment du modèle), le gestionnaire (`accountOfficer`) et la fiche juridique (`legalProfile`, JSON) ; crée la table `credit_reports` (rapports de solvabilité). Idempotent, transactionnel, mêmes protections que les autres tables (RLS, aucun droit pour `anon` ni `authenticated`). À appliquer **avant** de déployer la version correspondante.

Raccordements (Administration › Paramétrage › Référentiels externes) :

| Raccordement | Paramètres | Secret (variable d'environnement, jamais en base) |
|---|---|---|
| T24 (Transact, API clients) | `T24_ENABLED`, `T24_BASE_URL`, `T24_CUSTOMER_PATH`, longueur du code client | `T24_API_TOKEN` (en-tête `Authorization: Bearer`) |
| Crédit bureau (Creditinfo ou Quantik) | `CREDIT_BUREAU_API_ENABLED`, `CREDIT_BUREAU_PROVIDER`, `CREDIT_BUREAU_BASE_URL`, `CREDIT_BUREAU_PATH` | `CREDIT_BUREAU_API_TOKEN` |

La correspondance des champs T24 (champs locaux de la banque : ICE, RC, segment commercial…) se paramètre sous la clé `T24_FIELD_MAP` de `app_settings` (JSON : pour chaque champ de la fiche, la liste des chemins dans la réponse de T24). Les adresses doivent être en https ; elles sont appelées depuis le serveur de l'application, qui doit donc atteindre le réseau interne de la banque (hébergement interne, ou passerelle). Sans raccordement, la création se fait en saisie minimale et le rapport de solvabilité se charge en PDF ou en image, lu par l'IA.

### Portefeuille par chargé d'affaires (novembre 2026)

```bash
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/sql/11-portefeuille-charge-affaires.sql
```

Ajoute `users.accountOfficerCode` (code gestionnaire T24), l'index sur `counterparties.accountOfficer`, et affecte aux clients sans gestionnaire le compte qui les a créés (journal d'audit). Idempotent et transactionnel. La restriction ne s'active qu'avec le paramètre `PORTFOLIO_SCOPE_P1 = PORTEFEUILLE` (docs/22).

### Engagements ligne par ligne (novembre 2026)

```bash
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/sql/12-engagements-ligne-par-ligne.sql
```

Crée la table `credit_facilities` (lignes d'engagement du client, T24 ou saisie), avec les mêmes protections que les autres tables. Idempotent et transactionnel. Rapatriement T24 : paramètre `T24_FACILITIES_PATH` (même adresse et même jeton que la fiche client) ; correspondance des champs et des codes produit sous la clé `T24_FACILITY_FIELD_MAP` (docs/23).

### Pièces requises par motif (novembre 2026)

```bash
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/sql/13-pieces-requises.sql
```

Ajoute `case_documents.kind` (type de la pièce). Idempotent. Listes par motif dans `CASE_PURPOSES` (champ `requiredDocs`), contrôle `DOCS_AT_SUBMISSION` (docs/24).

**Base neuve.** `npm run db:push` crée les tables puis, via
`scripts/db-indexes.mts`, l'index unique partiel que Prisma ne sait pas
déclarer ; `npm run db:indexes` le crée seul et `npm run db:check` signale son
absence. Le module Bilan ne demande aucune migration : le bilan est conservé
dans la saisie du dossier et dans l'instantané de la notation.

**Échelle de notation 1 à 10 (moteur 3.2).** Aucune migration : les versions de l'échelle sont enregistrées dans le paramétrage (`app_settings`, clé `RATING_SCALE_VERSIONS`) ; sans version enregistrée, la version embarquée ECH10-2026.1 s'applique. De même, les versions de paramètres des grilles (D-54) sont enregistrées sous la clé `MODEL_PARAM_VERSIONS` ; sans version, la grille embarquée s'applique.

**Variable `DATABASE_URL`.** Ne coller que la chaîne `postgresql://…&schema=corp_scoring`,
sans guillemets ni nom de variable devant (`DATABASE_URL=postgresql://…` est
refusé au démarrage avec un message explicite). Même règle pour `DIRECT_URL`,
sur Vercel comme sur Hostinger.

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
