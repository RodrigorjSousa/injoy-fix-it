
-- 1) user_roles: only admins grant/revoke staff roles (block gestor privilege escalation)
DROP POLICY IF EXISTS "Gestores can grant staff roles" ON public.user_roles;
DROP POLICY IF EXISTS "Gestores can revoke staff roles" ON public.user_roles;

CREATE POLICY "Admins can grant staff roles"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::app_role)
    AND role = ANY (ARRAY['camareira'::app_role, 'recepcao'::app_role, 'funcionario'::app_role])
  );

CREATE POLICY "Admins can revoke staff roles"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    AND role = ANY (ARRAY['camareira'::app_role, 'recepcao'::app_role, 'funcionario'::app_role])
  );

-- 2) recados_gestor: restrict SELECT to staff with a role
DROP POLICY IF EXISTS "Authenticated pode ler recados do gestor" ON public.recados_gestor;

CREATE POLICY "Staff pode ler recados do gestor"
  ON public.recados_gestor FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'gestor'::app_role)
    OR private.has_role(auth.uid(), 'recepcao'::app_role)
    OR private.has_role(auth.uid(), 'camareira'::app_role)
    OR private.has_role(auth.uid(), 'funcionario'::app_role)
  );

-- 3) trocas_turno: remove fuzzy name matching branch
DROP POLICY IF EXISTS "tt_select" ON public.trocas_turno;

CREATE POLICY "tt_select"
  ON public.trocas_turno FOR SELECT
  TO authenticated
  USING (
    funcionario_saida_user_id = auth.uid()
    OR private.has_role(auth.uid(), 'gestor'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
  );

-- 4) storage housekeeping-media: restrict to staff roles
DROP POLICY IF EXISTS "housekeeping_media_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "housekeeping_media_read_authenticated" ON storage.objects;

CREATE POLICY "housekeeping_media_insert_staff"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'housekeeping-media'
    AND owner = auth.uid()
    AND (
      private.has_role(auth.uid(), 'admin'::app_role)
      OR private.has_role(auth.uid(), 'gestor'::app_role)
      OR private.has_role(auth.uid(), 'recepcao'::app_role)
      OR private.has_role(auth.uid(), 'camareira'::app_role)
      OR private.has_role(auth.uid(), 'funcionario'::app_role)
    )
  );

CREATE POLICY "housekeeping_media_read_staff"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'housekeeping-media'
    AND (
      private.has_role(auth.uid(), 'admin'::app_role)
      OR private.has_role(auth.uid(), 'gestor'::app_role)
      OR private.has_role(auth.uid(), 'recepcao'::app_role)
      OR private.has_role(auth.uid(), 'camareira'::app_role)
      OR private.has_role(auth.uid(), 'funcionario'::app_role)
    )
  );

-- 5) Revoke EXECUTE on SECURITY DEFINER trigger functions from anon/authenticated.
-- Triggers still run as the function owner regardless of EXECUTE grants.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_funcionario_to_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_purchase_request_identity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_troca_turno_identity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_ativos_ar_tecnico_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_rotinas_locais_ultima_execucao() FROM PUBLIC, anon, authenticated;

-- list_tecnicos is called as RPC by signed-in staff; keep authenticated, remove anon/PUBLIC.
REVOKE EXECUTE ON FUNCTION public.list_tecnicos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_tecnicos() TO authenticated;
