CREATE TABLE public.hotel_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property TEXT NOT NULL,
  date DATE NOT NULL,
  occupancy_percentage NUMERIC NOT NULL DEFAULT 0,
  clean_rooms INTEGER NOT NULL DEFAULT 0,
  dirty_rooms INTEGER NOT NULL DEFAULT 0,
  maintenance_rooms INTEGER NOT NULL DEFAULT 0,
  pending_balance NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (property, date)
);

GRANT SELECT ON public.hotel_metrics TO authenticated;
GRANT ALL ON public.hotel_metrics TO service_role;

ALTER TABLE public.hotel_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view hotel metrics"
ON public.hotel_metrics FOR SELECT
TO authenticated
USING (true);

CREATE TRIGGER update_hotel_metrics_updated_at
BEFORE UPDATE ON public.hotel_metrics
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();