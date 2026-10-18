-- Tela RESERVAS: situação do cartão no Stripe por reserva, para o selo na lista (conferida de hora em hora e
-- a cada abertura da janela "Cobrar agora").
--   ok          = Cliente do Stripe achado e com cartão guardado
--   sem_cartao  = Cliente achado, mas o Stripe não guardou o cartão (ex.: cartão que pede autenticação)
--   sem_cliente = nenhum Cliente do Stripe com esta reserva (cartão guardado só no Cloudbeds)
-- O servidor grava; o app só lê. Idempotente.
ALTER TABLE public.reservas_cobranca ADD COLUMN IF NOT EXISTS stripe_situacao text;
ALTER TABLE public.reservas_cobranca ADD COLUMN IF NOT EXISTS stripe_conferido_em timestamptz;
ALTER TABLE public.reservas_cobranca DROP CONSTRAINT IF EXISTS reservas_cobranca_stripe_situacao_ck;
ALTER TABLE public.reservas_cobranca ADD CONSTRAINT reservas_cobranca_stripe_situacao_ck
  CHECK (stripe_situacao IS NULL OR stripe_situacao IN ('ok', 'sem_cartao', 'sem_cliente'));
