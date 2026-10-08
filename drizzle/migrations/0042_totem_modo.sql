-- Totem: cada tablet pode ser dedicado a uma função (balcão "Express").
--   'ambos'    → o hóspede escolhe check-in ou check-out
--   'checkin'  → só check-in (abre direto na tela de check-in)
--   'checkout' → só check-out
-- Pode ser aplicada mais de uma vez.

ALTER TABLE public.totem_dispositivos
  ADD COLUMN IF NOT EXISTS modo text NOT NULL DEFAULT 'ambos';

ALTER TABLE public.totem_dispositivos
  DROP CONSTRAINT IF EXISTS totem_dispositivos_modo_check;
ALTER TABLE public.totem_dispositivos
  ADD CONSTRAINT totem_dispositivos_modo_check CHECK (modo IN ('ambos', 'checkin', 'checkout'));
