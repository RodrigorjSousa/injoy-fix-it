ALTER TABLE public.room_housekeeping
  ADD COLUMN IF NOT EXISTS assigned_task TEXT,
  ADD COLUMN IF NOT EXISTS color_code TEXT;