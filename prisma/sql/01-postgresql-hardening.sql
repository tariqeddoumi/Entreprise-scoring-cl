-- ---------------------------------------------------------------------------
-- Durcissement PostgreSQL — À EXÉCUTER APRÈS « prisma db push ».
--
-- Prisma crée les tables, les index et les clés étrangères. Il ne gère ni les
-- droits, ni la sécurité au niveau des lignes, ni les déclencheurs. Ce script
-- apporte ces trois éléments et doit être rejoué à l'identique sur chaque
-- environnement (Supabase aujourd'hui, PostgreSQL autonome demain).
--
-- Idempotent : peut être exécuté plusieurs fois sans effet de bord.
--
-- Usage :
--   psql "$DIRECT_URL" -f prisma/sql/01-postgresql-hardening.sql
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on

-- --- 1. Isolation du schéma -------------------------------------------------
-- Les tables vivent dans « corp_scoring », jamais dans « public ». Sur une
-- base partagée (cas de Supabase où « public » héberge déjà les tables
-- d'autres applications), cela supprime tout risque de collision de noms.

CREATE SCHEMA IF NOT EXISTS corp_scoring;

COMMENT ON SCHEMA corp_scoring IS
  'Notation interne des entreprises TPE/PME/GE (Maroc). Schéma isolé, non exposé via PostgREST.';

-- --- 2. Retrait des droits aux rôles exposés publiquement --------------------
-- Sur Supabase, « anon » et « authenticated » sont accessibles depuis le
-- navigateur : la clé anon est publique par construction. Aucun de ces rôles
-- ne doit pouvoir atteindre les données de notation. Le bloc est conditionnel
-- car ces rôles n'existent pas sur un PostgreSQL autonome.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SCHEMA corp_scoring FROM anon;
    REVOKE ALL ON ALL TABLES IN SCHEMA corp_scoring FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA corp_scoring REVOKE ALL ON TABLES FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA corp_scoring FROM authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA corp_scoring FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA corp_scoring REVOKE ALL ON TABLES FROM authenticated;
  END IF;
END $$;

-- --- 3. Sécurité au niveau des lignes ---------------------------------------
-- Activée sans aucune politique : défense en profondeur. Même si le schéma
-- venait à être exposé par erreur, aucun rôle non privilégié n'obtiendrait de
-- ligne. Le rôle applicatif (propriétaire de la base) contourne la sécurité au
-- niveau des lignes ; l'application continue donc de fonctionner normalement.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'counterparties', 'rating_runs', 'overrides',
    'webhook_subscriptions', 'webhook_deliveries', 'audit_events'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'corp_scoring' AND tablename = t
    ) THEN
      EXECUTE format('ALTER TABLE corp_scoring.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

-- --- 4. Piste d'audit en ajout seul -----------------------------------------
-- L'application ne peut ni modifier ni supprimer un événement d'audit. Seul le
-- propriétaire de la table peut désactiver le déclencheur, opération qui laisse
-- elle-même une trace dans les journaux du moteur.

CREATE OR REPLACE FUNCTION corp_scoring.refuse_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION
    'audit_events est en ajout seul : % interdite', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS audit_events_append_only ON corp_scoring.audit_events;
CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON corp_scoring.audit_events
  FOR EACH ROW EXECUTE FUNCTION corp_scoring.refuse_audit_mutation();

-- --- 5. Contrôle ------------------------------------------------------------
-- Le script « npm run db:check » vérifie ces trois propriétés depuis
-- l'application. Exécutez-le après ce script.
