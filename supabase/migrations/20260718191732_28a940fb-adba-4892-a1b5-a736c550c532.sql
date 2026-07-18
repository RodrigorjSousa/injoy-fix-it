
ALTER TABLE public.funcionarios ADD COLUMN IF NOT EXISTS cpf text;

CREATE TABLE public.registro_ponto_pontomais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  data date NOT NULL,
  entrada time,
  almoco_saida time,
  almoco_retorno time,
  saida time,
  ultima_atualizacao timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (funcionario_id, data)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.registro_ponto_pontomais TO authenticated;
GRANT ALL ON public.registro_ponto_pontomais TO service_role;

ALTER TABLE public.registro_ponto_pontomais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestores gerenciam registros de ponto"
ON public.registro_ponto_pontomais
FOR ALL
TO authenticated
USING (private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Funcionário vê seus próprios registros de ponto"
ON public.registro_ponto_pontomais
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.funcionarios f
  WHERE f.id = registro_ponto_pontomais.funcionario_id
    AND f.user_id = auth.uid()
));

CREATE TRIGGER update_registro_ponto_pontomais_updated_at
BEFORE UPDATE ON public.registro_ponto_pontomais
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_registro_ponto_data ON public.registro_ponto_pontomais(data);
CREATE INDEX idx_registro_ponto_func ON public.registro_ponto_pontomais(funcionario_id);
