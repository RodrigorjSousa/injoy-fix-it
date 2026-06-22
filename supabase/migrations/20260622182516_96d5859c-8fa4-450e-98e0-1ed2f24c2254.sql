
-- 1) ativos_ar UPDATE
DROP POLICY IF EXISTS "Gestor ou tecnico de AC atualiza ativos" ON public.ativos_ar;
DROP POLICY IF EXISTS "Gestor ou tecnico atribuido atualiza ativos" ON public.ativos_ar;
CREATE POLICY "Gestor ou tecnico atribuido atualiza ativos"
  ON public.ativos_ar FOR UPDATE TO authenticated
  USING (
    private.has_role(auth.uid(), 'gestor'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.funcionarios f
      WHERE f.user_id = auth.uid()
        AND 'Ar condicionado' = ANY (f.categorias)
        AND f.nome = public.ativos_ar.tecnico
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

-- 2) profiles: restrict SELECT to own or gestor
DROP POLICY IF EXISTS "Authenticated read profile names" ON public.profiles;
DROP POLICY IF EXISTS "profiles visiveis para autenticados" ON public.profiles;
DROP POLICY IF EXISTS "Users view own profile, gestores view all" ON public.profiles;
DROP POLICY IF EXISTS "Users view own or gestor views all" ON public.profiles;
CREATE POLICY "Users view own or gestor views all"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR private.has_role(auth.uid(), 'gestor'::app_role)
  );

-- Secure function for chat contact list (id + nome only)
CREATE OR REPLACE FUNCTION public.get_chat_contacts()
RETURNS TABLE(id uuid, nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nome
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL AND p.id <> auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.get_chat_contacts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chat_contacts() TO authenticated;

-- 3) Storage: restrict SELECT on fotos-manutencao
DROP POLICY IF EXISTS "Authenticated users read fotos-manutencao" ON storage.objects;
DROP POLICY IF EXISTS "Owner or gestor read fotos-manutencao" ON storage.objects;
CREATE POLICY "Owner or gestor read fotos-manutencao"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'fotos-manutencao'
    AND (
      (storage.foldername(name))[1] = (auth.uid())::text
      OR private.has_role(auth.uid(), 'gestor'::app_role)
    )
  );
