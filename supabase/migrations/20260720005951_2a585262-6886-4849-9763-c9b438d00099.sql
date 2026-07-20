ALTER TABLE public.preventive_tasks 
  ADD COLUMN IF NOT EXISTS property TEXT,
  ADD COLUMN IF NOT EXISTS discipline TEXT;