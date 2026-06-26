DROP FUNCTION IF EXISTS public.get_recepcao_user_ids();

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.get_recepcao_user_ids()
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'recepcao';
$$;

CREATE OR REPLACE FUNCTION public.get_recepcao_user_ids()
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT * FROM private.get_recepcao_user_ids();
$$;

REVOKE ALL ON FUNCTION public.get_recepcao_user_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_recepcao_user_ids() TO authenticated;