
ALTER TABLE public.room_housekeeping
  ADD COLUMN IF NOT EXISTS service_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS assigned_camareira text,
  ADD COLUMN IF NOT EXISTS service_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS service_ended_at timestamptz;
