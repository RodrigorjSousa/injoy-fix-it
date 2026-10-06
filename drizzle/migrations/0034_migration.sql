-- Férias: opção de a própria pessoa trabalhar como extra nos dias de folga dela durante as férias
-- (ex.: Maria cobre as folgas da Cristina e recebe extra). Idempotente.
ALTER TABLE public.escala_ferias ADD COLUMN IF NOT EXISTS folgas_extra boolean NOT NULL DEFAULT false;
ALTER TABLE public.escala_ferias ADD COLUMN IF NOT EXISTS folgas_modalidade_id uuid REFERENCES public.escala_freelance_modalidades(id) ON DELETE SET NULL;
ALTER TABLE public.escala_ferias ADD COLUMN IF NOT EXISTS folgas_hora_entrada time;
ALTER TABLE public.escala_ferias ADD COLUMN IF NOT EXISTS folgas_horas numeric(6,2);
ALTER TABLE public.escala_ferias ADD COLUMN IF NOT EXISTS folgas_valor numeric(10,2);

ALTER TABLE public.escala_ferias DROP CONSTRAINT IF EXISTS escala_ferias_folgas_extra_ck;
ALTER TABLE public.escala_ferias ADD CONSTRAINT escala_ferias_folgas_extra_ck
  CHECK ((folgas_horas IS NULL OR folgas_horas > 0) AND (folgas_valor IS NULL OR folgas_valor >= 0));
