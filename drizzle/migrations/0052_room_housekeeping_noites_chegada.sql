-- Card do quarto: noites do hóspede que chega hoje (a hora de chegada já existe em next_arrival_time).
-- Idempotente.
ALTER TABLE public.room_housekeeping ADD COLUMN IF NOT EXISTS next_nights integer;
