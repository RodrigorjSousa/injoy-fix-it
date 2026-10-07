-- Escala: freelancer com turno (já existia turno_padrao) e horário de entrada/saída habituais no cadastro,
-- usados como sugestão ao escalar. Idempotente.
ALTER TABLE public.escala_colaboradores ADD COLUMN IF NOT EXISTS hora_entrada time;
ALTER TABLE public.escala_colaboradores ADD COLUMN IF NOT EXISTS hora_saida time;
