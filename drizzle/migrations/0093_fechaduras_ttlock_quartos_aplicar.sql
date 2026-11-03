-- Fechaduras de Botafogo para o totem (nov/2026): coluna fornecedor diz quem atende o aparelho (tuya ou ttlock).
ALTER TABLE public.tuya_devices ADD COLUMN IF NOT EXISTS fornecedor text NOT NULL DEFAULT 'tuya';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tuya_devices_fornecedor_check') THEN
    ALTER TABLE public.tuya_devices
      ADD CONSTRAINT tuya_devices_fornecedor_check CHECK (fornecedor IN ('tuya', 'ttlock'));
  END IF;
END $$;