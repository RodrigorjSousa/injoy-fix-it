-- Segundo projeto Tuya ("INJOY FECHADURAS 2", outra conta de desenvolvedor) para
-- mais 10 fechaduras "Controllable" na cota grátis do IoT Core. A edge function
-- tuya-password usa as credenciais do projeto de cada fechadura:
--   1 = TUYA_CLIENT_ID / TUYA_CLIENT_SECRET
--   2 = TUYA2_CLIENT_ID / TUYA2_CLIENT_SECRET
ALTER TABLE public.tuya_devices ADD COLUMN IF NOT EXISTS tuya_projeto smallint NOT NULL DEFAULT 1;