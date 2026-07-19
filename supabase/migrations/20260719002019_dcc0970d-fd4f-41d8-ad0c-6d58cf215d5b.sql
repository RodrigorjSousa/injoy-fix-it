
CREATE TABLE IF NOT EXISTS public.reservation_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property text NOT NULL,
  reservation_id text NOT NULL,
  guest_name text NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL CHECK (payment_method IN ('PIX','Cartão de Crédito','Cartão de Débito','Dinheiro')),
  received_by text NOT NULL,
  received_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cloudbeds_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservation_payments_property_date
  ON public.reservation_payments (property, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservation_payments_reservation
  ON public.reservation_payments (reservation_id);

GRANT SELECT, INSERT ON public.reservation_payments TO authenticated;
GRANT ALL ON public.reservation_payments TO service_role;

ALTER TABLE public.reservation_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reservation_payments_insert_recepcao"
  ON public.reservation_payments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(), 'recepcao'::public.app_role)
    OR private.has_role(auth.uid(), 'gestor'::public.app_role)
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "reservation_payments_select_admin"
  ON public.reservation_payments
  FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'gestor'::public.app_role)
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "reservation_payments_select_own"
  ON public.reservation_payments
  FOR SELECT
  TO authenticated
  USING (received_by_user_id = auth.uid());
