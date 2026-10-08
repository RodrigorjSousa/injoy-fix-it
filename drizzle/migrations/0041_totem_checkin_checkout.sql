-- Totem (tablet fixo) para auto check-in e check-out do hóspede.
-- O tablet NÃO tem login de funcionário: ele guarda um token próprio, gerado no
-- pareamento. Todas as ações do totem passam por server functions que conferem
-- esse token com a chave de serviço; o navegador do totem não lê nenhuma tabela.
-- O gestor cadastra o totem, ajusta as regras e gera o código de pareamento.
-- Pode ser aplicada mais de uma vez.

-- 1) Aparelhos de totem ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.totem_dispositivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  unidade text NOT NULL CHECK (unidade IN ('Botafogo', 'Ipanema')),
  ativo boolean NOT NULL DEFAULT true,
  -- sha256 (hex) do token guardado no tablet. Nulo = nenhum tablet conectado.
  token_hash text UNIQUE,
  -- sha256 (hex) do código de pareamento de 8 caracteres e sua validade.
  pareamento_hash text,
  pareamento_expira timestamptz,
  pareado_em timestamptz,
  ultimo_uso timestamptz,
  -- Regras do check-in pelo totem
  hora_checkin time NOT NULL DEFAULT '14:00',
  hora_checkout time NOT NULL DEFAULT '12:00',
  exige_quarto_limpo boolean NOT NULL DEFAULT true,
  bloqueia_saldo_aberto boolean NOT NULL DEFAULT true,
  telefone_suporte text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid
);

ALTER TABLE public.totem_dispositivos ADD COLUMN IF NOT EXISTS hora_checkout time NOT NULL DEFAULT '12:00';
ALTER TABLE public.totem_dispositivos ADD COLUMN IF NOT EXISTS telefone_suporte text;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.totem_dispositivos TO authenticated;
GRANT ALL ON public.totem_dispositivos TO service_role;
ALTER TABLE public.totem_dispositivos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gestor gerencia totens" ON public.totem_dispositivos;
CREATE POLICY "Gestor gerencia totens" ON public.totem_dispositivos
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role));

-- 2) Histórico do totem (também usado para bloquear tentativas repetidas) ------
CREATE TABLE IF NOT EXISTS public.totem_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  totem_id uuid REFERENCES public.totem_dispositivos(id) ON DELETE SET NULL,
  unidade text,
  tipo text NOT NULL,
  reservation_id text,
  quarto text,
  hospede text,
  detalhe text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS totem_eventos_totem_criado_idx
  ON public.totem_eventos (totem_id, criado_em DESC);

GRANT SELECT ON public.totem_eventos TO authenticated;
GRANT ALL ON public.totem_eventos TO service_role;
ALTER TABLE public.totem_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gestor le eventos do totem" ON public.totem_eventos;
CREATE POLICY "Gestor le eventos do totem" ON public.totem_eventos
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role));

-- 3) Avaliação rápida feita no check-out ----------------------------------------
CREATE TABLE IF NOT EXISTS public.totem_avaliacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  totem_id uuid REFERENCES public.totem_dispositivos(id) ON DELETE SET NULL,
  unidade text NOT NULL,
  reservation_id text NOT NULL,
  quarto text,
  hospede text,
  nota smallint NOT NULL CHECK (nota BETWEEN 1 AND 5),
  comentario text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reservation_id, quarto)
);

GRANT SELECT ON public.totem_avaliacoes TO authenticated;
GRANT ALL ON public.totem_avaliacoes TO service_role;
ALTER TABLE public.totem_avaliacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gestor le avaliacoes do totem" ON public.totem_avaliacoes;
CREATE POLICY "Gestor le avaliacoes do totem" ON public.totem_avaliacoes
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role));

-- 4) Senhas Tuya ligadas à reserva (para revogar no check-out e reexibir) -------
ALTER TABLE public.tuya_password_logs ADD COLUMN IF NOT EXISTS reservation_id text;
CREATE INDEX IF NOT EXISTS tuya_password_logs_reservation_idx
  ON public.tuya_password_logs (reservation_id) WHERE reservation_id IS NOT NULL;

-- 5) Código de pareamento (só gestor/admin) -------------------------------------
-- Gera um código de 8 caracteres válido por 15 minutos. O tablet digita esse
-- código uma vez e recebe o token definitivo (trocado no servidor).
CREATE OR REPLACE FUNCTION public.totem_gerar_pareamento(p_totem uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_alfabeto text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_a bytea := uuid_send(gen_random_uuid());
  v_b bytea := uuid_send(gen_random_uuid());
  v_codigo text := '';
  v_expira timestamptz := now() + interval '15 minutes';
  i int;
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor'::public.app_role)
          OR private.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Apenas o gestor pode parear um totem.' USING ERRCODE = '42501';
  END IF;

  -- Bytes 0..5 do UUID v4 são totalmente aleatórios; 256 % 32 = 0 (sem viés).
  FOR i IN 0..5 LOOP
    v_codigo := v_codigo || substr(v_alfabeto, (get_byte(v_a, i) % 32) + 1, 1);
  END LOOP;
  FOR i IN 0..1 LOOP
    v_codigo := v_codigo || substr(v_alfabeto, (get_byte(v_b, i) % 32) + 1, 1);
  END LOOP;

  UPDATE public.totem_dispositivos
     SET pareamento_hash = encode(sha256(convert_to(v_codigo, 'UTF8')), 'hex'),
         pareamento_expira = v_expira
   WHERE id = p_totem AND ativo;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Totem não encontrado ou desativado.';
  END IF;

  RETURN jsonb_build_object(
    'codigo', substr(v_codigo, 1, 4) || '-' || substr(v_codigo, 5, 4),
    'expira', v_expira
  );
END;
$$;

REVOKE ALL ON FUNCTION public.totem_gerar_pareamento(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.totem_gerar_pareamento(uuid) TO authenticated;
