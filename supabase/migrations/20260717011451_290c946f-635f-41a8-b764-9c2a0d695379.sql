CREATE TABLE public.purchase_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  requester_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requester_role TEXT NOT NULL,
  item_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT,
  category TEXT,
  urgency TEXT NOT NULL DEFAULT 'normal',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_requests TO authenticated;
GRANT ALL ON public.purchase_requests TO service_role;

ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pr_select" ON public.purchase_requests FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "pr_insert" ON public.purchase_requests FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "pr_update" ON public.purchase_requests FOR UPDATE
  TO authenticated USING (
    private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role)
  );

CREATE POLICY "pr_delete" ON public.purchase_requests FOR DELETE
  TO authenticated USING (
    private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role)
  );

CREATE TRIGGER update_purchase_requests_updated_at
  BEFORE UPDATE ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_purchase_requests_property_status ON public.purchase_requests(property, status);
CREATE INDEX idx_purchase_requests_created_at ON public.purchase_requests(created_at DESC);