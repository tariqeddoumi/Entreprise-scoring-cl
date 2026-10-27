-- ---------------------------------------------------------------------------
-- Multi-banques et filiales, multi-devise, workflow des dossiers, IA,
-- paramétrage — migration d'une base existante.
--
-- À appliquer AVANT de déployer la version qui introduit ces fonctions : le
-- code lit les nouvelles colonnes dès le démarrage. Une base neuve n'en a pas
-- besoin : « prisma db push » crée tout.
--
-- Idempotent : peut être rejoué sans effet de bord. Une seule transaction :
-- en cas d'erreur, rien n'est appliqué.
--
-- Reprise de l'existant :
--   - une entité racine « GROUPE » (id ent_groupe) est créée ; toutes les
--     contreparties existantes lui sont rattachées. L'administrateur crée
--     ensuite les banques et filiales (Paramétrage › Banques et filiales) et y
--     déplace les contreparties si besoin ;
--   - l'unicité de l'ICE devient « par entité » : un même ICE peut être suivi
--     par la banque marocaine et par une filiale ;
--   - les comptes existants restent sans entité : un ADMIN garde l'accès à
--     tout le groupe, les autres profils n'ont plus accès à rien tant qu'un
--     administrateur ne les a pas rattachés (Paramétrage › Utilisateurs) ;
--   - les notations existantes n'ont pas de dossier : elles restent la note
--     officielle de leur contrepartie (antérieures au workflow).
--
-- Usage :
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/sql/04-multi-entites-workflow-ia.sql
--
-- Généré par « prisma migrate diff » puis rendu idempotent.
-- ---------------------------------------------------------------------------

BEGIN;

-- Entités (banques, filiales) --------------------------------------------------

CREATE TABLE IF NOT EXISTS corp_scoring."entities" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "parentId" TEXT,
    "path" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "country" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'MAD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "toolName" TEXT,
    "logoUrl" TEXT,
    "primaryColor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "entities_code_key" ON corp_scoring."entities"("code");
CREATE INDEX IF NOT EXISTS "entities_path_idx" ON corp_scoring."entities"("path");

INSERT INTO corp_scoring."entities" ("id", "code", "name", "type", "parentId", "path", "level", "country", "currency", "updatedAt")
VALUES ('ent_groupe', 'GROUPE', 'Groupe', 'GROUP', NULL, '/ent_groupe/', 0, 'MA', 'MAD', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Cours de change et paramétrage -------------------------------------------------

CREATE TABLE IF NOT EXISTS corp_scoring."exchange_rates" (
    "id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "effectiveDate" TEXT NOT NULL,
    "source" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "exchange_rates_currency_effectiveDate_key"
  ON corp_scoring."exchange_rates"("currency", "effectiveDate");

CREATE TABLE IF NOT EXISTS corp_scoring."app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- Contreparties : entité, pays, devise -------------------------------------------

ALTER TABLE corp_scoring."counterparties" ADD COLUMN IF NOT EXISTS "country" TEXT;
ALTER TABLE corp_scoring."counterparties" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'MAD';
ALTER TABLE corp_scoring."counterparties" ADD COLUMN IF NOT EXISTS "entityId" TEXT;
UPDATE corp_scoring."counterparties" SET "entityId" = 'ent_groupe' WHERE "entityId" IS NULL;
ALTER TABLE corp_scoring."counterparties" ALTER COLUMN "entityId" SET NOT NULL;

DROP INDEX IF EXISTS corp_scoring."counterparties_ice_key";
CREATE INDEX IF NOT EXISTS "counterparties_entityId_idx" ON corp_scoring."counterparties"("entityId");
CREATE UNIQUE INDEX IF NOT EXISTS "counterparties_entityId_ice_key" ON corp_scoring."counterparties"("entityId", "ice");

-- Journal et comptes ---------------------------------------------------------------

ALTER TABLE corp_scoring."audit_events" ADD COLUMN IF NOT EXISTS "entityId" TEXT;
CREATE INDEX IF NOT EXISTS "audit_events_entityId_createdAt_idx" ON corp_scoring."audit_events"("entityId", "createdAt");

ALTER TABLE corp_scoring."users" ADD COLUMN IF NOT EXISTS "entityId" TEXT;
ALTER TABLE corp_scoring."users" ADD COLUMN IF NOT EXISTS "writeScope" TEXT NOT NULL DEFAULT 'ENTITY';

-- Dossiers de notation, pièces, propositions de l'IA ---------------------------------

CREATE TABLE IF NOT EXISTS corp_scoring."rating_cases" (
    "id" TEXT NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "asOfDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "draftInput" TEXT NOT NULL,
    "fxDetail" TEXT,
    "runId" TEXT,
    "createdBy" TEXT NOT NULL,
    "submittedBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rating_cases_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "rating_cases_runId_key" ON corp_scoring."rating_cases"("runId");
CREATE INDEX IF NOT EXISTS "rating_cases_counterpartyId_createdAt_idx" ON corp_scoring."rating_cases"("counterpartyId", "createdAt");
CREATE INDEX IF NOT EXISTS "rating_cases_status_idx" ON corp_scoring."rating_cases"("status");

CREATE TABLE IF NOT EXISTS corp_scoring."case_documents" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "case_documents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "case_documents_caseId_idx" ON corp_scoring."case_documents"("caseId");

CREATE TABLE IF NOT EXISTS corp_scoring."ai_proposals" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "source" TEXT,
    "rationale" TEXT,
    "confidence" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "model" TEXT NOT NULL,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_proposals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ai_proposals_caseId_status_idx" ON corp_scoring."ai_proposals"("caseId", "status");

-- Clés étrangères (sans cascade : rien ne s'efface par ricochet) ----------------------

DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT * FROM (VALUES
      ('entities_parentId_fkey',         'entities',       '"parentId"',       'entities'),
      ('counterparties_entityId_fkey',   'counterparties', '"entityId"',       'entities'),
      ('users_entityId_fkey',            'users',          '"entityId"',       'entities'),
      ('rating_cases_counterpartyId_fkey','rating_cases',  '"counterpartyId"', 'counterparties'),
      ('rating_cases_runId_fkey',        'rating_cases',   '"runId"',          'rating_runs'),
      ('case_documents_caseId_fkey',     'case_documents', '"caseId"',         'rating_cases'),
      ('ai_proposals_caseId_fkey',       'ai_proposals',   '"caseId"',         'rating_cases')
    ) AS t(name, tbl, col, ref)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = fk.name AND conrelid = format('corp_scoring.%I', fk.tbl)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE corp_scoring.%I ADD CONSTRAINT %I FOREIGN KEY (%s) REFERENCES corp_scoring.%I("id") ON DELETE NO ACTION ON UPDATE NO ACTION',
        fk.tbl, fk.name, fk.col, fk.ref
      );
    END IF;
  END LOOP;
END $$;

-- Durcissement : aucune de ces tables n'est lisible par les rôles exposés
-- publiquement (Supabase) ; sécurité au niveau des lignes active, sans
-- politique : seul le rôle de l'application (propriétaire) y accède.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['entities', 'exchange_rates', 'app_settings', 'rating_cases', 'case_documents', 'ai_proposals']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON corp_scoring.%I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON corp_scoring.%I FROM authenticated', t);
    END IF;
    EXECUTE format('ALTER TABLE corp_scoring.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

COMMIT;
