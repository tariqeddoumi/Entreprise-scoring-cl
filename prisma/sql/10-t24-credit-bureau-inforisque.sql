-- ---------------------------------------------------------------------------
-- Référentiel client T24, rapport de solvabilité du crédit bureau, fiche
-- juridique (InfoRisque) — migration d'une base existante. À appliquer APRÈS
-- 09-referentiel-bilans-motifs.sql et AVANT de déployer la version
-- correspondante. Une base neuve n'en a pas besoin : « prisma db push » crée
-- les colonnes et la table.
--
-- Idempotent : peut être rejoué sans effet de bord. Une seule transaction.
--
-- Contenu :
--   - counterparties : code client T24 ("coreBankingId", unique par entité),
--     source de la fiche ("dataSource" : T24 ou SAISIE), dernière
--     synchronisation et données rapatriées, segment commercial (distinct du
--     segment du modèle), gestionnaire, fiche juridique (JSON) ;
--   - credit_reports : rapports de solvabilité (API ou lus par l'IA), datés de
--     leur mise à jour.
--
-- Les fiches existantes restent « non rattachées à T24 » ("dataSource" nul) :
-- elles se rattachent au code client depuis la fiche, sans perte de données.
--
-- Usage :
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/sql/10-t24-credit-bureau-inforisque.sql
-- ---------------------------------------------------------------------------

BEGIN;

ALTER TABLE corp_scoring."counterparties" ADD COLUMN IF NOT EXISTS "coreBankingId" TEXT;
ALTER TABLE corp_scoring."counterparties" ADD COLUMN IF NOT EXISTS "dataSource" TEXT;
ALTER TABLE corp_scoring."counterparties" ADD COLUMN IF NOT EXISTS "coreBankingSyncedAt" TIMESTAMP(3);
ALTER TABLE corp_scoring."counterparties" ADD COLUMN IF NOT EXISTS "coreBankingData" TEXT;
ALTER TABLE corp_scoring."counterparties" ADD COLUMN IF NOT EXISTS "commercialSegment" TEXT;
ALTER TABLE corp_scoring."counterparties" ADD COLUMN IF NOT EXISTS "accountOfficer" TEXT;
ALTER TABLE corp_scoring."counterparties" ADD COLUMN IF NOT EXISTS "legalProfile" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "counterparties_entityId_coreBankingId_key"
  ON corp_scoring."counterparties" ("entityId", "coreBankingId");

CREATE TABLE IF NOT EXISTS corp_scoring."credit_reports" (
  "id"             TEXT PRIMARY KEY,
  "counterpartyId" TEXT NOT NULL REFERENCES corp_scoring."counterparties"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "caseId"         TEXT,
  "bureau"         TEXT NOT NULL,
  "source"         TEXT NOT NULL,
  "reportDate"     TEXT NOT NULL,
  "reference"      TEXT,
  "data"           TEXT NOT NULL,
  "documentId"     TEXT,
  "documentSha256" TEXT,
  "recordedBy"     TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "credit_reports_counterpartyId_reportDate_idx"
  ON corp_scoring."credit_reports" ("counterpartyId", "reportDate");

-- Mêmes protections que les autres tables (01-postgresql-hardening.sql) :
-- aucun accès des rôles exposés par l'API Supabase.
ALTER TABLE corp_scoring."credit_reports" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON corp_scoring."credit_reports" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON corp_scoring."credit_reports" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON corp_scoring."credit_reports" FROM authenticated';
  END IF;
END $$;

COMMIT;
