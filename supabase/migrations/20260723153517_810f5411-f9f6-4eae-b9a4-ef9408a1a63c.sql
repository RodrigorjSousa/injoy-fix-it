-- Garante que funcionários autenticados consigam consultar a equipe necessária para chamados
DROP POLICY IF EXISTS "Funcionarios visíveis para dono ou gestor" ON public.funcionarios;
DROP POLICY IF EXISTS "Authenticated users view operational staff" ON public.funcionarios;
CREATE POLICY "Authenticated users view operational staff"
ON public.funcionarios
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- Reforça permissões da tabela de chamados para todos os usuários autenticados
DROP POLICY IF EXISTS "Authenticated users create chamados" ON public.chamados;
DROP POLICY IF EXISTS "Authenticated users read all chamados" ON public.chamados;
DROP POLICY IF EXISTS "Authenticated users update chamados" ON public.chamados;
CREATE POLICY "Authenticated users create chamados"
ON public.chamados
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND criado_por = auth.uid());
CREATE POLICY "Authenticated users read all chamados"
ON public.chamados
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users update chamados"
ON public.chamados
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Corrige upload e leitura de fotos/vídeos de manutenção para todos os usuários logados
DROP POLICY IF EXISTS "Authenticated read fotos-manutencao" ON storage.objects;
DROP POLICY IF EXISTS "Users upload own folder fotos-manutencao" ON storage.objects;
DROP POLICY IF EXISTS "Users update own files fotos-manutencao" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own files fotos-manutencao" ON storage.objects;
CREATE POLICY "Authenticated read fotos-manutencao"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'fotos-manutencao');
CREATE POLICY "Authenticated upload fotos-manutencao"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'fotos-manutencao' AND auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated update fotos-manutencao"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'fotos-manutencao' AND auth.uid() IS NOT NULL)
WITH CHECK (bucket_id = 'fotos-manutencao' AND auth.uid() IS NOT NULL);
CREATE POLICY "Gestores delete fotos-manutencao"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'fotos-manutencao' AND (private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role)));

-- Vincula cadastros de funcionários a usuários já existentes pelo e-mail, se ainda estiverem soltos
UPDATE public.funcionarios f
SET user_id = u.id
FROM auth.users u
WHERE f.user_id IS NULL
  AND f.email IS NOT NULL
  AND lower(f.email) = lower(u.email);

-- Garante papel operacional para qualquer funcionário já vinculado e ainda sem role
INSERT INTO public.user_roles (user_id, role)
SELECT f.user_id, 'funcionario'::public.app_role
FROM public.funcionarios f
WHERE f.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = f.user_id
  )
ON CONFLICT DO NOTHING;