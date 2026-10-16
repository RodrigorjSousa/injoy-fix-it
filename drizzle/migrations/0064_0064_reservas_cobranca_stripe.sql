-- Tela RESERVAS: cobrança pelo Stripe (decisões do Rodrigo, 16/10/2026).
--   "Cobrado?" passa a ter: Cobrar agora (sim), Recusado, Link enviado, Aguardando autenticação e
--   Pagamento no check-in. "Cancelada" sai (as marcadas voltam para sem marcação).
--   "sim", "link_enviado" e "pagamento_checkin" só o SERVIDOR grava (depois de cobrar no Stripe, enviar o
--   link ou escrever a nota no Cloudbeds). A recepção marca à mão só Recusado e Aguardando autenticação.
-- Cada tentativa (cobrança, link, nota) fica em reservas_cobranca_pagamentos, com trava contra cobrança dupla.
-- Idempotente. Sem FK para auth.users e sem INSERT de dados (o Lovable recusa).

-- ------------------------------------------------------------------ novos valores de "Cobrado?"
UPDATE public.reservas_cobranca SET cobrado = NULL WHERE cobrado = 'cancelada';
ALTER TABLE public.reservas_cobranca DROP CONSTRAINT IF EXISTS reservas_cobranca_cobrado_ck;
ALTER TABLE public.reservas_cobranca ADD CONSTRAINT reservas_cobranca_cobrado_ck CHECK (
  cobrado IS NULL OR cobrado IN ('sim', 'recusado', 'link_enviado', 'aguardando_autenticacao', 'pagamento_checkin')
);

CREATE OR REPLACE FUNCTION public.reservas_cobranca_marcar(_id uuid, _cobrado text, _observacao text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE v_nome text; v_atual text;
BEGIN
  IF NOT private.pode_ver_reservas(auth.uid()) THEN
    RAISE EXCEPTION 'Seu login não está liberado nas Reservas.';
  END IF;
  SELECT cobrado INTO v_atual FROM public.reservas_cobranca WHERE id = _id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva não encontrada na lista.';
  END IF;
  IF _cobrado IS NOT NULL AND _cobrado NOT IN ('sim', 'recusado', 'link_enviado', 'aguardando_autenticacao', 'pagamento_checkin') THEN
    RAISE EXCEPTION 'Opção de "Cobrado?" inválida: %', _cobrado;
  END IF;
  IF _cobrado IS DISTINCT FROM v_atual THEN
    IF v_atual = 'sim' THEN
      RAISE EXCEPTION 'O pagamento desta reserva já foi confirmado. Não dá para trocar a marcação.';
    END IF;
    IF _cobrado IN ('sim', 'link_enviado', 'pagamento_checkin') THEN
      RAISE EXCEPTION 'Use o botão da tela: essa opção cobra, envia o link ou escreve a nota no Cloudbeds.';
    END IF;
  END IF;

  SELECT coalesce(nullif(btrim(f.nome), ''), u.email) INTO v_nome
  FROM auth.users u
  LEFT JOIN LATERAL (
    SELECT fx.nome FROM public.funcionarios fx WHERE fx.user_id = u.id ORDER BY fx.nome LIMIT 1
  ) f ON true
  WHERE u.id = auth.uid();

  UPDATE public.reservas_cobranca
     SET cobrado = _cobrado,
         observacao = nullif(btrim(coalesce(_observacao, '')), ''),
         marcado_por = CASE WHEN _cobrado IS DISTINCT FROM v_atual THEN auth.uid() ELSE marcado_por END,
         marcado_nome = CASE WHEN _cobrado IS DISTINCT FROM v_atual THEN v_nome ELSE marcado_nome END,
         marcado_em = CASE WHEN _cobrado IS DISTINCT FROM v_atual THEN now() ELSE marcado_em END
   WHERE id = _id;
END;
$$;
REVOKE ALL ON FUNCTION public.reservas_cobranca_marcar(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservas_cobranca_marcar(uuid, text, text) TO authenticated;

-- ------------------------------------------------------------------ tentativas de cobrança
-- tipo:   cobranca (Cobrar agora) | link (Enviar link) | checkin (Pagamento no check-in)
-- status: processando | aprovado | autenticacao | recusado | erro | link_enviado | link_pago | registrado
-- cloudbeds_pagamento / cloudbeds_nota: lancado | falhou | teste (modo de teste do Stripe: nada vai ao Cloudbeds)
CREATE TABLE IF NOT EXISTS public.reservas_cobranca_pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade text NOT NULL,
  reservation_id text NOT NULL,
  tipo text NOT NULL,
  status text NOT NULL DEFAULT 'processando',
  modo text NOT NULL DEFAULT 'real',
  valor numeric(12,2),
  stripe_customer_id text,
  stripe_payment_method_id text,
  cartao text,
  stripe_payment_intent_id text,
  stripe_invoice_id text,
  link_url text,
  email_destino text,
  cloudbeds_pagamento text,
  cloudbeds_nota text,
  mensagem text,
  usuario_id uuid,
  usuario_nome text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reservas_cobranca_pagamentos_unidade_ck CHECK (unidade IN ('Botafogo', 'Ipanema')),
  CONSTRAINT reservas_cobranca_pagamentos_tipo_ck CHECK (tipo IN ('cobranca', 'link', 'checkin')),
  CONSTRAINT reservas_cobranca_pagamentos_status_ck CHECK (status IN
    ('processando', 'aprovado', 'autenticacao', 'recusado', 'erro', 'link_enviado', 'link_pago', 'registrado')),
  CONSTRAINT reservas_cobranca_pagamentos_modo_ck CHECK (modo IN ('teste', 'real'))
);
CREATE INDEX IF NOT EXISTS reservas_cobranca_pagamentos_reserva_idx
  ON public.reservas_cobranca_pagamentos (unidade, reservation_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS reservas_cobranca_pagamentos_invoice_idx
  ON public.reservas_cobranca_pagamentos (stripe_invoice_id) WHERE stripe_invoice_id IS NOT NULL;
-- Trava: só UMA operação em andamento por reserva (dois cliques ou duas recepcionistas = uma cobrança).
CREATE UNIQUE INDEX IF NOT EXISTS reservas_cobranca_pagamentos_uma_em_andamento
  ON public.reservas_cobranca_pagamentos (unidade, reservation_id) WHERE status = 'processando';

GRANT SELECT ON public.reservas_cobranca_pagamentos TO authenticated;
GRANT ALL ON public.reservas_cobranca_pagamentos TO service_role;
ALTER TABLE public.reservas_cobranca_pagamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Quem vê Reservas consulta as cobranças" ON public.reservas_cobranca_pagamentos;
CREATE POLICY "Quem vê Reservas consulta as cobranças" ON public.reservas_cobranca_pagamentos
  FOR SELECT TO authenticated
  USING (private.pode_ver_reservas(auth.uid()));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'reservas_cobranca_pagamentos'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reservas_cobranca_pagamentos;
  END IF;
END $$;
