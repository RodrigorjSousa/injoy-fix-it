CREATE TABLE public.fin_recorrencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('despesa','receita')),
  categoria_id uuid NOT NULL REFERENCES public.fin_categorias(id),
  fornecedor_id uuid REFERENCES public.fin_fornecedores(id) ON DELETE SET NULL,
  unidade text NOT NULL CHECK (unidade IN ('Botafogo','Ipanema','Ambas')),
  valor_previsto numeric(12,2) NOT NULL CHECK (valor_previsto > 0),
  dia_vencimento integer NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 31),
  forma_pagamento text CHECK (forma_pagamento IS NULL OR forma_pagamento IN ('pix','boleto','cartao','dinheiro','transferencia','debito_automatico')),
  valor_variavel boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_recorrencias TO authenticated;
GRANT ALL ON public.fin_recorrencias TO service_role;
ALTER TABLE public.fin_recorrencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestores administram recorrencias financeiras" ON public.fin_recorrencias
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK ((private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role)) AND created_by = auth.uid());
CREATE TRIGGER fin_recorrencias_updated_at BEFORE UPDATE ON public.fin_recorrencias
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.fin_lancamentos
ADD COLUMN recorrencia_modelo_id uuid REFERENCES public.fin_recorrencias(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.fin_lancamentos.recorrencia_id IS 'DEPRECATED: vínculo legado entre lançamentos duplicados; modelos mensais usam recorrencia_modelo_id';
CREATE UNIQUE INDEX fin_lancamentos_recorrencia_modelo_competencia_uidx
ON public.fin_lancamentos (recorrencia_modelo_id, competencia)
WHERE recorrencia_modelo_id IS NOT NULL;

CREATE TABLE public.fin_indicadores_mes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade text NOT NULL CHECK (unidade IN ('Botafogo','Ipanema')),
  competencia date NOT NULL CHECK (extract(day from competencia) = 1),
  diarias_vendidas integer NOT NULL DEFAULT 0 CHECK (diarias_vendidas >= 0),
  receita_hospedagem numeric(12,2) NOT NULL DEFAULT 0 CHECK (receita_hospedagem >= 0),
  ocupacao_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (ocupacao_pct BETWEEN 0 AND 100),
  observacoes text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unidade, competencia)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_indicadores_mes TO authenticated;
GRANT ALL ON public.fin_indicadores_mes TO service_role;
ALTER TABLE public.fin_indicadores_mes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestores administram indicadores financeiros" ON public.fin_indicadores_mes
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK ((private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role)) AND created_by = auth.uid());
CREATE INDEX fin_indicadores_competencia_unidade_idx ON public.fin_indicadores_mes (competencia, unidade);
CREATE TRIGGER fin_indicadores_mes_updated_at BEFORE UPDATE ON public.fin_indicadores_mes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.fin_gerar_mes(_competencia date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_competencia date := date_trunc('month', _competencia)::date;
  v_created integer;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    private.has_role(auth.uid(), 'gestor'::public.app_role)
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Acesso restrito aos gestores';
  END IF;

  INSERT INTO public.fin_lancamentos (
    tipo, unidade, categoria_id, fornecedor_id, descricao, valor,
    competencia, data_vencimento, status, forma_pagamento,
    recorrencia_modelo_id, observacoes, created_by
  )
  SELECT
    r.tipo,
    r.unidade,
    r.categoria_id,
    r.fornecedor_id,
    r.descricao,
    r.valor_previsto,
    v_competencia,
    LEAST(
      (v_competencia + (r.dia_vencimento - 1) * interval '1 day')::date,
      (v_competencia + interval '1 month - 1 day')::date
    ),
    'previsto',
    NULL,
    r.id,
    CASE WHEN r.valor_variavel THEN 'Valor variável: atualizar quando a conta chegar.' ELSE NULL END,
    auth.uid()
  FROM public.fin_recorrencias r
  WHERE r.ativo
  ON CONFLICT (recorrencia_modelo_id, competencia) WHERE recorrencia_modelo_id IS NOT NULL DO NOTHING;

  GET DIAGNOSTICS v_created = ROW_COUNT;
  RETURN v_created;
END;
$$;
REVOKE ALL ON FUNCTION public.fin_gerar_mes(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_gerar_mes(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_gerar_mes(date) TO service_role;