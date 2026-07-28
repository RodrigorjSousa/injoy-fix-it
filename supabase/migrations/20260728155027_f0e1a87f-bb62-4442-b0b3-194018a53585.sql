ALTER TABLE public.room_housekeeping
  ADD COLUMN IF NOT EXISTS eci_time text,
  ADD COLUMN IF NOT EXISTS lco_time text;