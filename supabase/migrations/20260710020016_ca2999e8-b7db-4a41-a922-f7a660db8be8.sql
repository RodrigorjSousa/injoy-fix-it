
-- 1. Convert user-callable SECURITY DEFINER wrappers in public to SECURITY INVOKER,
-- keeping the privileged logic in the private schema.

CREATE OR REPLACE FUNCTION public.chat_contacts()
RETURNS TABLE(id uuid, nome text)
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = public
AS $$ SELECT * FROM private.get_chat_contacts(); $$;

CREATE OR REPLACE FUNCTION public.get_recepcao_user_ids()
RETURNS TABLE(user_id uuid)
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = public
AS $$ SELECT * FROM private.get_recepcao_user_ids(); $$;

CREATE OR REPLACE FUNCTION public.get_camareiras_user_ids()
RETURNS TABLE(user_id uuid)
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = public
AS $$ SELECT * FROM private.get_camareiras_user_ids(); $$;

-- Move list_camareiras logic to private schema, expose invoker wrapper in public.
CREATE OR REPLACE FUNCTION private.list_camareiras()
RETURNS TABLE(id uuid, nome text)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.id, f.nome
  FROM public.funcionarios f
  JOIN public.user_roles ur ON ur.user_id = f.user_id
  WHERE ur.role = 'camareira'
  ORDER BY f.nome ASC
$$;

CREATE OR REPLACE FUNCTION public.list_camareiras()
RETURNS TABLE(id uuid, nome text)
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = public
AS $$ SELECT * FROM private.list_camareiras(); $$;

-- Grant authenticated users access to the private-schema helpers via the invoker wrappers.
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_chat_contacts() TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_recepcao_user_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_camareiras_user_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION private.list_camareiras() TO authenticated;

-- 2. Trigger-only SECURITY DEFINER functions: revoke direct execution.
REVOKE EXECUTE ON FUNCTION public.link_funcionario_to_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.link_funcionario_to_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.link_funcionario_to_user() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

-- 3. Replace permissive UPDATE policy on housekeeping_tasks with role-scoped access.
DROP POLICY IF EXISTS "Authenticated users can update housekeeping tasks" ON public.housekeeping_tasks;
CREATE POLICY "Staff roles can update housekeeping tasks"
ON public.housekeeping_tasks
FOR UPDATE
TO authenticated
USING (
  private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'recepcao'::app_role)
  OR private.has_role(auth.uid(), 'camareira'::app_role)
)
WITH CHECK (
  private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'recepcao'::app_role)
  OR private.has_role(auth.uid(), 'camareira'::app_role)
);

-- 4. Replace permissive SELECT policy on room_housekeeping with role-scoped access.
DROP POLICY IF EXISTS "Authenticated can read room_housekeeping" ON public.room_housekeeping;
CREATE POLICY "Staff roles can read room_housekeeping"
ON public.room_housekeeping
FOR SELECT
TO authenticated
USING (
  private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'recepcao'::app_role)
  OR private.has_role(auth.uid(), 'camareira'::app_role)
);
