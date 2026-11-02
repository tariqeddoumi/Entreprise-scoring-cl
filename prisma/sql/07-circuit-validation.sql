-- ---------------------------------------------------------------------------
-- Circuit de validation à plusieurs étapes — migration d'une base existante.
-- À appliquer APRÈS 06-diagnostic-novembre-2026.sql et AVANT de déployer la
-- version correspondante. Une base neuve n'en a pas besoin : « prisma db push »
-- crée les colonnes.
--
-- Idempotent : peut être rejoué sans effet de bord. Une seule transaction.
--
-- Contenu :
--   - users."jobFunction" : fonction métier de l'utilisateur dans le circuit
--     (chargé d'affaires, directeur du centre d'affaires, contre-étude…) ;
--   - rating_cases."workflow" : circuit figé à la soumission et décisions de
--     chaque étape. Les dossiers déjà soumis gardent une validation en une
--     étape (colonne nulle).
--
-- APRÈS la migration : renseigner la fonction de chaque valideur
-- (Administration › Utilisateurs). Le circuit par défaut exige un directeur du
-- centre d'affaires puis la contre-étude ; tant qu'aucun utilisateur ne porte
-- ces fonctions, les nouveaux dossiers soumis restent en attente. Le circuit se
-- modifie dans Administration › Paramétrage.
--
-- Usage :
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/sql/07-circuit-validation.sql
-- ---------------------------------------------------------------------------

BEGIN;

ALTER TABLE corp_scoring."users" ADD COLUMN IF NOT EXISTS "jobFunction" TEXT;
ALTER TABLE corp_scoring."rating_cases" ADD COLUMN IF NOT EXISTS "workflow" TEXT;

COMMIT;
