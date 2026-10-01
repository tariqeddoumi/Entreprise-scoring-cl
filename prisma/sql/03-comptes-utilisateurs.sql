-- ---------------------------------------------------------------------------
-- Comptes nominatifs de l'interface web — migration d'une base existante.
--
-- À appliquer AVANT de déployer la version qui introduit la connexion par
-- identifiant et mot de passe : sans ces tables, plus personne ne pourrait
-- ouvrir de session dans l'interface. Une base neuve n'en a pas besoin :
-- « prisma db push » crée toutes les tables.
--
-- Idempotent : peut être rejoué sans effet de bord.
--
-- Usage :
--   psql "$DIRECT_URL" -f prisma/sql/03-comptes-utilisateurs.sql
--   puis : npm run users:create -- --username <identifiant> --name "<Nom>" --role ADMIN
--
-- Généré par « prisma migrate diff » puis rendu idempotent ; le durcissement
-- (droits des rôles exposés, sécurité au niveau des lignes) est repris de
-- 01-postgresql-hardening.sql, qui couvre lui aussi ces deux tables.
-- ---------------------------------------------------------------------------

SET search_path TO corp_scoring;

CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "user_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_username_key" ON "users"("username");
CREATE INDEX IF NOT EXISTS "user_sessions_userId_idx" ON "user_sessions"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_sessions_userId_fkey'
  ) THEN
    ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Durcissement : aucune empreinte de mot de passe ni session lisible par les
-- rôles exposés publiquement (Supabase), sécurité au niveau des lignes active.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON corp_scoring.users, corp_scoring.user_sessions FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON corp_scoring.users, corp_scoring.user_sessions FROM authenticated;
  END IF;
END $$;

ALTER TABLE corp_scoring.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE corp_scoring.user_sessions ENABLE ROW LEVEL SECURITY;
