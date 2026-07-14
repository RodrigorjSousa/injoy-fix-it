
CREATE TABLE public.booking_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unidade TEXT NOT NULL CHECK (unidade IN ('Botafogo','Ipanema')),
  reference_date DATE NOT NULL,
  overall_score NUMERIC(4,2) NOT NULL,
  cleanliness_score NUMERIC(4,2),
  staff_score NUMERIC(4,2),
  sample_size INT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_booking_reviews_unidade_date ON public.booking_reviews (unidade, reference_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_reviews TO authenticated;
GRANT ALL ON public.booking_reviews TO service_role;

ALTER TABLE public.booking_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestores view booking reviews"
  ON public.booking_reviews FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Gestores insert booking reviews"
  ON public.booking_reviews FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Gestores update booking reviews"
  ON public.booking_reviews FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Gestores delete booking reviews"
  ON public.booking_reviews FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_booking_reviews_updated_at
  BEFORE UPDATE ON public.booking_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
