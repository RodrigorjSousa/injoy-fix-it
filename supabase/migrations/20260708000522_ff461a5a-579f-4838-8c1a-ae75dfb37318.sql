ALTER TABLE public.room_housekeeping
  ADD COLUMN IF NOT EXISTS guest_name TEXT,
  ADD COLUMN IF NOT EXISTS pax INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_pending_payment BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_pending_docs BOOLEAN DEFAULT false;

ALTER PUBLICATION supabase_realtime ADD TABLE public.room_housekeeping;
ALTER TABLE public.room_housekeeping REPLICA IDENTITY FULL;