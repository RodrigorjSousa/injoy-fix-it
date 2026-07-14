
CREATE TABLE IF NOT EXISTS public.laundry_items_directory (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.laundry_items_directory TO authenticated;
GRANT ALL ON public.laundry_items_directory TO service_role;
ALTER TABLE public.laundry_items_directory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "laundry_dir_read" ON public.laundry_items_directory FOR SELECT TO authenticated USING (true);
CREATE POLICY "laundry_dir_write" ON public.laundry_items_directory FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role) OR private.has_role(auth.uid(),'gestor'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role) OR private.has_role(auth.uid(),'gestor'::public.app_role));

CREATE TABLE IF NOT EXISTS public.extra_tasks_directory (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.extra_tasks_directory TO authenticated;
GRANT ALL ON public.extra_tasks_directory TO service_role;
ALTER TABLE public.extra_tasks_directory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "extra_dir_read" ON public.extra_tasks_directory FOR SELECT TO authenticated USING (true);
CREATE POLICY "extra_dir_write" ON public.extra_tasks_directory FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role) OR private.has_role(auth.uid(),'gestor'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role) OR private.has_role(auth.uid(),'gestor'::public.app_role));

INSERT INTO public.extra_tasks_directory (name) VALUES
  ('Fazer café'),('Limpar banheiro comum'),('Limpar o chão da área comum'),('Varrer a frente do hotel'),('Trocar lixo da área comum')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.laundry_items_directory (name) VALUES
  ('Protetor Travesseiro'),('Capa de Almofada'),('Protetor Colchão Casal / Solteiro'),('Edredon'),('Manta'),
  ('Lençol Casal'),('Lençol King'),('Lençol Solteiro'),('Lençol Casal s/ Elástico'),('Lençol Solteiro s/ Elástico'),
  ('Fronha'),('Protetor Colchão Casal'),('Protetor Colchão Solteiro'),('Piso'),('Toalha Banho F. Prata'),
  ('Toalha Rosto'),('Toalha de Lavabo'),('Roupão'),('Travesseiro / Almofada'),('Capa Sofá'),('Capa Poltrona'),
  ('Toalha Mesa Retangular'),('Toalha Mesa Redonda'),('Lenços Seda'),('Guardanapos Linho'),('Guardanapos'),
  ('Cortinas M²'),('Tapete M²'),('Forro de Capa'),('Pano de Chão')
ON CONFLICT (name) DO NOTHING;
