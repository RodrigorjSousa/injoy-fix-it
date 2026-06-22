-- Add admin role and allow admins to manage gestor assignments

-- 1) Add 'admin' to enum (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
                 WHERE t.typname='app_role' AND e.enumlabel='admin') THEN
    ALTER TYPE public.app_role ADD VALUE 'admin';
  END IF;
END $$;