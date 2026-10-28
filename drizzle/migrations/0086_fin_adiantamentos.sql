-- Financeiro › Adiantamentos: dinheiro adiantado a funcionários e freelancers, descontado no pagamento.
-- O adiantamento não é despesa (é um valor a descontar). Quando o gestor marca como pago o salário /
-- os plantões da pessoa, os adiantamentos em aberto são abatidos e o lançamento guarda quanto foi
-- descontado (o custo do mês continua sendo o valor cheio do lançamento).
-- Se o pagamento for desfeito (lançamento volta de "pago" ou é excluído), os adiantamentos reabrem.
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.fin_adiantamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  pessoa_nome text NOT NULL CHECK (length(btrim(pessoa_nome)) > 0),
  unidade text NOT NULL DEFAULT 'Botafogo' CHECK (unidade IN ('Botafogo','Ipanema','Ambas')),
  valor numeric(12,2) NOT NULL CHECK (valor > 0),
  data_adiantamento date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  forma_pagamento text NOT NULL DEFAULT 'pix'
    CHECK (forma_pagamento IN ('pix','boleto','cartao','dinheiro','transferencia','debito_automatico')),
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','descontado','devolvido','cancelado')),
  descontado_lancamento_id uuid REFERENCES public.fin_lancamentos(id) ON DELETE SET NULL,
  descontado_em date,
  observacoes text,
  anexo_path text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_adiantamentos TO authenticated;
GRANT ALL ON public.fin_adiantamentos TO service_role;
ALTER TABLE public.fin_adiantamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestores administram adiantamentos" ON public.fin_adiantamentos;
CREATE POLICY "Gestores administram adiantamentos" ON public.fin_adiantamentos
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE INDEX IF NOT EXISTS fin_adiantamentos_status_idx ON public.fin_adiantamentos (status, data_adiantamento);
CREATE INDEX IF NOT EXISTS fin_adiantamentos_lancamento_idx ON public.fin_adiantamentos (descontado_lancamento_id);
DROP TRIGGER IF EXISTS fin_adiantamentos_updated_at ON public.fin_adiantamentos;
CREATE TRIGGER fin_adiantamentos_updated_at BEFORE UPDATE ON public.fin_adiantamentos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Quanto do lançamento foi pago com adiantamento (o resto saiu no dia do pagamento).
ALTER TABLE public.fin_lancamentos
  ADD COLUMN IF NOT EXISTS adiantamento_descontado numeric(12,2) NOT NULL DEFAULT 0;

-- Marca o lançamento como pago abatendo os adiantamentos escolhidos (mais antigos primeiro).
-- Se um adiantamento for maior que o que falta, desconta só a parte necessária e o saldo
-- continua em aberto (novo registro "saldo do adiantamento de dd/mm").
CREATE OR REPLACE FUNCTION public.fin_pagar_com_adiantamentos(
  _lancamento_id uuid,
  _data_pagamento date,
  _forma_pagamento text,
  _adiantamentos uuid[] DEFAULT '{}'::uuid[]
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_l public.fin_lancamentos%ROWTYPE;
  v_a public.fin_adiantamentos%ROWTYPE;
  v_restante numeric(12,2);
  v_total numeric(12,2) := 0;
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Apenas gestores ou administradores registram pagamentos';
  END IF;
  IF _data_pagamento IS NULL OR _forma_pagamento IS NULL THEN
    RAISE EXCEPTION 'Informe a data e a forma de pagamento';
  END IF;
  SELECT * INTO v_l FROM public.fin_lancamentos WHERE id = _lancamento_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado'; END IF;
  IF v_l.status = 'pago' THEN RAISE EXCEPTION 'Este lançamento já está pago'; END IF;
  IF v_l.status = 'cancelado' THEN RAISE EXCEPTION 'Lançamento cancelado não pode ser pago'; END IF;

  v_restante := v_l.valor;
  FOR v_a IN
    SELECT * FROM public.fin_adiantamentos
    WHERE id = ANY(coalesce(_adiantamentos, '{}'::uuid[])) AND status = 'aberto'
    ORDER BY data_adiantamento, created_at
    FOR UPDATE
  LOOP
    EXIT WHEN v_restante <= 0;
    IF v_a.valor > v_restante THEN
      -- Parte do adiantamento sobra para o próximo pagamento.
      INSERT INTO public.fin_adiantamentos (
        funcionario_id, pessoa_nome, unidade, valor, data_adiantamento, forma_pagamento,
        status, observacoes, anexo_path, created_by
      ) VALUES (
        v_a.funcionario_id, v_a.pessoa_nome, v_a.unidade, v_a.valor - v_restante, v_a.data_adiantamento,
        v_a.forma_pagamento, 'aberto',
        concat_ws(' · ', 'Saldo do adiantamento de ' || to_char(v_a.data_adiantamento, 'DD/MM/YYYY'), nullif(v_a.observacoes, '')),
        v_a.anexo_path, coalesce(auth.uid(), v_a.created_by)
      );
      UPDATE public.fin_adiantamentos
      SET valor = v_restante, status = 'descontado', descontado_lancamento_id = v_l.id, descontado_em = _data_pagamento
      WHERE id = v_a.id;
      v_total := v_total + v_restante;
      v_restante := 0;
    ELSE
      UPDATE public.fin_adiantamentos
      SET status = 'descontado', descontado_lancamento_id = v_l.id, descontado_em = _data_pagamento
      WHERE id = v_a.id;
      v_total := v_total + v_a.valor;
      v_restante := v_restante - v_a.valor;
    END IF;
  END LOOP;

  UPDATE public.fin_lancamentos
  SET status = 'pago', data_pagamento = _data_pagamento, forma_pagamento = _forma_pagamento,
      adiantamento_descontado = v_total
  WHERE id = v_l.id;
  RETURN v_total;
END $$;
REVOKE EXECUTE ON FUNCTION public.fin_pagar_com_adiantamentos(uuid, date, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_pagar_com_adiantamentos(uuid, date, text, uuid[]) TO authenticated;

-- Pagamento desfeito → adiantamentos voltam a ficar em aberto.
CREATE OR REPLACE FUNCTION private.tg_fin_lancamento_reabre_adiantamentos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.fin_adiantamentos
    SET status = 'aberto', descontado_lancamento_id = NULL, descontado_em = NULL
    WHERE descontado_lancamento_id = OLD.id AND status = 'descontado';
    RETURN OLD;
  END IF;
  IF OLD.status = 'pago' AND NEW.status <> 'pago' THEN
    UPDATE public.fin_adiantamentos
    SET status = 'aberto', descontado_lancamento_id = NULL, descontado_em = NULL
    WHERE descontado_lancamento_id = OLD.id AND status = 'descontado';
    NEW.adiantamento_descontado := 0;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION private.tg_fin_lancamento_reabre_adiantamentos() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS fin_lancamentos_reabre_adiantamentos_upd ON public.fin_lancamentos;
CREATE TRIGGER fin_lancamentos_reabre_adiantamentos_upd BEFORE UPDATE OF status ON public.fin_lancamentos
FOR EACH ROW EXECUTE FUNCTION private.tg_fin_lancamento_reabre_adiantamentos();
DROP TRIGGER IF EXISTS fin_lancamentos_reabre_adiantamentos_del ON public.fin_lancamentos;
CREATE TRIGGER fin_lancamentos_reabre_adiantamentos_del BEFORE DELETE ON public.fin_lancamentos
FOR EACH ROW EXECUTE FUNCTION private.tg_fin_lancamento_reabre_adiantamentos();
