-- ---------------------------------------------------------------------------
-- Engagements du client ligne par ligne — migration d'une base existante. À
-- appliquer APRÈS 11-portefeuille-charge-affaires.sql et AVANT de déployer la
-- version correspondante. Une base neuve n'en a pas besoin (« prisma db push »).
--
-- Idempotent : peut être rejoué sans effet de bord. Une seule transaction.
--
-- Contenu : table credit_facilities (autorisations, crédits, engagements par
-- signature), rapatriées de T24 (limites du client) ou saisies.
--
-- Usage :
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/sql/12-engagements-ligne-par-ligne.sql
-- ---------------------------------------------------------------------------

BEGIN;

CREATE TABLE IF NOT EXISTS corp_scoring."credit_facilities" (
  "id"             TEXT PRIMARY KEY,
  "counterpartyId" TEXT NOT NULL REFERENCES corp_scoring."counterparties"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "source"         TEXT NOT NULL,
  "reference"      TEXT,
  "typeCode"       TEXT NOT NULL,
  "labelFr"        TEXT,
  "authorized"     DECIMAL(18,2),
  "outstanding"    DECIMAL(18,2),
  "overdue"        DECIMAL(18,2),
  "overdueDays"    INTEGER,
  "startDate"      TEXT,
  "maturityDate"   TEXT,
  "guarantees"     TEXT,
  "guaranteeValue" DECIMAL(18,2),
  "status"         TEXT NOT NULL DEFAULT 'ACTIVE',
  "asOfDate"       TEXT NOT NULL,
  "recordedBy"     TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "credit_facilities_counterpartyId_idx"
  ON corp_scoring."credit_facilities" ("counterpartyId");

-- Mêmes protections que les autres tables (01-postgresql-hardening.sql).
ALTER TABLE corp_scoring."credit_facilities" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON corp_scoring."credit_facilities" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON corp_scoring."credit_facilities" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON corp_scoring."credit_facilities" FROM authenticated';
  END IF;
END $$;

COMMIT;
