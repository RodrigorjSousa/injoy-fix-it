-- Senha provisória dos portões: modo de teste. Ligado (padrão), a rotina só atende
-- reservas cujo titular tem "TESTE" no nome, para testar com uma reserva de teste
-- sem mexer nas reservas reais. Desligar no dia de liberar o totem. Idempotente.
ALTER TABLE public.totem_dispositivos
  ADD COLUMN IF NOT EXISTS senha_portoes_so_teste boolean NOT NULL DEFAULT true;
