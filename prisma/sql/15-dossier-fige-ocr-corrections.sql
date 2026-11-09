-- ---------------------------------------------------------------------------
-- Dossier figé à la soumission, rapports historisés et corrections motivées —
-- migration d'une base existante. À appliquer APRÈS 14 et AVANT de déployer la
-- version correspondante. Une base neuve n'en a pas besoin (« prisma db push »).
--
-- Idempotent : peut être rejoué sans effet de bord. Une seule transaction.
--
-- Contenu :
--  - rating_cases.evidence : éléments au jour de la décision (JSON) ;
--  - credit_reports.corrections : corrections motivées, le rapport lu reste intact ;
--  - legal_reports : rapports InfoRisque historisés (lu + corrections) ;
--  - counterparty_documents : pièces sources rattachées au client (PDF des
--    rapports, justificatifs des corrections) ;
--  - counterparties : tribunal de commerce, numéro CNSS, patente.
--
-- Usage :
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/sql/15-dossier-fige-ocr-corrections.sql
-- ---------------------------------------------------------------------------

BEGIN;

ALTER TABLE corp_scoring."rating_cases" ADD COLUMN IF NOT EXISTS "evidence" TEXT;
ALTER TABLE corp_scoring."credit_reports" ADD COLUMN IF NOT EXISTS "corrections" TEXT;
ALTER TABLE corp_scoring."counterparties" ADD COLUMN IF NOT EXISTS "commercialCourt" TEXT;
ALTER TABLE corp_scoring."counterparties" ADD COLUMN IF NOT EXISTS "cnssNumber" TEXT;
ALTER TABLE corp_scoring."counterparties" ADD COLUMN IF NOT EXISTS "patente" TEXT;

CREATE TABLE IF NOT EXISTS corp_scoring."legal_reports" (
  "id"             TEXT PRIMARY KEY,
  "counterpartyId" TEXT NOT NULL REFERENCES corp_scoring."counterparties"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "caseId"         TEXT,
  "source"         TEXT NOT NULL,
  "reportDate"     TEXT NOT NULL,
  "data"           TEXT NOT NULL,
  "corrections"    TEXT,
  "documentId"     TEXT,
  "documentSha256" TEXT,
  "recordedBy"     TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "legal_reports_counterpartyId_reportDate_idx"
  ON corp_scoring."legal_reports" ("counterpartyId", "reportDate");

CREATE TABLE IF NOT EXISTS corp_scoring."counterparty_documents" (
  "id"             TEXT PRIMARY KEY,
  "counterpartyId" TEXT NOT NULL REFERENCES corp_scoring."counterparties"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "kind"           TEXT NOT NULL,
  "fileName"       TEXT NOT NULL,
  "mimeType"       TEXT NOT NULL,
  "sizeBytes"      INTEGER NOT NULL,
  "sha256"         TEXT NOT NULL,
  "content"        BYTEA NOT NULL,
  "uploadedBy"     TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "counterparty_documents_counterpartyId_idx"
  ON corp_scoring."counterparty_documents" ("counterpartyId");

-- Mêmes protections que les autres tables (01-postgresql-hardening.sql).
ALTER TABLE corp_scoring."legal_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE corp_scoring."counterparty_documents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON corp_scoring."legal_reports" FROM PUBLIC;
REVOKE ALL ON corp_scoring."counterparty_documents" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON corp_scoring."legal_reports" FROM anon';
    EXECUTE 'REVOKE ALL ON corp_scoring."counterparty_documents" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON corp_scoring."legal_reports" FROM authenticated';
    EXECUTE 'REVOKE ALL ON corp_scoring."counterparty_documents" FROM authenticated';
  END IF;
END $$;

COMMIT;
