-- 1) funcionarios: no more broad authenticated SELECT
DROP POLICY IF EXISTS "Authenticated users view operational staff" ON public.funcionarios;
CREATE POLICY "Gestor admin or own record view funcionarios"
ON public.funcionarios FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
);

-- safe staff directory for operational screens (no CPF; e-mail only for gestor/admin)
CREATE OR REPLACE FUNCTION public.list_staff_basic()
RETURNS TABLE(id uuid, nome text, email text, categorias text[], user_id uuid, telas_permitidas text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.id,
         f.nome,
         CASE WHEN private.has_role(auth.uid(), 'gestor'::app_role)
                OR private.has_role(auth.uid(), 'admin'::app_role)
              THEN f.email ELSE NULL END,
         COALESCE(f.categorias, ARRAY[]::text[]),
         f.user_id,
         f.telas_permitidas
  FROM public.funcionarios f
  WHERE private.is_staff(auth.uid())
  ORDER BY f.nome
$$;
REVOKE ALL ON FUNCTION public.list_staff_basic() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_staff_basic() TO authenticated, service_role;

-- 2) list_tecnicos: guard inside the definer function
CREATE OR REPLACE FUNCTION public.list_tecnicos()
RETURNS TABLE(id uuid, nome text, categorias text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.id, f.nome, COALESCE(f.categorias, ARRAY[]::text[])
  FROM public.funcionarios f
  WHERE private.is_staff(auth.uid())
  ORDER BY f.nome
$$;
REVOKE ALL ON FUNCTION public.list_tecnicos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_tecnicos() TO authenticated, service_role;

-- adjust_preventive_log_date already checks roles; make sure it is not public-executable
REVOKE ALL ON FUNCTION public.adjust_preventive_log_date(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_preventive_log_date(uuid, date) TO authenticated, service_role;

-- 3) chamados: staff only (or own ticket)
DROP POLICY IF EXISTS "Authenticated users read all chamados" ON public.chamados;
DROP POLICY IF EXISTS "Authenticated users update chamados" ON public.chamados;
CREATE POLICY "Staff read chamados"
ON public.chamados FOR SELECT TO authenticated
USING (private.is_staff(auth.uid()) OR criado_por = auth.uid());
CREATE POLICY "Staff update chamados"
ON public.chamados FOR UPDATE TO authenticated
USING (private.is_staff(auth.uid()))
WITH CHECK (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users create chamados" ON public.chamados;
CREATE POLICY "Staff create chamados"
ON public.chamados FOR INSERT TO authenticated
WITH CHECK (private.is_staff(auth.uid()) AND criado_por = auth.uid());

-- 4) inventory_movements: staff only insert
DROP POLICY IF EXISTS "Autenticados podem registrar movimentacoes" ON public.inventory_movements;
CREATE POLICY "Staff registram movimentacoes"
ON public.inventory_movements FOR INSERT TO authenticated
WITH CHECK (private.is_staff(auth.uid()));

-- 5) preventive_logs: staff only insert
DROP POLICY IF EXISTS "prev_logs_insert_auth" ON public.preventive_logs;
CREATE POLICY "prev_logs_insert_staff"
ON public.preventive_logs FOR INSERT TO authenticated
WITH CHECK (private.is_staff(auth.uid()));

-- 6) app_settings: only provisioned staff can read the operational keys
DROP POLICY IF EXISTS "authenticated read safe operational settings" ON public.app_settings;
CREATE POLICY "staff read operational settings"
ON public.app_settings FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR (
    private.is_staff(auth.uid())
    AND (key LIKE 'tarefas_extras_items:%' OR key = 'tarefas_extras_periodicity')
  )
);