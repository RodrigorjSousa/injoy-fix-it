
CREATE TABLE public.tuya_password_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_number TEXT NOT NULL,
  guest_name TEXT NOT NULL,
  password TEXT NOT NULL,
  entrada TIMESTAMPTZ NOT NULL,
  saida TIMESTAMPTZ NOT NULL,
  device_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  unidade TEXT,
  generated_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.tuya_password_logs TO authenticated;
GRANT ALL ON public.tuya_password_logs TO service_role;
ALTER TABLE public.tuya_password_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Gestor/Recepcao can view tuya logs"
ON public.tuya_password_logs FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role) OR
  private.has_role(auth.uid(), 'gestor'::app_role) OR
  private.has_role(auth.uid(), 'recepcao'::app_role)
);

CREATE POLICY "Authenticated can insert their own tuya log"
ON public.tuya_password_logs FOR INSERT TO authenticated
WITH CHECK (auth.uid() = generated_by_user_id);

CREATE INDEX idx_tuya_password_logs_created_at ON public.tuya_password_logs (created_at DESC);
