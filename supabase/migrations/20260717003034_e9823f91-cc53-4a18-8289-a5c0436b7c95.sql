CREATE TABLE public.inventory_sectors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (property, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_sectors TO authenticated;
GRANT ALL ON public.inventory_sectors TO service_role;

ALTER TABLE public.inventory_sectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view sectors"
ON public.inventory_sectors FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins/gestores manage sectors"
ON public.inventory_sectors FOR ALL
TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role));

CREATE TRIGGER update_inventory_sectors_updated_at
BEFORE UPDATE ON public.inventory_sectors
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.inventory_sectors (property, name)
SELECT p.property, s.name
FROM (VALUES ('Botafogo'), ('Ipanema')) AS p(property)
CROSS JOIN (VALUES ('Banheiro'), ('Limpeza'), ('Elétrica'), ('Hidráulica'), ('Ar Condicionado'), ('Cozinha')) AS s(name)
ON CONFLICT (property, name) DO NOTHING;

INSERT INTO public.inventory_sectors (property, name)
SELECT DISTINCT property, sector FROM public.inventory_items
WHERE sector IS NOT NULL AND sector <> ''
ON CONFLICT (property, name) DO NOTHING;