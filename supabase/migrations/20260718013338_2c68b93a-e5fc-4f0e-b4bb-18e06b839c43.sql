
REVOKE EXECUTE ON FUNCTION public.sync_ativos_ar_tecnico_id() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_purchase_request_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nome text; v_role text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  NEW.requester_user_id := auth.uid();
  SELECT nome INTO v_nome FROM public.profiles WHERE id = auth.uid();
  NEW.requested_by := COALESCE(v_nome, NEW.requested_by, '');
  SELECT role::text INTO v_role FROM public.user_roles WHERE user_id = auth.uid()
    ORDER BY CASE role::text
      WHEN 'admin' THEN 1 WHEN 'gestor' THEN 2 WHEN 'recepcao' THEN 3
      WHEN 'camareira' THEN 4 WHEN 'funcionario' THEN 5 ELSE 9 END LIMIT 1;
  NEW.requester_role := COALESCE(v_role, 'funcionario');
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_purchase_request_identity() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_pr_identity ON public.purchase_requests;
CREATE TRIGGER trg_pr_identity BEFORE INSERT ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_purchase_request_identity();
DROP POLICY IF EXISTS pr_insert ON public.purchase_requests;
CREATE POLICY pr_insert ON public.purchase_requests FOR INSERT TO authenticated
  WITH CHECK (requester_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.set_troca_turno_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nome text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  NEW.funcionario_saida_user_id := auth.uid();
  SELECT nome INTO v_nome FROM public.profiles WHERE id = auth.uid();
  NEW.funcionario_saida := COALESCE(v_nome, NEW.funcionario_saida, '');
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_troca_turno_identity() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_tt_identity ON public.trocas_turno;
CREATE TRIGGER trg_tt_identity BEFORE INSERT ON public.trocas_turno
  FOR EACH ROW EXECUTE FUNCTION public.set_troca_turno_identity();
DROP POLICY IF EXISTS tt_insert ON public.trocas_turno;
CREATE POLICY tt_insert ON public.trocas_turno FOR INSERT TO authenticated
  WITH CHECK (funcionario_saida_user_id = auth.uid());

DROP POLICY IF EXISTS "Recados midia: leitura autenticada" ON storage.objects;
CREATE POLICY "Recados midia: leitura staff" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'recados-midia'
    AND (
      private.has_role(auth.uid(), 'admin'::app_role)
      OR private.has_role(auth.uid(), 'gestor'::app_role)
      OR private.has_role(auth.uid(), 'recepcao'::app_role)
      OR private.has_role(auth.uid(), 'camareira'::app_role)
      OR private.has_role(auth.uid(), 'funcionario'::app_role)
    )
  );

SELECT cron.unschedule('consolidar-dados-15min');
SELECT cron.unschedule('consolidar-dados-cloudbeds-15min');
SELECT cron.unschedule('validar-pax-diario');

SELECT cron.schedule('consolidar-dados-15min', '*/15 * * * *', $job$
  SELECT net.http_post(
    url:='https://vpeuugeoetwvrmrtemgj.supabase.co/functions/v1/consolidar-dados',
    headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret','DgTGX9veCmJ2PxWzOXKEj5ZvF3fp8pgtS5mq9aYJhV8DDzD5ekQRwe4a5eh2YqNj'),
    body:='{}'::jsonb
  );
$job$);

SELECT cron.schedule('validar-pax-diario', '0 2 * * *', $job$
  SELECT net.http_post(
    url:='https://vpeuugeoetwvrmrtemgj.supabase.co/functions/v1/consolidar-dados',
    headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret','DgTGX9veCmJ2PxWzOXKEj5ZvF3fp8pgtS5mq9aYJhV8DDzD5ekQRwe4a5eh2YqNj'),
    body:='{}'::jsonb
  );
$job$);
