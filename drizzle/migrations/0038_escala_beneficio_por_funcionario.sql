-- Escala: vale alimentação (por mês) e vale transporte (por dia) ajustáveis por funcionário.
-- NULL = usa o valor padrão do quadro; 0 = a pessoa não recebe o benefício. Idempotente.
ALTER TABLE public.escala_colaboradores ADD COLUMN IF NOT EXISTS vale_alimentacao numeric(10,2);
ALTER TABLE public.escala_colaboradores ADD COLUMN IF NOT EXISTS vale_transporte_dia numeric(10,2);
ALTER TABLE public.escala_colaboradores DROP CONSTRAINT IF EXISTS escala_colaboradores_vales_ck;
ALTER TABLE public.escala_colaboradores ADD CONSTRAINT escala_colaboradores_vales_ck
  CHECK ((vale_alimentacao IS NULL OR vale_alimentacao >= 0) AND (vale_transporte_dia IS NULL OR vale_transporte_dia >= 0));
