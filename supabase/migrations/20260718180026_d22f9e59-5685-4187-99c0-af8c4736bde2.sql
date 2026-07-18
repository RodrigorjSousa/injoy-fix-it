
CREATE TABLE public.vistoria_checklist_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vistoria_checklist_items TO authenticated;
GRANT ALL ON public.vistoria_checklist_items TO service_role;

ALTER TABLE public.vistoria_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vci_select_authenticated" ON public.vistoria_checklist_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "vci_write_admin_gestor" ON public.vistoria_checklist_items
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'gestor'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'gestor'::public.app_role));

CREATE TRIGGER update_vistoria_checklist_items_updated_at
  BEFORE UPDATE ON public.vistoria_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.vistoria_checklist_items (item_name, sort_order) VALUES
  ('Ar condicionado testado e gelando', 10),
  ('Enxoval completo e cama montada', 20),
  ('Banheiro higienizado e com papel/toalhas', 30),
  ('Quarto cheiroso e sem poeira', 40),
  ('Controle remoto e TV funcionando', 50);
