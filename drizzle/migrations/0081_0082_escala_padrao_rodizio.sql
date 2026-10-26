-- Folgas variadas (rodízio) no 5x2 revezamento: as folgas mudam de dia a cada semana. Idempotente.
ALTER TABLE public.escala_padroes ADD COLUMN IF NOT EXISTS rodizio boolean NOT NULL DEFAULT false;