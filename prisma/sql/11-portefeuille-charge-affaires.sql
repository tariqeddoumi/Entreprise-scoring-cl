-- ---------------------------------------------------------------------------
-- Portefeuille par chargé d'affaires — migration d'une base existante. À
-- appliquer APRÈS 10-t24-credit-bureau-inforisque.sql et AVANT de déployer la
-- version correspondante. Une base neuve n'en a pas besoin (« prisma db push »).
--
-- Idempotent : peut être rejoué sans effet de bord. Une seule transaction.
--
-- Contenu :
--   - users."accountOfficerCode" : code gestionnaire T24 du chargé d'affaires,
--     qui le relie aux clients dont il est gestionnaire ;
--   - index sur counterparties."accountOfficer" (filtre du portefeuille) ;
--   - reprise : un client sans gestionnaire reçoit l'identifiant du compte qui
--     l'a créé (journal d'audit), s'il existe encore. Le directeur du centre
--     ou T24 le réaffectent ensuite.
--
-- Usage :
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/sql/11-portefeuille-charge-affaires.sql
-- ---------------------------------------------------------------------------

BEGIN;

ALTER TABLE corp_scoring."users" ADD COLUMN IF NOT EXISTS "accountOfficerCode" TEXT;
CREATE INDEX IF NOT EXISTS "counterparties_accountOfficer_idx"
  ON corp_scoring."counterparties" ("accountOfficer");

UPDATE corp_scoring."counterparties" cp
SET "accountOfficer" = src."actor"
FROM (
  SELECT DISTINCT ON (ae."resourceId") ae."resourceId", ae."actor"
  FROM corp_scoring."audit_events" ae
  WHERE ae."action" = 'COUNTERPARTY_CREATED' AND ae."resourceType" = 'Counterparty'
  ORDER BY ae."resourceId", ae."createdAt"
) src
JOIN corp_scoring."users" u ON u."username" = src."actor"
WHERE cp."id" = src."resourceId" AND cp."accountOfficer" IS NULL;

COMMIT;
