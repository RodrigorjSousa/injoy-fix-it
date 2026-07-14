-- Restrict ativos_ar SELECT: only gestor or the assigned AC technician
DROP POLICY IF EXISTS "Authenticated view ativos" ON public.ativos_ar;

CREATE POLICY "Gestor ou tecnico AC visualiza ativos"
ON public.ativos_ar
FOR SELECT
TO authenticated
USING (
  private.has_role(auth.uid(), 'gestor'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.funcionarios f
    WHERE f.user_id = auth.uid()
      AND 'Ar condicionado' = ANY (f.categorias)
      AND f.nome = ativos_ar.tecnico
  )
);

-- Owner-scoped policies for the 'personal-media' storage bucket
-- Path convention: <user_id>/<...>
CREATE POLICY "Users select own personal-media"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'personal-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users insert own personal-media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'personal-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users update own personal-media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'personal-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'personal-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users delete own personal-media"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'personal-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);