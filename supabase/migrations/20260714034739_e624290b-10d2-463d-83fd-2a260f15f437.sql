
-- A. Inventory items
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property text NOT NULL,
  sector text NOT NULL,
  name text NOT NULL,
  current_stock integer NOT NULL DEFAULT 0,
  min_stock integer NOT NULL DEFAULT 5,
  unit_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property, sector, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_items_read" ON public.inventory_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "inv_items_write" ON public.inventory_items FOR ALL TO authenticated
  USING (
    private.has_role(auth.uid(),'admin'::public.app_role) OR
    private.has_role(auth.uid(),'gestor'::public.app_role) OR
    private.has_role(auth.uid(),'recepcao'::public.app_role)
  )
  WITH CHECK (
    private.has_role(auth.uid(),'admin'::public.app_role) OR
    private.has_role(auth.uid(),'gestor'::public.app_role) OR
    private.has_role(auth.uid(),'recepcao'::public.app_role)
  );

CREATE TRIGGER inv_items_updated_at BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- B. Inventory requests
CREATE TABLE IF NOT EXISTS public.inventory_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property text NOT NULL,
  requested_by text NOT NULL,
  item_id uuid REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  quantity integer NOT NULL,
  purpose text,
  status text NOT NULL DEFAULT 'pending',
  audited_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_requests TO authenticated;
GRANT ALL ON public.inventory_requests TO service_role;
ALTER TABLE public.inventory_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_req_read" ON public.inventory_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "inv_req_insert" ON public.inventory_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "inv_req_update" ON public.inventory_requests FOR UPDATE TO authenticated
  USING (
    private.has_role(auth.uid(),'admin'::public.app_role) OR
    private.has_role(auth.uid(),'gestor'::public.app_role) OR
    private.has_role(auth.uid(),'recepcao'::public.app_role)
  )
  WITH CHECK (
    private.has_role(auth.uid(),'admin'::public.app_role) OR
    private.has_role(auth.uid(),'gestor'::public.app_role) OR
    private.has_role(auth.uid(),'recepcao'::public.app_role)
  );
CREATE POLICY "inv_req_delete" ON public.inventory_requests FOR DELETE TO authenticated
  USING (
    private.has_role(auth.uid(),'admin'::public.app_role) OR
    private.has_role(auth.uid(),'gestor'::public.app_role)
  );

CREATE TRIGGER inv_req_updated_at BEFORE UPDATE ON public.inventory_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- C. Seed default items
INSERT INTO public.inventory_items (property, sector, name, current_stock, min_stock, unit_type) VALUES
  ('Botafogo', 'Banheiro', 'Mini Sabonete em Barra 15g', 200, 50, 'Unidades'),
  ('Botafogo', 'Banheiro', 'Mini Shampoo 30ml', 150, 40, 'Unidades'),
  ('Botafogo', 'Banheiro', 'Mini Condicionador 30ml', 150, 40, 'Unidades'),
  ('Botafogo', 'Banheiro', 'Papel Higiênico Folha Dupla', 120, 30, 'Rolos'),
  ('Botafogo', 'Banheiro', 'Saco de Lixo para Banheiro 15L', 80, 20, 'Unidades'),
  ('Botafogo', 'Limpeza', 'Desinfetante Perfumado', 10, 3, 'Litros'),
  ('Botafogo', 'Limpeza', 'Água Sanitária / Cloro', 15, 4, 'Litros'),
  ('Botafogo', 'Limpeza', 'Limpa Vidros Spray', 8, 2, 'Litros'),
  ('Botafogo', 'Limpeza', 'Esponja Dupla Face Multiuso', 40, 10, 'Unidades'),
  ('Botafogo', 'Limpeza', 'Pano de Microfibra Azul', 30, 8, 'Unidades'),
  ('Botafogo', 'Elétrica', 'Lâmpada LED 9W Branca', 25, 5, 'Unidades'),
  ('Botafogo', 'Elétrica', 'Fita Isolante 3M', 10, 2, 'Rolos'),
  ('Botafogo', 'Elétrica', 'Pilha Palito AAA (Controle)', 50, 15, 'Unidades'),
  ('Botafogo', 'Elétrica', 'Pilha Comum AA', 30, 10, 'Unidades'),
  ('Botafogo', 'Hidráulica', 'Fita Veda Rosca (Teflon)', 12, 3, 'Rolos'),
  ('Botafogo', 'Hidráulica', 'Sifão Universal Sanfonado', 8, 2, 'Unidades'),
  ('Botafogo', 'Hidráulica', 'Reparo Válvula de Descarga', 5, 2, 'Unidades'),
  ('Botafogo', 'Ar Condicionado', 'Filtro de Ar para Split', 6, 2, 'Unidades'),
  ('Botafogo', 'Ar Condicionado', 'Capacitor de Partida 35uF', 4, 1, 'Unidades'),
  ('Botafogo', 'Cozinha', 'Café Moído a Vácuo 500g', 15, 4, 'Pacotes'),
  ('Botafogo', 'Cozinha', 'Açúcar Refinado Sachê', 500, 100, 'Unidades'),
  ('Botafogo', 'Cozinha', 'Copo Plástico 200ml', 1000, 200, 'Unidades'),
  ('Botafogo', 'Cozinha', 'Adoçante Líquido 100ml', 6, 2, 'Unidades')
ON CONFLICT (property, sector, name) DO NOTHING;

INSERT INTO public.inventory_items (property, sector, name, current_stock, min_stock, unit_type)
SELECT 'Ipanema', sector, name, current_stock, min_stock, unit_type
FROM public.inventory_items WHERE property = 'Botafogo'
ON CONFLICT (property, sector, name) DO NOTHING;
