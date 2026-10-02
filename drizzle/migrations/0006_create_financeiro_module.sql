CREATE TABLE public.fin_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  grupo text NOT NULL CHECK (grupo IN ('custo_fixo_operacional','pessoal','manutencao','insumos_operacao','comercial','impostos_taxas','administrativo','receita')),
  tipo text NOT NULL CHECK (tipo IN ('despesa','receita')),
  ordem integer NOT NULL DEFAULT 0 CHECK (ordem >= 0),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (nome, tipo)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_categorias TO authenticated;
GRANT ALL ON public.fin_categorias TO service_role;
ALTER TABLE public.fin_categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestores administram categorias financeiras" ON public.fin_categorias
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.fin_fornecedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cnpj_cpf text,
  categoria_padrao_id uuid REFERENCES public.fin_categorias(id) ON DELETE SET NULL,
  contato text,
  telefone text,
  chave_pix text,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_fornecedores TO authenticated;
GRANT ALL ON public.fin_fornecedores TO service_role;
ALTER TABLE public.fin_fornecedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestores administram fornecedores financeiros" ON public.fin_fornecedores
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER fin_fornecedores_updated_at BEFORE UPDATE ON public.fin_fornecedores
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.fin_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('despesa','receita')),
  unidade text NOT NULL CHECK (unidade IN ('Botafogo','Ipanema','Ambas')),
  categoria_id uuid NOT NULL REFERENCES public.fin_categorias(id),
  fornecedor_id uuid REFERENCES public.fin_fornecedores(id) ON DELETE SET NULL,
  descricao text NOT NULL,
  valor numeric(12,2) NOT NULL CHECK (valor > 0),
  competencia date NOT NULL CHECK (extract(day from competencia) = 1),
  data_vencimento date,
  data_pagamento date,
  status text NOT NULL DEFAULT 'a_pagar' CHECK (status IN ('previsto','a_pagar','pago','cancelado')),
  forma_pagamento text CHECK (forma_pagamento IS NULL OR forma_pagamento IN ('pix','boleto','cartao','dinheiro','transferencia','debito_automatico')),
  numero_documento text,
  anexo_path text,
  consumo_quantidade numeric CHECK (consumo_quantidade IS NULL OR consumo_quantidade > 0),
  consumo_unidade text CHECK (consumo_unidade IS NULL OR consumo_unidade IN ('kWh','m³')),
  funcionario_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  freelancer_nome text,
  qtd_diarias integer CHECK (qtd_diarias IS NULL OR qtd_diarias > 0),
  ativo_descricao text,
  recorrencia_id uuid REFERENCES public.fin_lancamentos(id) ON DELETE SET NULL,
  observacoes text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'pago' AND data_pagamento IS NOT NULL AND forma_pagamento IS NOT NULL) OR status <> 'pago'),
  CHECK (data_pagamento IS NULL OR status = 'pago')
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_lancamentos TO authenticated;
GRANT ALL ON public.fin_lancamentos TO service_role;
ALTER TABLE public.fin_lancamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestores administram lancamentos financeiros" ON public.fin_lancamentos
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK ((private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role)) AND created_by = auth.uid());
CREATE INDEX fin_lancamentos_competencia_unidade_idx ON public.fin_lancamentos (competencia, unidade);
CREATE INDEX fin_lancamentos_status_vencimento_idx ON public.fin_lancamentos (status, data_vencimento);
CREATE TRIGGER fin_lancamentos_updated_at BEFORE UPDATE ON public.fin_lancamentos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.fin_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  rateio_botafogo_pct numeric(5,2) NOT NULL DEFAULT 61.30 CHECK (rateio_botafogo_pct >= 0 AND rateio_botafogo_pct <= 100),
  rateio_ipanema_pct numeric(5,2) NOT NULL DEFAULT 38.70 CHECK (rateio_ipanema_pct >= 0 AND rateio_ipanema_pct <= 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (rateio_botafogo_pct + rateio_ipanema_pct = 100)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_config TO authenticated;
GRANT ALL ON public.fin_config TO service_role;
ALTER TABLE public.fin_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestores administram configuracao financeira" ON public.fin_config
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER fin_config_updated_at BEFORE UPDATE ON public.fin_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();