ALTER TABLE public.room_housekeeping
  ADD COLUMN IF NOT EXISTS has_eci boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_lco boolean NOT NULL DEFAULT false;