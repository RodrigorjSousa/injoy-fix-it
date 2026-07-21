
-- Helper: verifica se o usuário possui qualquer papel atribuído
CREATE OR REPLACE FUNCTION private.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

REVOKE EXECUTE ON FUNCTION private.is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_staff(uuid) TO authenticated, service_role;

-- beverage_catalog
DROP POLICY IF EXISTS "beverage_catalog_select_auth" ON public.beverage_catalog;
CREATE POLICY "beverage_catalog_select_staff" ON public.beverage_catalog
FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

-- inventory_items
DROP POLICY IF EXISTS "inv_items_read" ON public.inventory_items;
CREATE POLICY "inv_items_read_staff" ON public.inventory_items
FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

-- inventory_sectors
DROP POLICY IF EXISTS "Authenticated can view sectors" ON public.inventory_sectors;
CREATE POLICY "Staff can view sectors" ON public.inventory_sectors
FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

-- preventive_tasks
DROP POLICY IF EXISTS "prev_tasks_select_auth" ON public.preventive_tasks;
CREATE POLICY "prev_tasks_select_staff" ON public.preventive_tasks
FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

-- preventive_logs
DROP POLICY IF EXISTS "prev_logs_select_auth" ON public.preventive_logs;
CREATE POLICY "prev_logs_select_staff" ON public.preventive_logs
FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

-- period_items_directory
DROP POLICY IF EXISTS "period_dir_read" ON public.period_items_directory;
CREATE POLICY "period_dir_read_staff" ON public.period_items_directory
FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

-- extra_tasks_directory
DROP POLICY IF EXISTS "extra_dir_read" ON public.extra_tasks_directory;
CREATE POLICY "extra_dir_read_staff" ON public.extra_tasks_directory
FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

-- laundry_items_directory
DROP POLICY IF EXISTS "laundry_dir_read" ON public.laundry_items_directory;
CREATE POLICY "laundry_dir_read_staff" ON public.laundry_items_directory
FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

-- vistoria_checklist_items
DROP POLICY IF EXISTS "vci_select_authenticated" ON public.vistoria_checklist_items;
CREATE POLICY "vci_select_staff" ON public.vistoria_checklist_items
FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
