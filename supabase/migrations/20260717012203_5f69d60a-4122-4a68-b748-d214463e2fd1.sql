CREATE TABLE public.trocas_turno (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unidade TEXT NOT NULL,
  funcionario_saida TEXT NOT NULL,
  funcionario_saida_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  funcionario_entrada TEXT NOT NULL,
  caixa_status TEXT NOT NULL DEFAULT 'batendo',
  caixa_obs TEXT,
  estoque_status TEXT NOT NULL DEFAULT 'batendo',
  estoque_obs TEXT,
  gastos_detalhes TEXT,
  maquina_bebidas TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trocas_turno TO authenticated;
GRANT ALL ON public.trocas_turno TO service_role;

ALTER TABLE public.trocas_turno ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tt_select" ON public.trocas_turno FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "tt_insert" ON public.trocas_turno FOR INSERT
  TO authenticated WITH CHECK (
    funcionario_saida_user_id IS NULL OR funcionario_saida_user_id = auth.uid()
  );

CREATE POLICY "tt_update" ON public.trocas_turno FOR UPDATE
  TO authenticated USING (
    private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role)
  );

CREATE POLICY "tt_delete" ON public.trocas_turno FOR DELETE
  TO authenticated USING (
    private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role)
  );

CREATE TRIGGER update_trocas_turno_updated_at
  BEFORE UPDATE ON public.trocas_turno
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_trocas_turno_unidade_created ON public.trocas_turno(unidade, created_at DESC);