
CREATE TABLE IF NOT EXISTS public.laundry_batches (
  batch_id TEXT PRIMARY KEY,
  property TEXT NOT NULL,
  sent_by TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_by TEXT,
  received_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'transit',
  items_sent JSONB NOT NULL,
  items_received JSONB,
  missing_items JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.laundry_batches TO authenticated;
GRANT ALL ON public.laundry_batches TO service_role;
ALTER TABLE public.laundry_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read laundry batches" ON public.laundry_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create laundry batches" ON public.laundry_batches FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update laundry batches" ON public.laundry_batches FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Gestor admin delete laundry batches" ON public.laundry_batches FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'gestor'::public.app_role));
CREATE TRIGGER update_laundry_batches_updated_at BEFORE UPDATE ON public.laundry_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_laundry_batches_property_status ON public.laundry_batches(property, status);

CREATE TABLE IF NOT EXISTS public.laundry_debt (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property TEXT NOT NULL,
  batch_id TEXT REFERENCES public.laundry_batches(batch_id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  quantity_missing INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.laundry_debt TO authenticated;
GRANT ALL ON public.laundry_debt TO service_role;
ALTER TABLE public.laundry_debt ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read laundry debt" ON public.laundry_debt FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create laundry debt" ON public.laundry_debt FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Gestor admin update laundry debt" ON public.laundry_debt FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'gestor'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'gestor'::public.app_role));
CREATE POLICY "Gestor admin delete laundry debt" ON public.laundry_debt FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'gestor'::public.app_role));
CREATE TRIGGER update_laundry_debt_updated_at BEFORE UPDATE ON public.laundry_debt
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_laundry_debt_property_status ON public.laundry_debt(property, status);
