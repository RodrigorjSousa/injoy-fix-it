
CREATE TABLE public.inventory_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property TEXT NOT NULL,
  item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  unit_type TEXT,
  sector TEXT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('in','out')),
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  source TEXT,
  destination TEXT,
  performed_by TEXT,
  performed_by_user_id UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_inv_mov_property_created ON public.inventory_movements(property, created_at DESC);
CREATE INDEX idx_inv_mov_item ON public.inventory_movements(item_id);

GRANT SELECT, INSERT ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_movements TO service_role;

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Gestor/Recepcao pode ver movimentacoes"
  ON public.inventory_movements FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'gestor'::app_role)
    OR private.has_role(auth.uid(), 'recepcao'::app_role)
  );

CREATE POLICY "Autenticados podem registrar movimentacoes"
  ON public.inventory_movements FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
