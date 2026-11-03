-- Segundo projeto Tuya ("INJOY FECHADURAS 2", outra conta de desenvolvedor) para
-- mais 10 fechaduras "Controllable" na cota grátis do IoT Core. A edge function
-- tuya-password usa as credenciais do projeto de cada fechadura:
--   1 = TUYA_CLIENT_ID / TUYA_CLIENT_SECRET
--   2 = TUYA2_CLIENT_ID / TUYA2_CLIENT_SECRET
ALTER TABLE public.tuya_devices ADD COLUMN IF NOT EXISTS tuya_projeto smallint NOT NULL DEFAULT 1;

INSERT INTO public.tuya_devices (unidade, tipo, room_number, device_id, label, fornecedor, tuya_projeto) VALUES
  ('Botafogo', 'quarto', '113', 'eb34b1c0ced002302cbunn', 'Quarto 113', 'tuya', 2),
  ('Botafogo', 'quarto', '114', 'ebfac774b218f26adexrlx', 'Quarto 114', 'tuya', 2),
  ('Botafogo', 'quarto', '115', 'ebd0cc718c7e678a42khub', 'Quarto 115', 'tuya', 2),
  ('Botafogo', 'quarto', '117', 'ebc43ff49176e079d7znzc', 'Quarto 117', 'tuya', 2),
  ('Botafogo', 'quarto', '118', 'eb6e92074066975bb3eggd', 'Quarto 118', 'tuya', 2)
ON CONFLICT (device_id) DO UPDATE SET tuya_projeto = EXCLUDED.tuya_projeto, ativo = true;
