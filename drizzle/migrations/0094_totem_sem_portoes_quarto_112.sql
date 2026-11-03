-- Totem em fase de testes até todas as fechaduras estarem integradas (nov/2026):
--   * sem senha provisória: o totem volta a gerar a senha na fechadura do quarto;
--   * portões e porta de vidro de Botafogo saem do sistema (desligados, não
--     apagados): hoje são operados direto no app Tuya Smart e serão trocados por
--     teclados TTLock, que entram pelo cadastro em Gestão › Fechaduras;
--   * quarto 112 cadastrado (funciona quando estiver "Controllable" no projeto Tuya).
UPDATE public.totem_dispositivos SET senha_provisoria = NULL;

UPDATE public.tuya_devices
   SET ativo = false
 WHERE unidade = 'Botafogo' AND tipo IN ('portao', 'vidro');

INSERT INTO public.tuya_devices (unidade, tipo, room_number, device_id, label, fornecedor) VALUES
  ('Botafogo', 'quarto', '112', 'eb22668ef4bb8163c0ophg', 'Quarto 112', 'tuya')
ON CONFLICT (device_id) DO NOTHING;
