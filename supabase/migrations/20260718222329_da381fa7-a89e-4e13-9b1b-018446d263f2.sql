
CREATE TABLE public.config_bonificacao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  valor_nota_10 NUMERIC NOT NULL DEFAULT 40,
  valor_nota_9 NUMERIC NOT NULL DEFAULT 20,
  penalidade_1_ruim NUMERIC NOT NULL DEFAULT -20,
  penalidade_2_ruins NUMERIC NOT NULL DEFAULT -40,
  valor_elogio NUMERIC NOT NULL DEFAULT 20,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.config_bonificacao TO authenticated;
GRANT ALL ON public.config_bonificacao TO service_role;

ALTER TABLE public.config_bonificacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users read config bonificacao"
  ON public.config_bonificacao FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admin gestor manage config bonificacao"
  ON public.config_bonificacao FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'gestor'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'gestor'::public.app_role));

CREATE TRIGGER update_config_bonificacao_updated_at
  BEFORE UPDATE ON public.config_bonificacao
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.config_bonificacao (valor_nota_10, valor_nota_9, penalidade_1_ruim, penalidade_2_ruins, valor_elogio)
VALUES (40, 20, -20, -40, 20);

CREATE TABLE public.registros_bonificacao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  nome_hospede TEXT NOT NULL,
  nota_funcionarios NUMERIC NOT NULL,
  nota_geral NUMERIC NOT NULL,
  observacao TEXT,
  teve_elogio BOOLEAN NOT NULL DEFAULT false,
  valor_calculado NUMERIC NOT NULL DEFAULT 0,
  unidade TEXT NOT NULL,
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.registros_bonificacao TO authenticated;
GRANT ALL ON public.registros_bonificacao TO service_role;

ALTER TABLE public.registros_bonificacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recepcao gestor admin read registros bonif"
  ON public.registros_bonificacao FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'gestor'::public.app_role)
    OR private.has_role(auth.uid(), 'recepcao'::public.app_role)
  );

CREATE POLICY "Recepcao gestor admin insert registros bonif"
  ON public.registros_bonificacao FOR INSERT
  TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'gestor'::public.app_role)
    OR private.has_role(auth.uid(), 'recepcao'::public.app_role)
  );

CREATE POLICY "Admin gestor update registros bonif"
  ON public.registros_bonificacao FOR UPDATE
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'gestor'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'gestor'::public.app_role));

CREATE POLICY "Admin gestor delete registros bonif"
  ON public.registros_bonificacao FOR DELETE
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'gestor'::public.app_role));

CREATE TRIGGER update_registros_bonificacao_updated_at
  BEFORE UPDATE ON public.registros_bonificacao
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_registros_bonificacao_data ON public.registros_bonificacao (data DESC);
CREATE INDEX idx_registros_bonificacao_unidade ON public.registros_bonificacao (unidade, data DESC);
