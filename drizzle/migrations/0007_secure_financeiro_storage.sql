CREATE POLICY "Gestores visualizam arquivos financeiros" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'financeiro' AND (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role)));
CREATE POLICY "Gestores enviam arquivos financeiros" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'financeiro' AND (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role)));
CREATE POLICY "Gestores atualizam arquivos financeiros" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'financeiro' AND (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role)));
CREATE POLICY "Gestores removem arquivos financeiros" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'financeiro' AND (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role)));