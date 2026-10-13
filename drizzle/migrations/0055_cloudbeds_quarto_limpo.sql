-- Camareira finaliza o quarto no app → quarto LIMPO no Cloudbeds, com confirmação e nova tentativa.
-- - room_housekeeping guarda o roomID do Cloudbeds (gravado pela sincronização) e a situação do envio:
--   pendente (ainda não confirmado; a sincronização a cada 5 min tenta de novo), confirmado, falhou.
-- - cloudbeds_limpeza_logs registra cada tentativa (app ou sincronização) para conferência.
-- Idempotente.

ALTER TABLE public.room_housekeeping ADD COLUMN IF NOT EXISTS cloudbeds_room_id text;
ALTER TABLE public.room_housekeeping ADD COLUMN IF NOT EXISTS cloudbeds_limpo_status text;
ALTER TABLE public.room_housekeeping ADD COLUMN IF NOT EXISTS cloudbeds_limpo_em timestamptz;
ALTER TABLE public.room_housekeeping ADD COLUMN IF NOT EXISTS cloudbeds_limpo_erro text;
ALTER TABLE public.room_housekeeping ADD COLUMN IF NOT EXISTS cloudbeds_limpo_tentativas integer NOT NULL DEFAULT 0;
ALTER TABLE public.room_housekeeping DROP CONSTRAINT IF EXISTS room_housekeeping_cloudbeds_limpo_status_ck;
ALTER TABLE public.room_housekeeping ADD CONSTRAINT room_housekeeping_cloudbeds_limpo_status_ck
  CHECK (cloudbeds_limpo_status IS NULL OR cloudbeds_limpo_status IN ('pendente', 'confirmado', 'falhou'));
CREATE INDEX IF NOT EXISTS idx_room_hk_cloudbeds_limpo_pendente
  ON public.room_housekeeping (property) WHERE cloudbeds_limpo_status = 'pendente';

CREATE TABLE IF NOT EXISTS public.cloudbeds_limpeza_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property text NOT NULL,
  room_number text NOT NULL,
  room_id text,
  origem text NOT NULL CHECK (origem IN ('app', 'sincronizacao')),
  resultado text NOT NULL CHECK (resultado IN ('confirmado', 'pendente', 'reenviado', 'falhou', 'cancelado')),
  condicao_cloudbeds text,
  erro text,
  user_id uuid,
  nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cloudbeds_limpeza_logs_quarto ON public.cloudbeds_limpeza_logs (property, room_number, created_at DESC);

ALTER TABLE public.cloudbeds_limpeza_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestao ve envios de limpeza" ON public.cloudbeds_limpeza_logs;
CREATE POLICY "Gestao ve envios de limpeza" ON public.cloudbeds_limpeza_logs
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'gestor'::public.app_role)
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'recepcao'::public.app_role)
  );

-- O servidor do app registra o resultado do envio feito quando a camareira finaliza.
-- SECURITY DEFINER: vale para quem pode finalizar quarto (inclusive manutenção como "funcionario",
-- que não tem UPDATE direto em room_housekeeping).
CREATE OR REPLACE FUNCTION public.cloudbeds_limpeza_registrar(
  _property text,
  _room_number text,
  _room_id text,
  _confirmado boolean,
  _condicao text DEFAULT NULL,
  _erro text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text;
  v_status text := CASE WHEN _confirmado THEN 'confirmado' ELSE 'pendente' END;
BEGIN
  IF NOT (private.has_role(v_uid, 'gestor'::public.app_role) OR private.has_role(v_uid, 'admin'::public.app_role)
          OR private.has_role(v_uid, 'camareira'::public.app_role) OR private.has_role(v_uid, 'recepcao'::public.app_role)
          OR private.has_role(v_uid, 'funcionario'::public.app_role)) THEN
    RAISE EXCEPTION 'Sem permissão para registrar a limpeza no Cloudbeds.';
  END IF;

  SELECT coalesce(f.nome, u.email) INTO v_nome
  FROM auth.users u LEFT JOIN public.funcionarios f ON f.user_id = u.id
  WHERE u.id = v_uid ORDER BY f.nome LIMIT 1;

  UPDATE public.room_housekeeping
  SET cloudbeds_limpo_status = v_status,
      cloudbeds_limpo_em = now(),
      cloudbeds_limpo_erro = CASE WHEN _confirmado THEN NULL ELSE left(_erro, 500) END,
      cloudbeds_limpo_tentativas = coalesce(cloudbeds_limpo_tentativas, 0) + 1,
      cloudbeds_room_id = coalesce(nullif(_room_id, ''), cloudbeds_room_id)
  WHERE property = _property AND room_number = _room_number;

  INSERT INTO public.cloudbeds_limpeza_logs (property, room_number, room_id, origem, resultado, condicao_cloudbeds, erro, user_id, nome)
  VALUES (_property, _room_number, nullif(_room_id, ''), 'app', v_status, left(_condicao, 40), left(_erro, 500), v_uid, v_nome);

  RETURN v_status;
END;
$$;
REVOKE ALL ON FUNCTION public.cloudbeds_limpeza_registrar(text, text, text, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cloudbeds_limpeza_registrar(text, text, text, boolean, text, text) TO authenticated;
