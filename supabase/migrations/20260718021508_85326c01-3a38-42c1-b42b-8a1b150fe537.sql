
CREATE TABLE public.auditorias_almoxarifado (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unidade TEXT NOT NULL,
  funcionario_id UUID NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  funcionario_nome TEXT NOT NULL,
  gestor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  gestor_nome TEXT,
  tempo_limite TEXT NOT NULL,
  prazo_ate TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_andamento','concluido')),
  relatorio_final TEXT,
  iniciado_em TIMESTAMPTZ,
  concluido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_auditorias_almox_func ON public.auditorias_almoxarifado(funcionario_id, status);
CREATE INDEX idx_auditorias_almox_unidade ON public.auditorias_almoxarifado(unidade, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.auditorias_almoxarifado TO authenticated;
GRANT ALL ON public.auditorias_almoxarifado TO service_role;

ALTER TABLE public.auditorias_almoxarifado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestor/admin veem todas as auditorias"
  ON public.auditorias_almoxarifado FOR SELECT
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role));

CREATE POLICY "Funcionario ve suas auditorias"
  ON public.auditorias_almoxarifado FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = funcionario_id AND f.user_id = auth.uid()));

CREATE POLICY "Gestor/admin criam auditorias"
  ON public.auditorias_almoxarifado FOR INSERT
  TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role));

CREATE POLICY "Gestor/admin atualizam auditorias"
  ON public.auditorias_almoxarifado FOR UPDATE
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role));

CREATE POLICY "Funcionario atualiza sua auditoria"
  ON public.auditorias_almoxarifado FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = funcionario_id AND f.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = funcionario_id AND f.user_id = auth.uid()));

CREATE POLICY "Gestor/admin excluem auditorias"
  ON public.auditorias_almoxarifado FOR DELETE
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role));

CREATE TRIGGER update_auditorias_almox_updated_at
  BEFORE UPDATE ON public.auditorias_almoxarifado
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
