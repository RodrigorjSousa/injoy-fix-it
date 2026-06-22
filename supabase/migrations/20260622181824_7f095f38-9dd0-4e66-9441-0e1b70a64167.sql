
-- 1. profiles: remover policy permissiva duplicada e expor view só com nomes
DROP POLICY IF EXISTS "profiles visiveis para autenticados" ON public.profiles;

CREATE OR REPLACE VIEW public.profiles_publico
WITH (security_invoker = false) AS
SELECT id, nome FROM public.profiles;

GRANT SELECT ON public.profiles_publico TO authenticated;

-- 2. funcionarios: restringir SELECT e expor view sem email
DROP POLICY IF EXISTS "Authenticated view funcionarios" ON public.funcionarios;

CREATE OR REPLACE VIEW public.funcionarios_publico
WITH (security_invoker = false) AS
SELECT id, nome, categorias, user_id FROM public.funcionarios;

GRANT SELECT ON public.funcionarios_publico TO authenticated;

-- 3. Criar has_role no esquema privado
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;

-- 4. Recriar todas as policies usando private.has_role
DROP POLICY IF EXISTS "Users view own profile, gestores view all" ON public.profiles;
CREATE POLICY "Users view own profile, gestores view all"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id OR private.has_role(auth.uid(), 'gestor'::app_role));

DROP POLICY IF EXISTS "Users view own roles, gestores view all" ON public.user_roles;
CREATE POLICY "Users view own roles, gestores view all"
ON public.user_roles FOR SELECT TO authenticated
USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'gestor'::app_role));

CREATE POLICY "Funcionario ve a si proprio, gestores veem todos"
ON public.funcionarios FOR SELECT TO authenticated
USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'gestor'::app_role));

DROP POLICY IF EXISTS "Gestores manage funcionarios insert" ON public.funcionarios;
CREATE POLICY "Gestores manage funcionarios insert"
ON public.funcionarios FOR INSERT TO authenticated
WITH CHECK (private.has_role(auth.uid(), 'gestor'::app_role));

DROP POLICY IF EXISTS "Gestores manage funcionarios update" ON public.funcionarios;
CREATE POLICY "Gestores manage funcionarios update"
ON public.funcionarios FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(), 'gestor'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'gestor'::app_role));

DROP POLICY IF EXISTS "Gestores manage funcionarios delete" ON public.funcionarios;
CREATE POLICY "Gestores manage funcionarios delete"
ON public.funcionarios FOR DELETE TO authenticated
USING (private.has_role(auth.uid(), 'gestor'::app_role));

DROP POLICY IF EXISTS "Gestor sees all chamados, funcionario sees own" ON public.chamados;
CREATE POLICY "Gestor sees all chamados, funcionario sees own"
ON public.chamados FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'gestor'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.funcionarios f
    WHERE f.id = chamados.responsavel_id AND f.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Gestor creates chamados" ON public.chamados;
CREATE POLICY "Gestor creates chamados"
ON public.chamados FOR INSERT TO authenticated
WITH CHECK (private.has_role(auth.uid(), 'gestor'::app_role));

DROP POLICY IF EXISTS "Gestor or assigned funcionario updates chamados" ON public.chamados;
CREATE POLICY "Gestor or assigned funcionario updates chamados"
ON public.chamados FOR UPDATE TO authenticated
USING (
  private.has_role(auth.uid(), 'gestor'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.funcionarios f
    WHERE f.id = chamados.responsavel_id AND f.user_id = auth.uid()
  )
)
WITH CHECK (
  private.has_role(auth.uid(), 'gestor'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.funcionarios f
    WHERE f.id = chamados.responsavel_id AND f.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Gestor deletes chamados" ON public.chamados;
CREATE POLICY "Gestor deletes chamados"
ON public.chamados FOR DELETE TO authenticated
USING (private.has_role(auth.uid(), 'gestor'::app_role));

DROP POLICY IF EXISTS "Gestor inserts ativos" ON public.ativos_ar;
CREATE POLICY "Gestor inserts ativos"
ON public.ativos_ar FOR INSERT TO authenticated
WITH CHECK (private.has_role(auth.uid(), 'gestor'::app_role));

DROP POLICY IF EXISTS "Gestor deletes ativos" ON public.ativos_ar;
CREATE POLICY "Gestor deletes ativos"
ON public.ativos_ar FOR DELETE TO authenticated
USING (private.has_role(auth.uid(), 'gestor'::app_role));

DROP POLICY IF EXISTS "Gestor ou funcionario vinculado atualiza ativos" ON public.ativos_ar;
CREATE POLICY "Gestor ou tecnico de AC atualiza ativos"
ON public.ativos_ar FOR UPDATE TO authenticated
USING (
  private.has_role(auth.uid(), 'gestor'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.funcionarios f
    WHERE f.user_id = auth.uid()
      AND 'Ar condicionado' = ANY (f.categorias)
  )
)
WITH CHECK (
  private.has_role(auth.uid(), 'gestor'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.funcionarios f
    WHERE f.user_id = auth.uid()
      AND 'Ar condicionado' = ANY (f.categorias)
  )
);

-- 5. Remover versão pública de has_role agora que nada referencia
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);

-- 6. Revogar EXECUTE das funções de trigger (triggers não checam EXECUTE em runtime)
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.link_funcionario_to_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
