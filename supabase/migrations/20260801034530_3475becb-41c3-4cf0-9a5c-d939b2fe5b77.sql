ALTER TABLE public.room_housekeeping
  ADD COLUMN IF NOT EXISTS departing_guest_name TEXT,
  ADD COLUMN IF NOT EXISTS next_guest_name TEXT,
  ADD COLUMN IF NOT EXISTS next_arrival_time TEXT,
  ADD COLUMN IF NOT EXISTS next_pax INTEGER;