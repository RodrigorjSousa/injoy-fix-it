-- Tela RESERVAS: link de pagamento cancelado (status "link_cancelado").
-- O app cancela o link aberto antes de "Cobrar agora" (para o hóspede não pagar duas vezes) e
-- a recepção pode cancelar o link pelo botão "Cancelar link". Idempotente.
ALTER TABLE public.reservas_cobranca_pagamentos DROP CONSTRAINT IF EXISTS reservas_cobranca_pagamentos_status_ck;
ALTER TABLE public.reservas_cobranca_pagamentos ADD CONSTRAINT reservas_cobranca_pagamentos_status_ck CHECK (status IN
  ('processando', 'aprovado', 'autenticacao', 'recusado', 'erro', 'link_enviado', 'link_pago', 'link_cancelado', 'registrado'));
