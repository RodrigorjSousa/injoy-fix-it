ALTER TABLE public.room_housekeeping ADD COLUMN IF NOT EXISTS block_kind text;
ALTER TABLE public.room_housekeeping ADD COLUMN IF NOT EXISTS block_reason text;