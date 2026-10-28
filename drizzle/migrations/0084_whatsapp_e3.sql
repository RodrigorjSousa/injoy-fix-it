-- Joy — E3: WhatsApp de verdade em MODO RASCUNHO. Ver docs/projeto-injoy/08-whatsapp-ia.md.
--
-- As mensagens chegam pelo webhook da Meta (Cloud API) e ficam gravadas. A Joy escreve um RASCUNHO; nada
-- é enviado sem alguém aprovar no painel. E o envio aprovado só vai para os números de teste, a não ser
-- que o Rodrigo ligue "envio liberado". Tudo começa DESLIGADO.
--
-- Mesmo padrão da 0074: leitura só gestor/admin; escrita só pelo servidor. Idempotente, sem INSERT de
-- dados e sem FK para auth.users. O agendamento de 1 minuto fica na 0085.

-- ------------------------------------------------------------------ config
ALTER TABLE public.wa_config ADD COLUMN IF NOT EXISTS whatsapp_modo text NOT NULL DEFAULT 'desligado';
ALTER TABLE public.wa_config ADD COLUMN IF NOT EXISTS numeros_teste text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.wa_config ADD COLUMN IF NOT EXISTS envio_liberado boolean NOT NULL DEFAULT false;
ALTER TABLE public.wa_config ADD COLUMN IF NOT EXISTS pausa_eco_minutos integer NOT NULL DEFAULT 120;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wa_config_whatsapp_modo') THEN
    ALTER TABLE public.wa_config ADD CONSTRAINT wa_config_whatsapp_modo
      CHECK (whatsapp_modo IN ('desligado', 'rascunho_teste', 'rascunho'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wa_config_pausa_eco') THEN
    ALTER TABLE public.wa_config ADD CONSTRAINT wa_config_pausa_eco
      CHECK (pausa_eco_minutos BETWEEN 0 AND 1440);
  END IF;
END $$;

-- --------------------------------------------------------------- conversas
-- wa_id = número do contato só com dígitos (ex.: 5521999998888), como a Meta manda.
ALTER TABLE public.wa_conversas ADD COLUMN IF NOT EXISTS wa_id text;
-- Trava para nunca haver dois rascunhos ao mesmo tempo na mesma conversa.
ALTER TABLE public.wa_conversas ADD COLUMN IF NOT EXISTS processando_ate timestamptz;
-- A equipe respondeu pelo celular (eco) ou pelo painel: a Joy fica quieta até esta hora.
ALTER TABLE public.wa_conversas ADD COLUMN IF NOT EXISTS pausada_ate timestamptz;
-- Até qual mensagem do hóspede a Joy já tratou (rascunho feito ou ignorado de propósito).
ALTER TABLE public.wa_conversas ADD COLUMN IF NOT EXISTS atendida_ate timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS wa_conversas_wa_id_uniq
  ON public.wa_conversas (wa_id) WHERE canal = 'whatsapp' AND wa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS wa_conversas_pendentes_idx
  ON public.wa_conversas (canal, ultima_msg_cliente_em DESC);

-- --------------------------------------------------------------- mensagens
ALTER TABLE public.wa_mensagens ADD COLUMN IF NOT EXISTS wamid text;
ALTER TABLE public.wa_mensagens ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'texto';
-- Só para mensagens nossas no WhatsApp: rascunho → enviando → enviada → entregue → lida, ou falhou,
-- descartada (alguém descartou) e substituida (chegou mensagem nova ou a equipe respondeu antes).
ALTER TABLE public.wa_mensagens ADD COLUMN IF NOT EXISTS envio text;
ALTER TABLE public.wa_mensagens ADD COLUMN IF NOT EXISTS aprovado_por uuid;
ALTER TABLE public.wa_mensagens ADD COLUMN IF NOT EXISTS enviado_em timestamptz;
ALTER TABLE public.wa_mensagens ADD COLUMN IF NOT EXISTS erro_envio text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wa_mensagens_envio') THEN
    ALTER TABLE public.wa_mensagens ADD CONSTRAINT wa_mensagens_envio CHECK (
      envio IS NULL OR envio IN
        ('rascunho', 'enviando', 'enviada', 'entregue', 'lida', 'falhou', 'descartada', 'substituida')
    );
  END IF;
END $$;
-- A Meta reenvia webhooks: o wamid único impede gravar (e responder) duas vezes.
CREATE UNIQUE INDEX IF NOT EXISTS wa_mensagens_wamid_uniq
  ON public.wa_mensagens (wamid) WHERE wamid IS NOT NULL;
CREATE INDEX IF NOT EXISTS wa_mensagens_rascunho_idx
  ON public.wa_mensagens (conversa_id) WHERE envio = 'rascunho';
