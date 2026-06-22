
ALTER TABLE public.ativos_ar ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Limpo';
