
-- Atualiza trigger de novo usuário para não tentar gravar email em profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := NEW.email;
  v_nome TEXT := COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
  v_func_id UUID;
  v_user_count INT;
BEGIN
  INSERT INTO public.profiles (id, nome) VALUES (NEW.id, v_nome)
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.funcionarios SET user_id = NEW.id
  WHERE lower(email) = lower(v_email) AND user_id IS NULL
  RETURNING id INTO v_func_id;

  SELECT count(*) INTO v_user_count FROM public.user_roles;

  IF v_user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'gestor');
  ELSIF v_func_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'funcionario')
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'funcionario')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Remove views auxiliares
DROP VIEW IF EXISTS public.profiles_publico;
DROP VIEW IF EXISTS public.funcionarios_publico;

-- Remove coluna de email duplicada (continua disponível em auth.users)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS email;

-- Agora profiles é seguro para leitura ampla (somente id + nome)
DROP POLICY IF EXISTS "Users view own profile, gestores view all" ON public.profiles;
CREATE POLICY "Authenticated read profile names"
ON public.profiles FOR SELECT TO authenticated
USING (true);
