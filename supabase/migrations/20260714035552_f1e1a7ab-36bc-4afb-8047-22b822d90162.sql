
CREATE TABLE IF NOT EXISTS public.beverage_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property TEXT NOT NULL,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  current_stock INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(property, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.beverage_catalog TO authenticated;
GRANT ALL ON public.beverage_catalog TO service_role;

ALTER TABLE public.beverage_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "beverage_catalog_select_auth"
  ON public.beverage_catalog FOR SELECT TO authenticated USING (true);

CREATE POLICY "beverage_catalog_insert_admin"
  ON public.beverage_catalog FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role IN ('admin'::app_role, 'gestor'::app_role))
  );

CREATE POLICY "beverage_catalog_update_auth"
  ON public.beverage_catalog FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "beverage_catalog_delete_admin"
  ON public.beverage_catalog FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role IN ('admin'::app_role, 'gestor'::app_role))
  );

CREATE TRIGGER beverage_catalog_updated_at
  BEFORE UPDATE ON public.beverage_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.beverage_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property TEXT NOT NULL,
  product_id UUID REFERENCES public.beverage_catalog(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  total_price NUMERIC(10,2) NOT NULL,
  room_number TEXT,
  payment_method TEXT NOT NULL,
  registered_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.beverage_sales TO authenticated;
GRANT ALL ON public.beverage_sales TO service_role;

ALTER TABLE public.beverage_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "beverage_sales_select_auth"
  ON public.beverage_sales FOR SELECT TO authenticated USING (true);

CREATE POLICY "beverage_sales_insert_auth"
  ON public.beverage_sales FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS beverage_sales_property_created_idx
  ON public.beverage_sales(property, created_at DESC);

INSERT INTO public.beverage_catalog (property, name, price, current_stock, min_stock) VALUES
('Botafogo', 'Água Mineral sem Gás', 4.00, 60, 15),
('Botafogo', 'Água Mineral com Gás', 5.00, 40, 10),
('Botafogo', 'Coca-Cola Lata Normal', 6.00, 50, 12),
('Botafogo', 'Coca-Cola Lata Zero', 6.00, 50, 12),
('Botafogo', 'Cerveja Lata (Heineken)', 9.00, 48, 12),
('Ipanema', 'Água Mineral sem Gás', 4.00, 60, 15),
('Ipanema', 'Água Mineral com Gás', 5.00, 40, 10),
('Ipanema', 'Coca-Cola Lata Normal', 6.00, 50, 12),
('Ipanema', 'Coca-Cola Lata Zero', 6.00, 50, 12),
('Ipanema', 'Cerveja Lata (Heineken)', 9.00, 48, 12)
ON CONFLICT (property, name) DO NOTHING;
