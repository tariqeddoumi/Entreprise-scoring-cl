-- 14 — Alignement des noms de clés étrangères sur le schéma Prisma.
--
-- Trois clés étrangères créées par les premiers scripts portent un nom en
-- minuscules ; Prisma les attend en casse mixte. Définitions inchangées :
-- renommage seul (métadonnées), idempotent et transactionnel.
BEGIN;
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('overrides', 'overrides_ratingrunid_fkey', 'overrides_ratingRunId_fkey'),
      ('rating_runs', 'rating_runs_counterpartyid_fkey', 'rating_runs_counterpartyId_fkey'),
      ('webhook_deliveries', 'webhook_deliveries_subscriptionid_fkey', 'webhook_deliveries_subscriptionId_fkey')
    ) AS t(tbl, old_name, new_name)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'corp_scoring' AND c.conname = r.old_name
    ) THEN
      EXECUTE format('ALTER TABLE corp_scoring.%I RENAME CONSTRAINT %I TO %I', r.tbl, r.old_name, r.new_name);
    END IF;
  END LOOP;
END $$;
COMMIT;
