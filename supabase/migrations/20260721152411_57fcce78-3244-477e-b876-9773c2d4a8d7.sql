
CREATE TABLE public.tuya_devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unidade TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('quarto','portao','vidro','outro')),
  room_number TEXT,
  device_id TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tuya_devices_unidade ON public.tuya_devices(unidade);
CREATE INDEX idx_tuya_devices_room ON public.tuya_devices(unidade, room_number) WHERE room_number IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tuya_devices TO authenticated;
GRANT ALL ON public.tuya_devices TO service_role;

ALTER TABLE public.tuya_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados podem ler tuya_devices"
  ON public.tuya_devices FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Gestor/admin gerenciam tuya_devices - insert"
  ON public.tuya_devices FOR INSERT
  TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'gestor'::app_role));

CREATE POLICY "Gestor/admin gerenciam tuya_devices - update"
  ON public.tuya_devices FOR UPDATE
  TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'gestor'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'gestor'::app_role));

CREATE POLICY "Gestor/admin gerenciam tuya_devices - delete"
  ON public.tuya_devices FOR DELETE
  TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'gestor'::app_role));

CREATE TRIGGER update_tuya_devices_updated_at
  BEFORE UPDATE ON public.tuya_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.tuya_devices (unidade, tipo, room_number, device_id, label) VALUES
  ('Botafogo','portao', NULL,  'eba207725701fb044abmhl', 'Portão Principal'),
  ('Botafogo','vidro',  NULL,  'ebd7760a2310ee9930ozt9', 'Porta de Vidro (Recepção)'),
  ('Botafogo','quarto', '005', 'eba3429756a5aaa8b2ssrw', 'Quarto 005')
ON CONFLICT (device_id) DO NOTHING;
