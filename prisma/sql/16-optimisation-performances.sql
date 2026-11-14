-- ---------------------------------------------------------------------------
-- Optimisation des performances — migration d'une base existante. À appliquer
-- APRÈS 15 et AVANT de déployer la version correspondante. Une base neuve n'en
-- a pas besoin (« prisma db push »).
--
-- Idempotent : peut être rejoué sans effet de bord. Une seule transaction.
--
-- Mesuré sur 21 000 clients, 210 000 notations, 420 000 événements d'audit
-- (docs/31) :
--  - rating_runs.exposureBase : engagement global en devise de base, repris des
--    données du dossier (cours appliqué) ou de l'entrée de la notation ; la
--    surveillance ne relit plus les instantanés (7,3 s → voir docs/31) ;
--  - index de la note courante (client, arrêté, date) et des dernières
--    notations ; index du filtre par action du journal d'audit ;
--  - index des clés étrangères signalés par l'outil de diagnostic Supabase.
--
-- Aucune suppression : la migration est purement additive (l'index redondant
-- de financial_statements est conservé, son coût est négligeable).
--
-- Usage :
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/sql/16-optimisation-performances.sql
-- ---------------------------------------------------------------------------

BEGIN;

ALTER TABLE corp_scoring."rating_runs" ADD COLUMN IF NOT EXISTS "exposureBase" DECIMAL(20,2);

-- Reprise : même règle que la lecture applicative d'origine — montant converti
-- du dossier s'il existe, sinon engagement global déclaré à la notation. Une
-- valeur illisible (JSON invalide, texte) reste vide, sans interrompre la reprise.
CREATE OR REPLACE FUNCTION pg_temp.num_at(doc TEXT, path TEXT[]) RETURNS NUMERIC AS $$
DECLARE v TEXT;
BEGIN
  IF doc IS NULL THEN RETURN NULL; END IF;
  v := doc::jsonb #>> path;
  IF v ~ '^-?[0-9]+(\.[0-9]+)?$' THEN RETURN v::numeric; END IF;
  RETURN NULL;
EXCEPTION WHEN others THEN RETURN NULL;
END $$ LANGUAGE plpgsql IMMUTABLE;

UPDATE corp_scoring."rating_runs" r
SET "exposureBase" = COALESCE(
  (SELECT pg_temp.num_at(rc."fxDetail", '{amounts,globalBankExposure,base}') FROM corp_scoring."rating_cases" rc WHERE rc."runId" = r."id"),
  pg_temp.num_at(r."inputSnapshot", '{segmentationData,globalBankExposure}')
)
WHERE r."exposureBase" IS NULL;

CREATE INDEX IF NOT EXISTS "rating_runs_counterpartyId_asOfDate_createdAt_idx"
  ON corp_scoring."rating_runs" ("counterpartyId", "asOfDate" DESC, "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "rating_runs_createdAt_idx" ON corp_scoring."rating_runs" ("createdAt");
CREATE INDEX IF NOT EXISTS "audit_events_action_createdAt_idx" ON corp_scoring."audit_events" ("action", "createdAt");

CREATE INDEX IF NOT EXISTS "entities_parentId_idx" ON corp_scoring."entities" ("parentId");
CREATE INDEX IF NOT EXISTS "renotation_batches_scheduleId_idx" ON corp_scoring."renotation_batches" ("scheduleId");
CREATE INDEX IF NOT EXISTS "renotation_items_counterpartyId_idx" ON corp_scoring."renotation_items" ("counterpartyId");
CREATE INDEX IF NOT EXISTS "users_entityId_idx" ON corp_scoring."users" ("entityId");

ANALYZE corp_scoring."rating_runs";
ANALYZE corp_scoring."audit_events";

COMMIT;
