DROP POLICY IF EXISTS "Documentos hospedes: gestores leem" ON storage.objects;
CREATE POLICY "Documentos hospedes: gestores leem" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documentos-hospedes'
    AND (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role))
  );

DROP POLICY IF EXISTS "Documentos hospedes: gestores apagam" ON storage.objects;
CREATE POLICY "Documentos hospedes: gestores apagam" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'documentos-hospedes'
    AND (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role))
  );
