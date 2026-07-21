
DROP POLICY IF EXISTS "Auth users read config bonificacao" ON public.config_bonificacao;
CREATE POLICY "Admin gestor read config bonificacao" ON public.config_bonificacao
FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role));

DROP POLICY IF EXISTS "Autenticados podem ler tuya_devices" ON public.tuya_devices;
CREATE POLICY "Staff read tuya_devices" ON public.tuya_devices
FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'recepcao'::app_role)
);
