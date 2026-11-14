-- ---------------------------------------------------------------------------
-- Rapprochement de la saisie manuelle avec T24 — migration d'une base
-- existante. À appliquer APRÈS 16 et AVANT de déployer la version
-- correspondante. Une base neuve n'en a pas besoin (« prisma db push »).
--
-- Purement additive et idempotente. Une seule transaction.
--
--  - counterparties.manualEntry : saisie d'origine conservée au rattachement à
--    T24 et valeurs saisies gardées à la place de T24 (avec motif) ;
--  - credit_facilities.reconciliation / matchedReference / reconciledBy /
--    reconciledAt : rapprochement des lignes saisies avec les lignes T24.
--
-- Usage :
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/sql/17-rapprochement-saisie-t24.sql
-- ---------------------------------------------------------------------------

BEGIN;

ALTER TABLE corp_scoring."counterparties" ADD COLUMN IF NOT EXISTS "manualEntry" TEXT;
ALTER TABLE corp_scoring."credit_facilities" ADD COLUMN IF NOT EXISTS "reconciliation" TEXT;
ALTER TABLE corp_scoring."credit_facilities" ADD COLUMN IF NOT EXISTS "matchedReference" TEXT;
ALTER TABLE corp_scoring."credit_facilities" ADD COLUMN IF NOT EXISTS "reconciledBy" TEXT;
ALTER TABLE corp_scoring."credit_facilities" ADD COLUMN IF NOT EXISTS "reconciledAt" TIMESTAMP(3);

COMMIT;
