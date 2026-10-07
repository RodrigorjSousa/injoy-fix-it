-- Escala: distribuição em blocos para quem trabalha nas duas unidades
-- (ex.: Flavio — primeiros 12 dias de trabalho do mês em Botafogo, o resto em Ipanema). Idempotente.
ALTER TABLE public.escala_padroes ADD COLUMN IF NOT EXISTS distribuicao text;
ALTER TABLE public.escala_padroes DROP CONSTRAINT IF EXISTS escala_padroes_distribuicao_ck;
ALTER TABLE public.escala_padroes ADD CONSTRAINT escala_padroes_distribuicao_ck
  CHECK (distribuicao IS NULL OR distribuicao IN ('semana', 'bloco'));
