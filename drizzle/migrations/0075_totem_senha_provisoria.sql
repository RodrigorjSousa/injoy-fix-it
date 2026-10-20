-- Fase de testes do totem: enquanto as fechaduras não estão todas integradas
-- (portões Tuya Wi-Fi serão trocados por TTLock), o totem entrega esta senha
-- fixa para todas as portas, em vez de gerar uma senha na Tuya. Também não
-- bloqueia quarto sem fechadura cadastrada. Vazio (NULL) = funcionamento normal.
ALTER TABLE public.totem_dispositivos ADD COLUMN IF NOT EXISTS senha_provisoria text;

UPDATE public.totem_dispositivos SET senha_provisoria = 'injoy2014' WHERE senha_provisoria IS NULL;
