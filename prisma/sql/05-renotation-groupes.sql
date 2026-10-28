-- ---------------------------------------------------------------------------
-- Renotation par lot et groupes d'affaires — migration d'une base existante.
--
-- À appliquer AVANT de déployer la version qui introduit ces fonctions : le
-- code lit les nouvelles colonnes dès le démarrage. Une base neuve n'en a pas
-- besoin : « prisma db push » crée tout.
--
-- Idempotent : peut être rejoué sans effet de bord. Une seule transaction :
-- en cas d'erreur, rien n'est appliqué.
--
-- Contenu :
--   - groupes d'affaires (economic_groups) et rattachement des contreparties
--     (counterparties.economicGroupId) ;
--   - origine des notations (rating_runs.origin : API | CASE | BATCH). Les
--     notations existantes prennent « API » (dossier ou appel d'API) : aucune
--     n'est une notation de lot, la note officielle de chaque contrepartie ne
--     change donc pas. Celles qui proviennent d'un dossier sont reclassées
--     « CASE » pour la lisibilité ;
--   - planifications, lots et résultats par contrepartie de la renotation.
--
-- Usage :
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/sql/05-renotation-groupes.sql
--
-- Généré par « prisma migrate diff » puis rendu idempotent.
-- ---------------------------------------------------------------------------

BEGIN;

-- Origine des notations ----------------------------------------------------------

ALTER TABLE corp_scoring."rating_runs" ADD COLUMN IF NOT EXISTS "origin" TEXT NOT NULL DEFAULT 'API';
UPDATE corp_scoring."rating_runs" r SET "origin" = 'CASE'
  WHERE r."origin" = 'API'
    AND EXISTS (
      SELECT 1 FROM corp_scoring."rating_cases" c
      WHERE c."runId" = r."id" AND c."draftInput" NOT LIKE '{"apiRequest"%'
    );

-- Groupes d'affaires ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS corp_scoring."economic_groups" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "economic_groups_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "economic_groups_entityId_idx" ON corp_scoring."economic_groups"("entityId");
CREATE UNIQUE INDEX IF NOT EXISTS "economic_groups_entityId_code_key" ON corp_scoring."economic_groups"("entityId", "code");

ALTER TABLE corp_scoring."counterparties" ADD COLUMN IF NOT EXISTS "economicGroupId" TEXT;
CREATE INDEX IF NOT EXISTS "counterparties_economicGroupId_idx" ON corp_scoring."counterparties"("economicGroupId");

-- Renotation par lot ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS corp_scoring."renotation_schedules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entityId" TEXT,
    "writeScope" TEXT NOT NULL DEFAULT 'ENTITY',
    "filters" TEXT NOT NULL,
    "options" TEXT NOT NULL,
    "intervalMonths" INTEGER NOT NULL DEFAULT 1,
    "dayOfMonth" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastBatchId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "renotation_schedules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "renotation_schedules_isActive_nextRunAt_idx" ON corp_scoring."renotation_schedules"("isActive", "nextRunAt");

CREATE TABLE IF NOT EXISTS corp_scoring."renotation_batches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scheduleId" TEXT,
    "entityId" TEXT,
    "writeScope" TEXT NOT NULL DEFAULT 'ENTITY',
    "filters" TEXT NOT NULL,
    "options" TEXT NOT NULL,
    "asOfDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "lastError" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "renotation_batches_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "renotation_batches_status_idx" ON corp_scoring."renotation_batches"("status");
CREATE INDEX IF NOT EXISTS "renotation_batches_createdAt_idx" ON corp_scoring."renotation_batches"("createdAt");

CREATE TABLE IF NOT EXISTS corp_scoring."renotation_items" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "movement" TEXT,
    "updates" TEXT,
    "sourceCaseId" TEXT,
    "previousRunId" TEXT,
    "previousGrade" TEXT,
    "newGrade" TEXT,
    "outcome" TEXT,
    "notchDelta" INTEGER,
    "runId" TEXT,
    "caseId" TEXT,
    "messageFr" TEXT,
    "claimedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    CONSTRAINT "renotation_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "renotation_items_runId_key" ON corp_scoring."renotation_items"("runId");
CREATE INDEX IF NOT EXISTS "renotation_items_batchId_status_idx" ON corp_scoring."renotation_items"("batchId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "renotation_items_batchId_counterpartyId_key" ON corp_scoring."renotation_items"("batchId", "counterpartyId");

-- Clés étrangères (sans cascade : rien ne s'efface par ricochet) ----------------------

DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT * FROM (VALUES
      ('counterparties_economicGroupId_fkey',   'counterparties',     '"economicGroupId"', 'economic_groups'),
      ('economic_groups_entityId_fkey',         'economic_groups',    '"entityId"',        'entities'),
      ('renotation_batches_scheduleId_fkey',    'renotation_batches', '"scheduleId"',      'renotation_schedules'),
      ('renotation_items_batchId_fkey',         'renotation_items',   '"batchId"',         'renotation_batches'),
      ('renotation_items_counterpartyId_fkey',  'renotation_items',   '"counterpartyId"',  'counterparties'),
      ('renotation_items_runId_fkey',           'renotation_items',   '"runId"',           'rating_runs')
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

-- Durcissement : tables non lisibles par les rôles exposés publiquement
-- (Supabase) ; sécurité au niveau des lignes active, sans politique.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['economic_groups', 'renotation_schedules', 'renotation_batches', 'renotation_items']
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
