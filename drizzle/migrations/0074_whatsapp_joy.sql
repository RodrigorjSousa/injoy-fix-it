-- Joy — assistente de WhatsApp com IA (entrega E1: cérebro + simulador, sem WhatsApp).
-- Ver docs/projeto-injoy/08-whatsapp-ia.md.
--
-- Tabelas:
--   wa_config       configuração única (id 'joy'): modelo, espera, prompt, base de conhecimento, Wi-Fi
--   wa_conversas    conversas (canal 'simulador' agora; 'whatsapp' na E3)
--   wa_mensagens    mensagens de cada conversa
--   wa_passagens    transferências para a equipe
--   wa_ia_execucoes cada resposta da Joy: modelo, tokens, ferramentas usadas, tempo, erro
--
-- Quem vê: só gestor/admin (por enquanto). Leitura pelo app com RLS; toda escrita é feita pelo servidor
-- (server functions com a chave de serviço, depois de conferir o papel).
-- Idempotente. Sem FK para auth.users e sem INSERT de dados (o Lovable recusa); a linha de
-- configuração é criada pelo servidor na primeira vez que a tela abre.

-- ----------------------------------------------------------------- permissão
CREATE OR REPLACE FUNCTION private.pode_gerir_whatsapp(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT _uid IS NOT NULL AND (private.has_role(_uid, 'gestor') OR private.has_role(_uid, 'admin'));
$$;
REVOKE ALL ON FUNCTION private.pode_gerir_whatsapp(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.pode_gerir_whatsapp(uuid) TO authenticated, service_role;

-- Fonte única de permissão usada pela rota, pelo menu e pela tela.
CREATE OR REPLACE FUNCTION public.minha_permissao_whatsapp()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT jsonb_build_object('gerir', coalesce(private.pode_gerir_whatsapp(auth.uid()), false));
$$;
REVOKE ALL ON FUNCTION public.minha_permissao_whatsapp() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minha_permissao_whatsapp() TO authenticated;

-- ------------------------------------------------------------------- config
CREATE TABLE IF NOT EXISTS public.wa_config (
  id text PRIMARY KEY DEFAULT 'joy',
  modelo text NOT NULL DEFAULT '',
  espera_segundos integer NOT NULL DEFAULT 5,
  prompt text NOT NULL DEFAULT '',
  conhecimento jsonb NOT NULL DEFAULT '{}'::jsonb,
  wifi jsonb NOT NULL DEFAULT '{}'::jsonb,
  atualizado_por uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wa_config_unica CHECK (id = 'joy'),
  CONSTRAINT wa_config_espera CHECK (espera_segundos BETWEEN 0 AND 60)
);

-- ---------------------------------------------------------------- conversas
CREATE TABLE IF NOT EXISTS public.wa_conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canal text NOT NULL DEFAULT 'simulador',
  contato_nome text,
  telefone text,
  unidade text,
  reserva_id text,
  reserva_unidade text,
  modo text NOT NULL DEFAULT 'ia',
  etapa text NOT NULL DEFAULT 'contato',
  criado_por uuid,
  ultima_msg_cliente_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wa_conversas_canal CHECK (canal IN ('simulador', 'whatsapp')),
  CONSTRAINT wa_conversas_modo CHECK (modo IN ('ia', 'humano', 'pausada')),
  CONSTRAINT wa_conversas_unidade CHECK (unidade IS NULL OR unidade IN ('Botafogo', 'Ipanema')),
  CONSTRAINT wa_conversas_reserva_unidade CHECK (reserva_unidade IS NULL OR reserva_unidade IN ('Botafogo', 'Ipanema'))
);
CREATE INDEX IF NOT EXISTS wa_conversas_updated_idx ON public.wa_conversas (updated_at DESC);

CREATE TABLE IF NOT EXISTS public.wa_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid NOT NULL REFERENCES public.wa_conversas(id) ON DELETE CASCADE,
  autor text NOT NULL,
  texto text NOT NULL DEFAULT '',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wa_mensagens_autor CHECK (autor IN ('cliente', 'joy', 'equipe', 'sistema'))
);
CREATE INDEX IF NOT EXISTS wa_mensagens_conversa_idx ON public.wa_mensagens (conversa_id, created_at);

