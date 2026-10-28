-- Joy — E3: opção "Joy responde sozinha para os números de teste". Ver docs/projeto-injoy/08-whatsapp-ia.md.
-- Quando ligada, o rascunho da Joy é enviado sem aprovação, MAS só para os números da lista de teste.
-- Para qualquer outro número continua valendo o rascunho com aprovação. Começa desligada. Idempotente.
ALTER TABLE public.wa_config ADD COLUMN IF NOT EXISTS envio_automatico_teste boolean NOT NULL DEFAULT false;
