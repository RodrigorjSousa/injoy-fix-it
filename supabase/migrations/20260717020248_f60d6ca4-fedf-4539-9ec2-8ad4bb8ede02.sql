
-- Tighten SELECT on funcionarios: owner (user_id) or gestor/admin
DROP POLICY IF EXISTS "Autenticados leem funcionarios" ON public.funcionarios;
CREATE POLICY "Funcionarios visíveis para dono ou gestor"
  ON public.funcionarios FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR private.has_role(auth.uid(), 'gestor'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
  );

-- Tighten SELECT on purchase_requests: requester or gestor/admin
DROP POLICY IF EXISTS "pr_select" ON public.purchase_requests;
CREATE POLICY "pr_select"
  ON public.purchase_requests FOR SELECT
  TO authenticated
  USING (
    requester_user_id = auth.uid()
    OR private.has_role(auth.uid(), 'gestor'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
  );

-- Tighten INSERT on purchase_requests: authenticated user must be the requester (or leave null; but require signed-in)
DROP POLICY IF EXISTS "pr_insert" ON public.purchase_requests;
CREATE POLICY "pr_insert"
  ON public.purchase_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    requester_user_id IS NULL OR requester_user_id = auth.uid()
  );

-- Tighten SELECT on trocas_turno: gestor/admin or the employee who signed off
DROP POLICY IF EXISTS "tt_select" ON public.trocas_turno;
CREATE POLICY "tt_select"
  ON public.trocas_turno FOR SELECT
  TO authenticated
  USING (
    funcionario_saida_user_id = auth.uid()
    OR private.has_role(auth.uid(), 'gestor'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
  );