CREATE TABLE IF NOT EXISTS public.wa_passagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid NOT NULL REFERENCES public.wa_conversas(id) ON DELETE CASCADE,
  motivo text NOT NULL DEFAULT '',
  urgencia text NOT NULL DEFAULT 'normal',
  resolvido_em timestamptz,
  resolvido_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wa_passagens_urgencia CHECK (urgencia IN ('normal', 'urgente'))
);
CREATE INDEX IF NOT EXISTS wa_passagens_conversa_idx ON public.wa_passagens (conversa_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.wa_ia_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid REFERENCES public.wa_conversas(id) ON DELETE SET NULL,
  canal text NOT NULL DEFAULT 'simulador',
  modelo text NOT NULL DEFAULT '',
  tokens_entrada integer NOT NULL DEFAULT 0,
  tokens_saida integer NOT NULL DEFAULT 0,
  chamadas_modelo integer NOT NULL DEFAULT 0,
  ferramentas jsonb NOT NULL DEFAULT '[]'::jsonb,
  bloqueios jsonb NOT NULL DEFAULT '[]'::jsonb,
  duracao_ms integer NOT NULL DEFAULT 0,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wa_ia_execucoes_created_idx ON public.wa_ia_execucoes (created_at DESC);

-- -------------------------------------------------------------- updated_at
DROP TRIGGER IF EXISTS wa_config_updated_at ON public.wa_config;
CREATE TRIGGER wa_config_updated_at BEFORE UPDATE ON public.wa_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS wa_conversas_updated_at ON public.wa_conversas;
CREATE TRIGGER wa_conversas_updated_at BEFORE UPDATE ON public.wa_conversas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- --------------------------------------------------------------------- RLS
-- Só leitura para gestor/admin. Escrita só pelo servidor (service_role ignora RLS).
ALTER TABLE public.wa_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_passagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_ia_execucoes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.wa_config, public.wa_conversas, public.wa_mensagens, public.wa_passagens, public.wa_ia_execucoes FROM anon;
GRANT SELECT ON public.wa_config, public.wa_conversas, public.wa_mensagens, public.wa_passagens, public.wa_ia_execucoes TO authenticated;
GRANT ALL ON public.wa_config, public.wa_conversas, public.wa_mensagens, public.wa_passagens, public.wa_ia_execucoes TO service_role;

DROP POLICY IF EXISTS "Gestor lê config da Joy" ON public.wa_config;
CREATE POLICY "Gestor lê config da Joy" ON public.wa_config
  FOR SELECT TO authenticated USING (private.pode_gerir_whatsapp(auth.uid()));

DROP POLICY IF EXISTS "Gestor lê conversas da Joy" ON public.wa_conversas;
CREATE POLICY "Gestor lê conversas da Joy" ON public.wa_conversas
  FOR SELECT TO authenticated USING (private.pode_gerir_whatsapp(auth.uid()));

DROP POLICY IF EXISTS "Gestor lê mensagens da Joy" ON public.wa_mensagens;
CREATE POLICY "Gestor lê mensagens da Joy" ON public.wa_mensagens
  FOR SELECT TO authenticated USING (private.pode_gerir_whatsapp(auth.uid()));

DROP POLICY IF EXISTS "Gestor lê passagens da Joy" ON public.wa_passagens;
CREATE POLICY "Gestor lê passagens da Joy" ON public.wa_passagens
  FOR SELECT TO authenticated USING (private.pode_gerir_whatsapp(auth.uid()));

DROP POLICY IF EXISTS "Gestor lê execuções da Joy" ON public.wa_ia_execucoes;
CREATE POLICY "Gestor lê execuções da Joy" ON public.wa_ia_execucoes
  FOR SELECT TO authenticated USING (private.pode_gerir_whatsapp(auth.uid()));
