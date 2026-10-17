-- Tela RESERVAS: índice dos Clientes do Stripe pelo nº da reserva.
-- O Cloudbeds cria no Stripe um Cliente por reserva com a descrição "... - Reservas: <nº>", mas a busca do Stripe
-- não filtra descrição. O app (de hora em hora) grava no Cliente a metadata injoy_reserva_<nº> = "1" e então
-- acha o cartão direto. Esta tabela guarda até onde a varredura do histórico chegou, por unidade.
-- Idempotente. Sem FK para auth.users e sem INSERT de dados (o Lovable recusa).
CREATE TABLE IF NOT EXISTS public.reservas_stripe_indice (
  unidade text PRIMARY KEY,
  historico_apos text,
  historico_concluido boolean NOT NULL DEFAULT false,
  indexados integer NOT NULL DEFAULT 0,
  ultima_execucao timestamptz,
  erro text,
  CONSTRAINT reservas_stripe_indice_unidade_ck CHECK (unidade IN ('Botafogo', 'Ipanema'))
);
GRANT SELECT ON public.reservas_stripe_indice TO authenticated;
GRANT ALL ON public.reservas_stripe_indice TO service_role;
ALTER TABLE public.reservas_stripe_indice ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestor consulta o indice do Stripe" ON public.reservas_stripe_indice;
CREATE POLICY "Gestor consulta o indice do Stripe" ON public.reservas_stripe_indice
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));