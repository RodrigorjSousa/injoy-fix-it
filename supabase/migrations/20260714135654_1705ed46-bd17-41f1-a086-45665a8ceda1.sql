
-- Índices para acelerar filtros e listagens
CREATE INDEX IF NOT EXISTS idx_chamados_unidade ON public.chamados(unidade);
CREATE INDEX IF NOT EXISTS idx_chamados_status ON public.chamados(status);
CREATE INDEX IF NOT EXISTS idx_chamados_created_at ON public.chamados(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chamados_responsavel ON public.chamados(responsavel_id);

CREATE INDEX IF NOT EXISTS idx_room_hk_property_status ON public.room_housekeeping(property, status);
CREATE INDEX IF NOT EXISTS idx_room_hk_assigned_camareira ON public.room_housekeeping(assigned_camareira);
CREATE INDEX IF NOT EXISTS idx_room_hk_updated_at ON public.room_housekeeping(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_room_inspections_prop_created ON public.room_inspections(property, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_inspections_inspector ON public.room_inspections(inspector_id);

CREATE INDEX IF NOT EXISTS idx_rhh_property_created ON public.room_housekeeping_history(property, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rhh_action_created ON public.room_housekeeping_history(action_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_req_prop_status_created ON public.inventory_requests(property, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_req_requester ON public.inventory_requests(requested_by);

CREATE INDEX IF NOT EXISTS idx_extra_tasks_logs_prop_created ON public.extra_tasks_logs(property, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_laundry_logs_prop_created ON public.laundry_logs(property, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_beverage_sales_created ON public.beverage_sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_beverage_catalog_property ON public.beverage_catalog(property);

CREATE INDEX IF NOT EXISTS idx_funcionarios_user_id ON public.funcionarios(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);

CREATE INDEX IF NOT EXISTS idx_hotel_metrics_property_date ON public.hotel_metrics(property, date DESC);
