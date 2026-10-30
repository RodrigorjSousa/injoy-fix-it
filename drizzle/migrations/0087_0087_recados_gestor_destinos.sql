-- Recado do Gestor: além do setor, enviar para TODOS os funcionários ou para pessoas escolhidas
-- (uma ou várias). Setores: camareiras, recepção, manutenção e ar condicionado (vários de uma vez).
-- A lista de quem recebe é resolvida no envio (`destinatarios`, user_ids) e serve para:
--   - mostrar o recado só a quem é destinatário (recado para pessoas fica privado);
--   - mandar a notificação push só para essas pessoas;
--   - o gestor ver quem já tocou em "Ciente" (tabela recados_gestor_leituras).
-- Recados antigos (só `setor`) continuam valendo. Idempotente.

ALTER TABLE public.recados_gestor ALTER COLUMN setor DROP NOT NULL;

-- Troca os CHECKs de setor/unidade (nomes automáticos) por versões novas.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public' AND rel.relname = 'recados_gestor' AND con.contype = 'c'
      AND (pg_get_constraintdef(con.oid) ILIKE '%setor%' OR pg_get_constraintdef(con.oid) ILIKE '%unidade%')
      AND con.conname NOT IN ('recados_gestor_setor_ck', 'recados_gestor_unidade_ck', 'recados_gestor_alvo_ck')
  LOOP
    EXECUTE format('ALTER TABLE public.recados_gestor DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.recados_gestor
  ADD COLUMN IF NOT EXISTS alvo text NOT NULL DEFAULT 'setor',
  ADD COLUMN IF NOT EXISTS setores text[],
  ADD COLUMN IF NOT EXISTS destinatarios uuid[],
  ADD COLUMN IF NOT EXISTS destinatarios_nomes text[];

DO $$ BEGIN
  ALTER TABLE public.recados_gestor ADD CONSTRAINT recados_gestor_setor_ck
    CHECK (setor IS NULL OR setor IN ('manutencao','recepcao','camareiras','ar_condicionado'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.recados_gestor ADD CONSTRAINT recados_gestor_unidade_ck
    CHECK (unidade IN ('Botafogo','Ipanema','Ambas'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.recados_gestor ADD CONSTRAINT recados_gestor_alvo_ck
    CHECK (alvo IN ('setor','todos','pessoas'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE public.recados_gestor SET setores = ARRAY[setor] WHERE setores IS NULL AND setor IS NOT NULL;

-- Leitura: recado para pessoas escolhidas só aparece para elas (e para gestor/admin).
DROP POLICY IF EXISTS "Authenticated pode ler recados do gestor" ON public.recados_gestor;
DROP POLICY IF EXISTS "Staff pode ler recados do gestor" ON public.recados_gestor;
DROP POLICY IF EXISTS "Destinatarios leem recados do gestor" ON public.recados_gestor;
CREATE POLICY "Destinatarios leem recados do gestor"
  ON public.recados_gestor FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'gestor'::app_role)
    OR auth.uid() = ANY (coalesce(destinatarios, '{}'::uuid[]))
    OR (
      alvo <> 'pessoas' AND destinatarios IS NULL
      AND private.is_staff(auth.uid())
    )
  );

-- "Ciente": quem leu e quando.
CREATE TABLE IF NOT EXISTS public.recados_gestor_leituras (
  recado_id uuid NOT NULL REFERENCES public.recados_gestor(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  nome text,
  lido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recado_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.recados_gestor_leituras TO authenticated;
GRANT ALL ON public.recados_gestor_leituras TO service_role;
ALTER TABLE public.recados_gestor_leituras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura do proprio ciente ou gestor" ON public.recados_gestor_leituras;
CREATE POLICY "Leitura do proprio ciente ou gestor" ON public.recados_gestor_leituras
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'gestor'::app_role)
  );
DROP POLICY IF EXISTS "Marca o proprio ciente" ON public.recados_gestor_leituras;
CREATE POLICY "Marca o proprio ciente" ON public.recados_gestor_leituras
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Gestor remove ciente" ON public.recados_gestor_leituras;
CREATE POLICY "Gestor remove ciente" ON public.recados_gestor_leituras
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'gestor'::app_role)
  );

-- Notificação no celular de quem recebe.
CREATE OR REPLACE FUNCTION private.tg_recados_gestor_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(array_length(NEW.destinatarios, 1), 0) > 0 THEN
    PERFORM private.enqueue_push_notification('recado_gestor', jsonb_build_object(
      'id', NEW.id, 'unidade', NEW.unidade, 'gestor_nome', NEW.gestor_nome,
      'mensagem', NEW.mensagem, 'destinatarios', to_jsonb(NEW.destinatarios)
    ));
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION private.tg_recados_gestor_push() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS recados_gestor_push_after_insert ON public.recados_gestor;
CREATE TRIGGER recados_gestor_push_after_insert AFTER INSERT ON public.recados_gestor
FOR EACH ROW EXECUTE FUNCTION private.tg_recados_gestor_push();
