-- ---------------------------------------------------------------------------
-- Corrections du diagnostic du 1er novembre 2026 — migration d'une base
-- existante. À appliquer APRÈS 05-renotation-groupes.sql et AVANT de déployer
-- la version correspondante. Une base neuve n'en a pas besoin : « prisma db
-- push » crée tout, sauf l'index unique partiel ci-dessous, à appliquer aussi.
--
-- Idempotent : peut être rejoué sans effet de bord. Une seule transaction.
--
-- Contenu :
--   - souscriptions de webhooks rattachées à une entité (S01) : les
--     souscriptions existantes restent « groupe entier » (entité nulle) ;
--   - outbox des événements sortants, écrite dans la transaction métier ;
--   - une seule dérogation en attente par notation (index unique partiel) :
--     protège de deux demandes simultanées. Si la base porte déjà plusieurs
--     demandes en attente sur une même notation, les plus anciennes sont
--     closes (REJECTED, motif tracé) avant la création de l'index.
--
-- Usage :
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/sql/06-diagnostic-novembre-2026.sql
-- ---------------------------------------------------------------------------

BEGIN;

ALTER TABLE corp_scoring."webhook_subscriptions" ADD COLUMN IF NOT EXISTS "entityId" TEXT;
CREATE INDEX IF NOT EXISTS "webhook_subscriptions_entityId_idx" ON corp_scoring."webhook_subscriptions"("entityId");

CREATE TABLE IF NOT EXISTS corp_scoring."outbox_events" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "entityId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),
    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "outbox_events_eventId_key" ON corp_scoring."outbox_events"("eventId");
CREATE INDEX IF NOT EXISTS "outbox_events_status_nextAttemptAt_idx" ON corp_scoring."outbox_events"("status", "nextAttemptAt");

-- Doublons de demandes en attente : seule la plus récente reste en attente.
UPDATE corp_scoring."overrides" o
   SET "status" = 'REJECTED',
       "decidedBy" = 'migration-06',
       "decidedAt" = CURRENT_TIMESTAMP,
       "decisionComment" = 'Demande en attente en double, close par la migration 06 (une seule demande en attente par notation).'
 WHERE o."status" = 'PENDING'
   AND EXISTS (
     SELECT 1 FROM corp_scoring."overrides" n
      WHERE n."ratingRunId" = o."ratingRunId" AND n."status" = 'PENDING' AND n."createdAt" > o."createdAt"
   );
CREATE UNIQUE INDEX IF NOT EXISTS "overrides_one_pending_per_run"
    ON corp_scoring."overrides"("ratingRunId") WHERE "status" = 'PENDING';

-- Durcissement : table non lisible par les rôles exposés publiquement.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON corp_scoring."outbox_events" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON corp_scoring."outbox_events" FROM authenticated';
  END IF;
  EXECUTE 'ALTER TABLE corp_scoring."outbox_events" ENABLE ROW LEVEL SECURITY';
END $$;

COMMIT;
