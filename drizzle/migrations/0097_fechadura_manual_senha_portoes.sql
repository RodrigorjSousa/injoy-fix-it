-- Botafogo, nov/2026.
--
-- 1) Quartos com fechadura de teclado SEM integração (108, 301, 401, 501): marca
--    "manual". O totem conclui o check-in, mostra a senha fixa do quarto e gera a
--    senha dos portões. As senhas NÃO ficam aqui (o repositório é público): o
--    gestor digita cada uma em Gestão › Fechaduras. Sem a senha cadastrada o
--    totem continua parando em "sem fechadura digital".
-- 2) Senha provisória dos portões depois do check-in online no Cloudbeds
--    (/api/public/senha-portoes, agendado na 0098).
-- Idempotente.

ALTER TABLE public.tuya_devices DROP CONSTRAINT IF EXISTS tuya_devices_fornecedor_check;
ALTER TABLE public.tuya_devices
  ADD CONSTRAINT tuya_devices_fornecedor_check CHECK (fornecedor IN ('tuya', 'ttlock', 'manual'));

INSERT INTO public.tuya_devices (unidade, tipo, room_number, device_id, label, fornecedor, ativo) VALUES
  ('Botafogo', 'quarto', '108', 'manual-botafogo-108', 'APT 108', 'manual', true),
  ('Botafogo', 'quarto', '301', 'manual-botafogo-301', 'APT 301', 'manual', true),
  ('Botafogo', 'quarto', '401', 'manual-botafogo-401', 'APT 401', 'manual', true),
  ('Botafogo', 'quarto', '501', 'manual-botafogo-501', 'APT 501', 'manual', true)
ON CONFLICT (device_id) DO NOTHING;

-- Senha provisória: marca no histórico e quando entrou no campo da reserva do Cloudbeds.
ALTER TABLE public.tuya_password_logs ADD COLUMN IF NOT EXISTS provisoria boolean NOT NULL DEFAULT false;
ALTER TABLE public.tuya_password_logs ADD COLUMN IF NOT EXISTS cloudbeds_campo_em timestamptz;
CREATE INDEX IF NOT EXISTS tuya_password_logs_reserva_idx ON public.tuya_password_logs (reservation_id);

-- Configuração (por totem; vale o primeiro totem ativo da unidade com a opção ligada).
ALTER TABLE public.totem_dispositivos ADD COLUMN IF NOT EXISTS senha_portoes_auto boolean NOT NULL DEFAULT false;
ALTER TABLE public.totem_dispositivos ADD COLUMN IF NOT EXISTS campo_cloudbeds_senha text NOT NULL DEFAULT 'codigo_portoes';
ALTER TABLE public.totem_dispositivos ADD COLUMN IF NOT EXISTS hora_email_codigos text NOT NULL DEFAULT '17:00';
