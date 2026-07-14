
-- app_settings SELECT: gestor/admin only
DROP POLICY IF EXISTS "auth read settings" ON public.app_settings;
CREATE POLICY "gestor read settings" ON public.app_settings
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role));

-- beverage_catalog UPDATE: admin/gestor/recepcao
DROP POLICY IF EXISTS "beverage_catalog_update_auth" ON public.beverage_catalog;
CREATE POLICY "beverage_catalog_update_staff" ON public.beverage_catalog
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'recepcao'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'recepcao'::app_role));

-- beverage_sales SELECT + INSERT: admin/gestor/recepcao
DROP POLICY IF EXISTS "beverage_sales_select_auth" ON public.beverage_sales;
DROP POLICY IF EXISTS "beverage_sales_insert_auth" ON public.beverage_sales;
CREATE POLICY "beverage_sales_select_staff" ON public.beverage_sales
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'recepcao'::app_role));
CREATE POLICY "beverage_sales_insert_staff" ON public.beverage_sales
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'recepcao'::app_role));

-- extra_tasks_logs SELECT + INSERT: admin/gestor/camareira
DROP POLICY IF EXISTS "Authenticated can read extra_tasks_logs" ON public.extra_tasks_logs;
DROP POLICY IF EXISTS "Authenticated can insert extra_tasks_logs" ON public.extra_tasks_logs;
CREATE POLICY "extra_tasks_logs_select_staff" ON public.extra_tasks_logs
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'camareira'::app_role));
CREATE POLICY "extra_tasks_logs_insert_staff" ON public.extra_tasks_logs
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'camareira'::app_role));

-- laundry_logs SELECT + INSERT: admin/gestor/camareira
DROP POLICY IF EXISTS "Authenticated can read laundry_logs" ON public.laundry_logs;
DROP POLICY IF EXISTS "Authenticated can insert laundry_logs" ON public.laundry_logs;
CREATE POLICY "laundry_logs_select_staff" ON public.laundry_logs
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'camareira'::app_role));
CREATE POLICY "laundry_logs_insert_staff" ON public.laundry_logs
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'camareira'::app_role));

-- inventory_requests SELECT: admin/gestor/recepcao
DROP POLICY IF EXISTS "inv_req_read" ON public.inventory_requests;
CREATE POLICY "inv_req_read_staff" ON public.inventory_requests
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'recepcao'::app_role));
