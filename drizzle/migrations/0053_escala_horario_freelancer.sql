ALTER TABLE public.escala_colaboradores ADD COLUMN IF NOT EXISTS hora_entrada time;
ALTER TABLE public.escala_colaboradores ADD COLUMN IF NOT EXISTS hora_saida time;