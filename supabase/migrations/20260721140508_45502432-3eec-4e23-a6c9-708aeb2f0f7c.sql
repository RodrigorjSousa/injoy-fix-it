CREATE TABLE public.tuya_api_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id TEXT,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  request_payload JSONB,
  response_payload JSONB,
  response_code INTEGER,
  response_msg TEXT,
  success BOOLEAN,
  guest_name TEXT,
  room_number TEXT,
  unidade TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tuya_api_logs TO authenticated;
GRANT ALL ON public.tuya_api_logs TO service_role;

ALTER TABLE public.tuya_api_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins e gestores visualizam logs Tuya"
  ON public.tuya_api_logs
  FOR SELECT
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role));

CREATE INDEX idx_tuya_api_logs_created_at ON public.tuya_api_logs (created_at DESC);
CREATE INDEX idx_tuya_api_logs_device_id ON public.tuya_api_logs (device_id);