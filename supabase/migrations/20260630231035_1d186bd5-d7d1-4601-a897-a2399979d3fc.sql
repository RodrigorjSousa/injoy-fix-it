
CREATE OR REPLACE FUNCTION private.get_camareiras_user_ids()
RETURNS TABLE(user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$ SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'camareira'; $$;

CREATE OR REPLACE FUNCTION public.get_camareiras_user_ids()
RETURNS TABLE(user_id uuid)
LANGUAGE sql STABLE SET search_path = 'public'
AS $$ SELECT * FROM private.get_camareiras_user_ids(); $$;

REVOKE ALL ON FUNCTION public.get_camareiras_user_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_camareiras_user_ids() TO authenticated, service_role;
