
-- Tighten laundry_batches policies
DROP POLICY IF EXISTS "Authenticated can read laundry batches" ON public.laundry_batches;
DROP POLICY IF EXISTS "Authenticated can create laundry batches" ON public.laundry_batches;
DROP POLICY IF EXISTS "Authenticated can update laundry batches" ON public.laundry_batches;

CREATE POLICY "Staff can read laundry batches" ON public.laundry_batches
FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'recepcao'::app_role)
  OR private.has_role(auth.uid(), 'camareira'::app_role)
  OR private.has_role(auth.uid(), 'funcionario'::app_role)
);

CREATE POLICY "Staff can create laundry batches" ON public.laundry_batches
FOR INSERT TO authenticated
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'recepcao'::app_role)
  OR private.has_role(auth.uid(), 'camareira'::app_role)
  OR private.has_role(auth.uid(), 'funcionario'::app_role)
);

CREATE POLICY "Staff can update laundry batches" ON public.laundry_batches
FOR UPDATE TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'recepcao'::app_role)
  OR private.has_role(auth.uid(), 'camareira'::app_role)
  OR private.has_role(auth.uid(), 'funcionario'::app_role)
)
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'recepcao'::app_role)
  OR private.has_role(auth.uid(), 'camareira'::app_role)
  OR private.has_role(auth.uid(), 'funcionario'::app_role)
);

-- Tighten laundry_debt policies
DROP POLICY IF EXISTS "Authenticated can read laundry debt" ON public.laundry_debt;
DROP POLICY IF EXISTS "Authenticated can create laundry debt" ON public.laundry_debt;

CREATE POLICY "Staff can read laundry debt" ON public.laundry_debt
FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'recepcao'::app_role)
  OR private.has_role(auth.uid(), 'camareira'::app_role)
  OR private.has_role(auth.uid(), 'funcionario'::app_role)
);

CREATE POLICY "Staff can create laundry debt" ON public.laundry_debt
FOR INSERT TO authenticated
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'recepcao'::app_role)
  OR private.has_role(auth.uid(), 'camareira'::app_role)
  OR private.has_role(auth.uid(), 'funcionario'::app_role)
);

-- Tighten inventory_requests insert
DROP POLICY IF EXISTS "inv_req_insert" ON public.inventory_requests;

CREATE POLICY "inv_req_insert" ON public.inventory_requests
FOR INSERT TO authenticated
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'recepcao'::app_role)
  OR private.has_role(auth.uid(), 'camareira'::app_role)
  OR private.has_role(auth.uid(), 'funcionario'::app_role)
);
