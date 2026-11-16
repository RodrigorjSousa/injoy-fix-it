-- Estrutura da 0103; os cadastros são aplicados separadamente pelas ferramentas de dados.
ALTER TABLE public.tuya_devices DROP CONSTRAINT IF EXISTS tuya_devices_fornecedor_check;
ALTER TABLE public.tuya_devices
  ADD CONSTRAINT tuya_devices_fornecedor_check CHECK (fornecedor IN ('tuya', 'ttlock', 'manual'));

-- Senha provisória: marca no histórico e quando entrou no campo da reserva do Cloudbeds.
ALTER TABLE public.tuya_password_logs ADD COLUMN IF NOT EXISTS provisoria boolean NOT NULL DEFAULT false;
ALTER TABLE public.tuya_password_logs ADD COLUMN IF NOT EXISTS cloudbeds_campo_em timestamptz;
CREATE INDEX IF NOT EXISTS tuya_password_logs_reserva_idx ON public.tuya_password_logs (reservation_id);

-- Configuração (por totem; vale o primeiro totem ativo da unidade com a opção ligada).
ALTER TABLE public.totem_dispositivos ADD COLUMN IF NOT EXISTS senha_portoes_auto boolean NOT NULL DEFAULT false;
ALTER TABLE public.totem_dispositivos ADD COLUMN IF NOT EXISTS campo_cloudbeds_senha text NOT NULL DEFAULT 'codigo_portoes';
ALTER TABLE public.totem_dispositivos ADD COLUMN IF NOT EXISTS hora_email_codigos text NOT NULL DEFAULT '17:00';
