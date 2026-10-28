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
ALTER TABLE public.wa_conversas ADD COLUMN IF NOT EXISTS wa_id text;
ALTER TABLE public.wa_conversas ADD COLUMN IF NOT EXISTS processando_ate timestamptz;
ALTER TABLE public.wa_conversas ADD COLUMN IF NOT EXISTS pausada_ate timestamptz;
ALTER TABLE public.wa_conversas ADD COLUMN IF NOT EXISTS atendida_ate timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS wa_conversas_wa_id_uniq
  ON public.wa_conversas (wa_id) WHERE canal = 'whatsapp' AND wa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS wa_conversas_pendentes_idx
  ON public.wa_conversas (canal, ultima_msg_cliente_em DESC);
ALTER TABLE public.wa_mensagens ADD COLUMN IF NOT EXISTS wamid text;
ALTER TABLE public.wa_mensagens ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'texto';
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
CREATE UNIQUE INDEX IF NOT EXISTS wa_mensagens_wamid_uniq
  ON public.wa_mensagens (wamid) WHERE wamid IS NOT NULL;
CREATE INDEX IF NOT EXISTS wa_mensagens_rascunho_idx
  ON public.wa_mensagens (conversa_id) WHERE envio = 'rascunho';