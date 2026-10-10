-- Totem: pagamento na maquininha Stone (Connect 2.0), fotos de documentos e
-- comprovante impresso. Todas as gravações são feitas pelo servidor (chave de
-- serviço) depois de conferir o token do tablet; o gestor só lê.
-- Pode ser aplicada mais de uma vez.

-- 1) Configuração por tablet ----------------------------------------------------
ALTER TABLE public.totem_dispositivos ADD COLUMN IF NOT EXISTS pagamento_habilitado boolean NOT NULL DEFAULT false;
-- Número de série da maquininha Stone (S920/Q92) que fica ao lado deste tablet.
ALTER TABLE public.totem_dispositivos ADD COLUMN IF NOT EXISTS pos_serial text;
ALTER TABLE public.totem_dispositivos ADD COLUMN IF NOT EXISTS pede_documentos boolean NOT NULL DEFAULT true;
ALTER TABLE public.totem_dispositivos ADD COLUMN IF NOT EXISTS impressora text NOT NULL DEFAULT 'nenhuma';
ALTER TABLE public.totem_dispositivos ADD COLUMN IF NOT EXISTS wifi_rede text;
ALTER TABLE public.totem_dispositivos ADD COLUMN IF NOT EXISTS wifi_senha text;
ALTER TABLE public.totem_dispositivos ADD COLUMN IF NOT EXISTS mensagem_comprovante text;

ALTER TABLE public.totem_dispositivos DROP CONSTRAINT IF EXISTS totem_dispositivos_impressora_check;
ALTER TABLE public.totem_dispositivos
  ADD CONSTRAINT totem_dispositivos_impressora_check CHECK (impressora IN ('nenhuma', 'rawbt'));

-- 2) Cobranças feitas pelo totem ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.totem_cobrancas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  totem_id uuid REFERENCES public.totem_dispositivos(id) ON DELETE SET NULL,
  unidade text NOT NULL,
  reservation_id text NOT NULL,
  hospede text,
  fluxo text NOT NULL DEFAULT 'checkin' CHECK (fluxo IN ('checkin', 'checkout')),
  valor numeric(10, 2) NOT NULL CHECK (valor > 0),
  metodo text NOT NULL CHECK (metodo IN ('credito', 'debito', 'pix')),
  provedor text NOT NULL DEFAULT 'stone',
  pedido_id text UNIQUE,
  cobranca_id text,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'pago', 'cancelado', 'falhou', 'expirado')),
  pago_em timestamptz,
  bandeira text,
  autorizacao text,
  -- Lançamento no Cloudbeds (postPayment). Só um processo consegue "pegar" o lançamento.
  cloudbeds_lancado boolean NOT NULL DEFAULT false,
  cloudbeds_lancando_em timestamptz,
  cloudbeds_erro text,
  ultima_consulta timestamptz,
  detalhe jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS totem_cobrancas_reserva_idx ON public.totem_cobrancas (reservation_id, criado_em DESC);

GRANT SELECT ON public.totem_cobrancas TO authenticated;
GRANT ALL ON public.totem_cobrancas TO service_role;
ALTER TABLE public.totem_cobrancas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gestor le cobrancas do totem" ON public.totem_cobrancas;
CREATE POLICY "Gestor le cobrancas do totem" ON public.totem_cobrancas
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role));

-- 3) Documentos fotografados no totem -------------------------------------------
CREATE TABLE IF NOT EXISTS public.totem_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  totem_id uuid REFERENCES public.totem_dispositivos(id) ON DELETE SET NULL,
  unidade text NOT NULL,
  reservation_id text NOT NULL,
  hospede_nome text NOT NULL,
  hospede_ordem smallint NOT NULL DEFAULT 1,
  tipo_documento text NOT NULL CHECK (tipo_documento IN ('cpf', 'rg', 'cnh', 'passaporte', 'outro')),
  numero_documento text,
  -- Verificação no estilo gov.br: 'rosto' (selfie com prova de vida) e
  -- 'rosto_documento' (segurando o documento ao lado do rosto).
  etapa text NOT NULL CHECK (etapa IN ('rosto', 'rosto_documento')),
  -- Indícios calculados no tablet (o "vetor do rosto" não é guardado):
  vivacidade boolean,                 -- piscou os olhos na selfie
  dist_mesma_pessoa numeric(5,3),     -- rosto desta foto x selfie (menor = mais parecido)
  dist_foto_documento numeric(5,3),   -- foto impressa no documento x selfie
  consentimento_em timestamptz NOT NULL,
  -- Caminho no bucket privado "documentos-hospedes": <unidade>/<reserva>/<arquivo>.jpg
  arquivo_path text NOT NULL,
  cloudbeds_file_id text,
  cloudbeds_erro text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS totem_documentos_reserva_idx ON public.totem_documentos (reservation_id);

GRANT SELECT ON public.totem_documentos TO authenticated;
GRANT ALL ON public.totem_documentos TO service_role;
ALTER TABLE public.totem_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gestor le documentos do totem" ON public.totem_documentos;
CREATE POLICY "Gestor le documentos do totem" ON public.totem_documentos
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role));
