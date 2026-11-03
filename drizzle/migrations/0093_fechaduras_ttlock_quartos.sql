-- Fechaduras de Botafogo para o totem (nov/2026):
--   * Portões passam a ser teclados TTLock (MF03 + gateway G2). A coluna
--     fornecedor diz quem atende o aparelho; para TTLock, device_id = lockId do
--     app TTLock. A edge function tuya-password grava a MESMA senha de 6 dígitos
--     nos portões TTLock e nas fechaduras Tuya Zigbee dos quartos.
--   * Quartos com permissão "Controllable" no projeto Tuya (cota grátis: 10
--     aparelhos): 001, 002, 003, 005, 006, 107, 109, 110, 111. Faltam 112, 113,
--     114, 115, 117 e 118 (sem cota).
ALTER TABLE public.tuya_devices ADD COLUMN IF NOT EXISTS fornecedor text NOT NULL DEFAULT 'tuya';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tuya_devices_fornecedor_check') THEN
    ALTER TABLE public.tuya_devices
      ADD CONSTRAINT tuya_devices_fornecedor_check CHECK (fornecedor IN ('tuya', 'ttlock'));
  END IF;
END $$;

INSERT INTO public.tuya_devices (unidade, tipo, room_number, device_id, label, fornecedor) VALUES
  ('Botafogo', 'quarto', '001', 'eb39cd9c7614de7a9egpmz', 'Quarto 001', 'tuya'),
  ('Botafogo', 'quarto', '002', 'ebe3c1597a64ec68bbqpu4', 'Quarto 002', 'tuya'),
  ('Botafogo', 'quarto', '003', 'ebe320322b2910ef2bzwhh', 'Quarto 003', 'tuya'),
  ('Botafogo', 'quarto', '006', 'eb559ec4177a35d795vyiy', 'Quarto 006', 'tuya'),
  ('Botafogo', 'quarto', '107', 'eb8dc829a72e09a33fl95r', 'Quarto 107', 'tuya'),
  ('Botafogo', 'quarto', '109', 'eb08ec161e494e9f6cdp92', 'Quarto 109', 'tuya'),
  ('Botafogo', 'quarto', '110', 'eb33132aa3731f259dhfes', 'Quarto 110', 'tuya'),
  ('Botafogo', 'quarto', '111', 'eb156085598385f251z4om', 'Quarto 111', 'tuya')
ON CONFLICT (device_id) DO NOTHING;

-- Portão Gradeado em TTLock: cadastrado DESLIGADO. Ligar (e desligar o portão
-- Tuya antigo) em Gestão › Fechaduras quando o teclado for instalado no portão.
-- O segundo teclado (porta de vidro) entra pelo mesmo caminho quando chegar.
INSERT INTO public.tuya_devices (unidade, tipo, room_number, device_id, label, fornecedor, ativo) VALUES
  ('Botafogo', 'portao', NULL, '36396334', 'Portão Gradeado (TTLock)', 'ttlock', false)
ON CONFLICT (device_id) DO NOTHING;
