
DROP POLICY IF EXISTS "Recados midia: leitura autenticada" ON storage.objects;
DROP POLICY IF EXISTS "Recados midia: upload admin/gestor" ON storage.objects;
DROP POLICY IF EXISTS "Recados midia: delete admin/gestor" ON storage.objects;

CREATE POLICY "Recados midia: leitura autenticada"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'recados-midia');

CREATE POLICY "Recados midia: upload admin/gestor"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'recados-midia'
  AND (
    private.has_role(auth.uid(),'admin'::public.app_role)
    OR private.has_role(auth.uid(),'gestor'::public.app_role)
  )
);

CREATE POLICY "Recados midia: delete admin/gestor"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'recados-midia'
  AND (
    private.has_role(auth.uid(),'admin'::public.app_role)
    OR private.has_role(auth.uid(),'gestor'::public.app_role)
  )
);
