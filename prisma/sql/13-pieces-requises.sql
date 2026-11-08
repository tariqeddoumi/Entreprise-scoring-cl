-- ---------------------------------------------------------------------------
-- Pièces requises par motif — migration d'une base existante. À appliquer
-- APRÈS 12-engagements-ligne-par-ligne.sql et AVANT de déployer la version
-- correspondante. Une base neuve n'en a pas besoin (« prisma db push »).
--
-- Idempotent. Contenu : case_documents."kind", type de la pièce (statuts,
-- attestation fiscale…). Les pièces existantes restent « non typées ».
--
-- Usage :
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/sql/13-pieces-requises.sql
-- ---------------------------------------------------------------------------

BEGIN;
ALTER TABLE corp_scoring."case_documents" ADD COLUMN IF NOT EXISTS "kind" TEXT;
COMMIT;
