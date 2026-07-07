
ALTER TABLE public.hotel_metrics
  ADD COLUMN IF NOT EXISTS available_rooms INTEGER,
  ADD COLUMN IF NOT EXISTS pending_docs_count INTEGER;

CREATE TABLE IF NOT EXISTS public.room_housekeeping (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property TEXT NOT NULL,
  room_number TEXT NOT NULL,
  room_type TEXT,
  status TEXT,
  condition TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (property, room_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_housekeeping TO authenticated;
GRANT ALL ON public.room_housekeeping TO service_role;

ALTER TABLE public.room_housekeeping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read room_housekeeping"
  ON public.room_housekeeping FOR SELECT
  TO authenticated
  USING (true);
