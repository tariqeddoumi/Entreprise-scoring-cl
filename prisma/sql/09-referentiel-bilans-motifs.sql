-- ---------------------------------------------------------------------------
-- Référentiel des bilans, motif et type de crédit des dossiers, catégorie de
-- délégation des centres, décisions de comité — migration d'une
-- base existante. À appliquer APRÈS 07-circuit-validation.sql et AVANT de
-- déployer la version correspondante. Une base neuve n'en a pas besoin :
-- « prisma db push » crée la table et la colonne.
--
-- Idempotent : peut être rejoué sans effet de bord. Une seule transaction.
--
-- Contenu :
--   - rating_cases."purpose" : motif du dossier (renouvellement annuel des
--     crédits de fonctionnement, demande de crédit d'investissement…) ;
--   - rating_cases."creditType" : type de crédit (condition du circuit) ;
--   - entities."riskTier" : catégorie de délégation du centre (normale,
--     encadrée, restreinte), condition du circuit ;
--   - committee_decisions : décisions de comité (levée de critères de
--     classement, entrée et sortie de watch list) ;
--   - financial_statements : bilans du client par exercice, alimentés à la
--     validation d'une note et par la reprise du stock. À l'ouverture d'un
--     dossier sur l'exercice suivant, N−1 et N−2 en sont repris.
--
-- Les bilans des notes déjà validées sont repris dans le référentiel par la
-- dernière instruction (dossiers validés, du plus ancien au plus récent : le
-- plus récent l'emporte pour un même exercice).
--
-- Usage :
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/sql/09-referentiel-bilans-motifs.sql
-- ---------------------------------------------------------------------------

BEGIN;

ALTER TABLE corp_scoring."rating_cases" ADD COLUMN IF NOT EXISTS "purpose" TEXT;
ALTER TABLE corp_scoring."rating_cases" ADD COLUMN IF NOT EXISTS "creditType" TEXT;
ALTER TABLE corp_scoring."entities" ADD COLUMN IF NOT EXISTS "riskTier" TEXT;

CREATE TABLE IF NOT EXISTS corp_scoring."committee_decisions" (
  "id"               TEXT PRIMARY KEY,
  "counterpartyId"   TEXT NOT NULL REFERENCES corp_scoring."counterparties"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "caseId"           TEXT,
  "kind"             TEXT NOT NULL,
  "criteria"         TEXT,
  "level"            TEXT,
  "committeeDate"    TEXT NOT NULL,
  "reference"        TEXT NOT NULL,
  "motif"            TEXT NOT NULL,
  "effectiveDate"    TEXT NOT NULL,
  "status"           TEXT NOT NULL,
  "recordedBy"       TEXT NOT NULL,
  "recordedFunction" TEXT,
  "confirmedBy"      TEXT,
  "confirmedAt"      TIMESTAMP(3),
  "cancelledBy"      TEXT,
  "cancelReason"     TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE corp_scoring."committee_decisions" ADD COLUMN IF NOT EXISTS "level" TEXT;
CREATE INDEX IF NOT EXISTS "committee_decisions_counterpartyId_kind_idx" ON corp_scoring."committee_decisions" ("counterpartyId", "kind");
CREATE INDEX IF NOT EXISTS "committee_decisions_caseId_idx" ON corp_scoring."committee_decisions" ("caseId");

CREATE TABLE IF NOT EXISTS corp_scoring."financial_statements" (
  "id"             TEXT PRIMARY KEY,
  "counterpartyId" TEXT NOT NULL REFERENCES corp_scoring."counterparties"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "fiscalYear"     TEXT NOT NULL,
  "closingDate"    TEXT NOT NULL,
  "statementModel" TEXT,
  "certified"      BOOLEAN NOT NULL DEFAULT false,
  "values"         TEXT NOT NULL,
  "currency"       TEXT NOT NULL DEFAULT 'MAD',
  "source"         TEXT NOT NULL,
  "formatVersion"  TEXT,
  "caseId"         TEXT,
  "runId"          TEXT,
  "createdBy"      TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "financial_statements_counterpartyId_closingDate_key"
  ON corp_scoring."financial_statements" ("counterpartyId", "closingDate");
CREATE INDEX IF NOT EXISTS "financial_statements_counterpartyId_idx"
  ON corp_scoring."financial_statements" ("counterpartyId");

-- Mêmes protections que les autres tables (01-postgresql-hardening.sql) :
-- aucun accès des rôles exposés par l'API Supabase.
REVOKE ALL ON corp_scoring."financial_statements" FROM PUBLIC;
REVOKE ALL ON corp_scoring."committee_decisions" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON corp_scoring."financial_statements" FROM anon';
    EXECUTE 'REVOKE ALL ON corp_scoring."committee_decisions" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON corp_scoring."financial_statements" FROM authenticated';
    EXECUTE 'REVOKE ALL ON corp_scoring."committee_decisions" FROM authenticated';
  END IF;
END $$;

-- Reprise des bilans des notes déjà validées.
INSERT INTO corp_scoring."financial_statements"
  ("id", "counterpartyId", "fiscalYear", "closingDate", "statementModel", "certified", "values", "currency", "source", "caseId", "runId", "createdBy", "createdAt", "updatedAt")
SELECT DISTINCT ON (rc."counterpartyId", y->>'closingDate')
  'fs_' || md5(rc."counterpartyId" || (y->>'closingDate')),
  rc."counterpartyId",
  COALESCE(y->>'fiscalYear', substr(y->>'closingDate', 1, 4)),
  y->>'closingDate',
  NULLIF((rc."draftInput"::jsonb)->'financials'->>'statementModel', ''),
  COALESCE(((rc."draftInput"::jsonb)->'financials'->>'certified')::boolean, false),
  (y->'values')::text,
  cp."currency",
  COALESCE(NULLIF((rc."draftInput"::jsonb)->'financials'->>'source', ''), 'SAISIE'),
  rc."id",
  rc."runId",
  'migration-09',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM corp_scoring."rating_cases" rc
JOIN corp_scoring."counterparties" cp ON cp."id" = rc."counterpartyId"
CROSS JOIN LATERAL jsonb_array_elements(COALESCE((rc."draftInput"::jsonb)->'financials'->'years', '[]'::jsonb)) AS y
WHERE rc."status" = 'VALIDATED'
  AND (y->>'closingDate') ~ '^\d{4}-\d{2}-\d{2}$'
  AND jsonb_typeof(y->'values') = 'object'
  AND (y->'values') <> '{}'::jsonb
ORDER BY rc."counterpartyId", y->>'closingDate', rc."decidedAt" DESC NULLS LAST
ON CONFLICT ("counterpartyId", "closingDate") DO NOTHING;

COMMIT;
