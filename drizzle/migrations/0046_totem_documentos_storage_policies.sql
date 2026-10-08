-- 0046 — Políticas do bucket privado "documentos-hospedes" (fotos de documentos do totem).
-- PRÉ-REQUISITO: o bucket "documentos-hospedes" (PRIVADO, não público) precisa existir —
-- crie pela ferramenta de armazenamento antes de aplicar esta migração.
-- O totem grava pelo servidor (chave de serviço); aqui só liberamos a LEITURA para gestor/admin.
-- Pode ser aplicada mais de uma vez.

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
