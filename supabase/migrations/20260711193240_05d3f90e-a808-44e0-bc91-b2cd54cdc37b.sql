ALTER TABLE public.room_housekeeping
ADD COLUMN IF NOT EXISTS is_dnd boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS dnd_photo_url text,
ADD COLUMN IF NOT EXISTS room_comment text;