
ALTER TABLE public.ativos_ar ADD COLUMN IF NOT EXISTS tecnico text;
ALTER TABLE public.ativos_ar ALTER COLUMN ultima_limpeza DROP NOT NULL;
