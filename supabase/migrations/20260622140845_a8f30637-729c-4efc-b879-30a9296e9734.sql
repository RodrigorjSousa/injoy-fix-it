-- Enums
CREATE TYPE public.app_role AS ENUM ('gestor', 'funcionario');
CREATE TYPE public.chamado_status AS ENUM ('Aberto', 'Em Andamento', 'Concluído');
CREATE TYPE public.unidade AS ENUM ('Botafogo', 'Ipanema');

-- updated_at helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- USER ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- FUNCIONARIOS
CREATE TABLE public.funcionarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  categorias TEXT[] NOT NULL DEFAULT '{}',
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funcionarios TO authenticated;
GRANT ALL ON public.funcionarios TO service_role;
ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_funcionarios_updated BEFORE UPDATE ON public.funcionarios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- CHAMADOS
CREATE TABLE public.chamados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade unidade NOT NULL,
  categoria TEXT NOT NULL,
  descricao TEXT NOT NULL,
  status chamado_status NOT NULL DEFAULT 'Aberto',
  responsavel_id UUID REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  foto_antes TEXT,
  foto_depois TEXT,
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chamados TO authenticated;
GRANT ALL ON public.chamados TO service_role;
ALTER TABLE public.chamados ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_chamados_updated BEFORE UPDATE ON public.chamados
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ATIVOS DE AR
CREATE TABLE public.ativos_ar (
  id TEXT PRIMARY KEY,
  unidade unidade NOT NULL,
  localizacao TEXT NOT NULL,
  ultima_limpeza TIMESTAMPTZ NOT NULL DEFAULT now(),
  intervalo_dias INTEGER NOT NULL DEFAULT 90,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ativos_ar TO authenticated;
GRANT ALL ON public.ativos_ar TO service_role;
ALTER TABLE public.ativos_ar ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_ativos_updated BEFORE UPDATE ON public.ativos_ar
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- RLS POLICIES
-- =====================================================================

-- profiles
CREATE POLICY "Users view own profile, gestores view all" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- user_roles (read-only para usuários; gestão via trigger/service_role)
CREATE POLICY "Users view own roles, gestores view all" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'gestor'));

-- funcionarios
CREATE POLICY "Authenticated view funcionarios" ON public.funcionarios FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "Gestores manage funcionarios insert" ON public.funcionarios FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Gestores manage funcionarios update" ON public.funcionarios FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gestor')) WITH CHECK (public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Gestores manage funcionarios delete" ON public.funcionarios FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'));

-- chamados
CREATE POLICY "Gestor sees all chamados, funcionario sees own" ON public.chamados FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestor')
    OR responsavel_id IN (SELECT id FROM public.funcionarios WHERE user_id = auth.uid())
  );
CREATE POLICY "Gestor creates chamados" ON public.chamados FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Gestor or assigned funcionario updates chamados" ON public.chamados FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestor')
    OR responsavel_id IN (SELECT id FROM public.funcionarios WHERE user_id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'gestor')
    OR responsavel_id IN (SELECT id FROM public.funcionarios WHERE user_id = auth.uid())
  );
CREATE POLICY "Gestor deletes chamados" ON public.chamados FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'));

-- ativos_ar
CREATE POLICY "Authenticated view ativos" ON public.ativos_ar FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated update ativos (registrar limpeza)" ON public.ativos_ar FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);
CREATE POLICY "Gestor inserts ativos" ON public.ativos_ar FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Gestor deletes ativos" ON public.ativos_ar FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'));

-- =====================================================================
-- TRIGGER: novo usuário → profile + role + vínculo funcionário
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email TEXT := NEW.email;
  v_nome TEXT := COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
  v_func_id UUID;
  v_user_count INT;
BEGIN
  INSERT INTO public.profiles (id, email, nome) VALUES (NEW.id, v_email, v_nome)
  ON CONFLICT (id) DO NOTHING;

  -- tenta vincular a funcionário pré-cadastrado pelo email
  UPDATE public.funcionarios SET user_id = NEW.id
  WHERE lower(email) = lower(v_email) AND user_id IS NULL
  RETURNING id INTO v_func_id;

  SELECT count(*) INTO v_user_count FROM public.user_roles;

  IF v_user_count = 0 THEN
    -- primeiro usuário do sistema vira gestor
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'gestor');
  ELSIF v_func_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'funcionario')
    ON CONFLICT DO NOTHING;
  ELSE
    -- usuário sem vínculo: também recebe perfil funcionário (acesso mínimo)
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'funcionario')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger: quando um funcionário é cadastrado/atualizado com email,
-- vincular automaticamente se já existe usuário com esse email
CREATE OR REPLACE FUNCTION public.link_funcionario_to_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user UUID;
BEGIN
  IF NEW.user_id IS NULL THEN
    SELECT id INTO v_user FROM auth.users WHERE lower(email) = lower(NEW.email) LIMIT 1;
    IF v_user IS NOT NULL THEN
      NEW.user_id := v_user;
      INSERT INTO public.user_roles (user_id, role) VALUES (v_user, 'funcionario')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_link_funcionario
  BEFORE INSERT OR UPDATE OF email, user_id ON public.funcionarios
  FOR EACH ROW EXECUTE FUNCTION public.link_funcionario_to_user();

-- Seed inicial dos ativos de ar (dados de demonstração)
INSERT INTO public.ativos_ar (id, unidade, localizacao, ultima_limpeza, intervalo_dias) VALUES
  ('AC-B-101', 'Botafogo', 'Quarto 101', now() - interval '20 days', 90),
  ('AC-B-201', 'Botafogo', 'Quarto 201', now() - interval '120 days', 90),
  ('AC-B-LOB', 'Botafogo', 'Lobby Principal', now() - interval '45 days', 90),
  ('AC-I-301', 'Ipanema', 'Quarto 301', now() - interval '15 days', 90),
  ('AC-I-401', 'Ipanema', 'Quarto 401', now() - interval '100 days', 90),
  ('AC-I-RES', 'Ipanema', 'Restaurante', now() - interval '60 days', 90)
ON CONFLICT (id) DO NOTHING;