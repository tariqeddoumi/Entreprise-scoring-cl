# Diagnostic d'alignement — écrans, back-end, base et design

**Date :** 1er novembre 2026 · **Moteur :** 3.1.0 · **Périmètre :** code de la branche de travail, base locale de recette, base de production Supabase (schéma `corp_scoring`), déploiement Vercel de production.

## 1. Synthèse

| Axe | Contrôle | Résultat |
|---|---|---|
| Back-end ↔ contrat d'API ↔ écrans | `scripts/check-alignment.mts` (9 familles de contrôles) | Aucune divergence |
| Code | Typage, lint, 310 tests automatisés | Tout passe |
| Base de production ↔ schéma Prisma | Colonnes (nom, type, nullabilité) | 231 / 231 identiques (même empreinte) |
| | Index | 53, dont l'index unique partiel des dérogations |
| | Clés étrangères | 17, mêmes définitions (4 noms en minuscules, sans effet) |
| | Sécurité | RLS sur les 19 tables ; aucune table lisible par `anon` / `authenticated` ; piste d'audit en ajout seul |
| | Données | 26 notations (moteurs 1.0.0 et 3.0.0), lues par la couche de compatibilité |
| Écrans | 62 écrans, bureau et mobile, 2 profils + connexion | 0 erreur, 0 débordement, 0 violation d'accessibilité (WCAG 2.1 AA) |
| Design | Titres, polices, boutons, cartes | Cohérent (voir § 4) |
| Parcours | Scénario de bout en bout (28 contrôles), renotation par lot | Tout passe |
| Production | Déploiement de la PR #15 | En ligne ; base non connectée : `DATABASE_URL` mal saisie (§ 5) |

## 2. Écarts corrigés pendant le diagnostic

1. **Index unique partiel non créé par `prisma db push`.** L'index `overrides_one_pending_per_run` (une seule dérogation en attente par notation) n'est pas déclarable dans Prisma : une base installée par `npm run db:push` en était privée, et la règle ne reposait plus que sur un contrôle applicatif vulnérable à deux demandes simultanées. Correction : `scripts/db-indexes.mts`, enchaîné par `npm run db:push` et disponible seul (`npm run db:indexes`) ; `npm run db:check` signale désormais son absence. La production l'avait déjà (migration 06).
2. **Statut trompeur sur un critère calculé depuis le bilan.** Le sélecteur affichait « Manquante » à côté de la valeur calculée. Il affiche « Du bilan » ; seul « Non applicable » reste au choix de l'analyste.

## 3. Écarts constatés, sans correction nécessaire

- **Noms de quatre clés étrangères** en minuscules en production (`overrides_ratingrunid_fkey`, etc.), hérités des premiers scripts SQL : mêmes colonnes, mêmes règles de suppression et de mise à jour. Aucun effet ; à aligner lors d'une future migration de maintenance si souhaité.
- **Deux titres à 18 px** au lieu de 22 px : écrans de connexion et de changement de mot de passe, formulaires centrés en carte. Choix voulu.

## 4. Cohérence visuelle

- Titre principal : 22 px, graisse 700, sur tous les écrans de contenu.
- Police : une famille sans empattement ; police à chasse fixe réservée aux codes et identifiants.
- Cartes : un seul rayon d'angle (10 px) sur les 62 écrans.
- Aucun bouton au style natif du navigateur.
- Couleur principale : celle de l'entité de l'utilisateur (paramétrable dans Administration › Banques et filiales). L'entité de démonstration garde le bleu par défaut ; pour l'identité du Groupe BCP, renseigner l'orange `#E37B05` sur l'entité racine.

## 5. Production : action requise

Le déploiement de la PR #15 est en ligne, mais la base n'est pas connectée. Le contrôle de configuration ajouté en novembre a identifié la cause exacte dans les journaux Vercel :

> DATABASE_URL contient « NOM= » au début de sa valeur : ne collez que la chaîne de connexion, sans le nom de la variable.

Dans Vercel › Settings › Environment Variables, la valeur de `DATABASE_URL` commence par `DATABASE_URL=`. Il faut n'y laisser que la chaîne `postgresql://…&schema=corp_scoring`, sans guillemets, puis redéployer. Même vérification pour `DIRECT_URL`, et pour Hostinger.

Les commits postérieurs à la PR #15 (présentation de défense, guide mis à jour, correctif « Du bilan », index et ce diagnostic) attendent une nouvelle PR.
