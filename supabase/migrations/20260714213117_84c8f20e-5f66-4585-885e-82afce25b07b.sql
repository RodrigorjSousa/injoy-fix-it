
CREATE TABLE IF NOT EXISTS public.period_items_directory (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  property text NOT NULL,
  period text NOT NULL,
  item_name text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE(property, period, item_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.period_items_directory TO authenticated;
GRANT ALL ON public.period_items_directory TO service_role;

ALTER TABLE public.period_items_directory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "period_dir_read" ON public.period_items_directory
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "period_dir_write" ON public.period_items_directory
  FOR ALL TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role) OR
    private.has_role(auth.uid(), 'gestor'::app_role)
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::app_role) OR
    private.has_role(auth.uid(), 'gestor'::app_role)
  );

INSERT INTO public.period_items_directory (property, period, item_name) VALUES
('Botafogo', 'manha', 'Fazer café'),
('Botafogo', 'manha', 'Áreas comuns'),
('Botafogo', 'manha', 'Retirar lixo'),
('Botafogo', 'manha', 'Banheiro da recepção'),
('Botafogo', 'manha', 'Conferir roupas'),
('Botafogo', 'tarde', 'Áreas comuns'),
('Botafogo', 'tarde', 'Retirar lixo'),
('Botafogo', 'tarde', 'Banheiro da recepção'),
('Botafogo', 'tarde', 'Conferir roupas'),
('Botafogo', 'noite', 'Verificar o café'),
('Botafogo', 'noite', 'Áreas comuns'),
('Botafogo', 'noite', 'Retirar lixo'),
('Botafogo', 'noite', 'Banheiro da recepção'),
('Botafogo', 'noite', 'Conferir roupas')
ON CONFLICT DO NOTHING;

INSERT INTO public.period_items_directory (property, period, item_name)
SELECT 'Ipanema', period, item_name
FROM public.period_items_directory
WHERE property = 'Botafogo'
ON CONFLICT DO NOTHING;

ALTER PUBLICATION supabase_realtime ADD TABLE public.period_items_directory;
