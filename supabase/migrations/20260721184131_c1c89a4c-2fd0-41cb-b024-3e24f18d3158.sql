ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS pontomais_employee_id text;

COMMENT ON COLUMN public.funcionarios.pontomais_employee_id IS
  'ID interno do funcionário na Pontomais (visto na URL do perfil). Quando preenchido, é usado direto na sincronização, sem depender de CPF/e-mail.';