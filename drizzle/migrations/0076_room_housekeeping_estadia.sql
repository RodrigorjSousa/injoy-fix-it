-- Card das camareiras: datas da estadia (entrada e saída do hóspede atual, saída de quem chega hoje).
-- Preenchidas pela sincronização com o Cloudbeds (consolidar-dados). Idempotente.
ALTER TABLE public.room_housekeeping ADD COLUMN IF NOT EXISTS guest_checkin_date date;
ALTER TABLE public.room_housekeeping ADD COLUMN IF NOT EXISTS guest_checkout_date date;
ALTER TABLE public.room_housekeeping ADD COLUMN IF NOT EXISTS next_checkout_date date;
