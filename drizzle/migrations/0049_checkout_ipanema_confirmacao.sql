-- Check-out feito pelas camareiras (Ipanema, sem recepção) com confirmação para a Recepção de Botafogo.
-- O app grava cada tentativa com o resultado conferido no Cloudbeds; a Recepção vê e marca "Conferi".
-- Idempotente.

ALTER TABLE public.cloudbeds_checkout_logs ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmado';
ALTER TABLE public.cloudbeds_checkout_logs ADD COLUMN IF NOT EXISTS cloudbeds_status text;
ALTER TABLE public.cloudbeds_checkout_logs ADD COLUMN IF NOT EXISTS erro text;
ALTER TABLE public.cloudbeds_checkout_logs ADD COLUMN IF NOT EXISTS conferido_por uuid;
ALTER TABLE public.cloudbeds_checkout_logs ADD COLUMN IF NOT EXISTS conferido_nome text;
ALTER TABLE public.cloudbeds_checkout_logs ADD COLUMN IF NOT EXISTS conferido_em timestamptz;
ALTER TABLE public.cloudbeds_checkout_logs DROP CONSTRAINT IF EXISTS cloudbeds_checkout_logs_status_ck;
ALTER TABLE public.cloudbeds_checkout_logs ADD CONSTRAINT cloudbeds_checkout_logs_status_ck
  CHECK (status IN ('confirmado', 'nao_confirmado', 'falhou'));

-- A Recepção também vê os check-outs (antes só gestor/camareira/técnico).
DROP POLICY IF EXISTS "Staff ve checkout logs" ON public.cloudbeds_checkout_logs;
CREATE POLICY "Staff ve checkout logs" ON public.cloudbeds_checkout_logs
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'gestor'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'recepcao'::app_role)
    OR private.has_role(auth.uid(), 'camareira'::app_role)
    OR private.has_role(auth.uid(), 'funcionario'::app_role)
  );

-- Recepção/gestor marca que conferiu no Cloudbeds.
CREATE OR REPLACE FUNCTION public.checkout_log_conferir(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text;
BEGIN
  IF NOT (private.has_role(v_uid, 'recepcao'::app_role) OR private.has_role(v_uid, 'gestor'::app_role)
          OR private.has_role(v_uid, 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Somente Recepção ou gestor confere check-outs.';
  END IF;
  SELECT coalesce(f.nome, u.email) INTO v_nome
  FROM auth.users u LEFT JOIN public.funcionarios f ON f.user_id = u.id
  WHERE u.id = v_uid ORDER BY f.nome LIMIT 1;

  UPDATE public.cloudbeds_checkout_logs
  SET conferido_por = v_uid, conferido_nome = v_nome, conferido_em = now()
  WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Check-out não encontrado'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.checkout_log_conferir(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkout_log_conferir(uuid) TO authenticated;
