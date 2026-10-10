-- Escala: horário habitual do freelancer no cadastro (a 0039_escala_horario_freelancer não foi
-- aplicada no banco, e sem essas colunas nenhum colaborador conseguia ser salvo). Idempotente.
ALTER TABLE public.escala_colaboradores ADD COLUMN IF NOT EXISTS hora_entrada time;
ALTER TABLE public.escala_colaboradores ADD COLUMN IF NOT EXISTS hora_saida time;
