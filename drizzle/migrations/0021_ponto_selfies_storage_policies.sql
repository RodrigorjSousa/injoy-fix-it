-- 0021 — Políticas do bucket privado "ponto" (selfies das batidas).
-- PRÉ-REQUISITO: o bucket "ponto" (privado, não público) precisa existir —
-- crie pela ferramenta de armazenamento antes de aplicar esta migração.
-- Caminho dos arquivos: <auth.uid()>/<data>/<arquivo>.jpg

DROP POLICY IF EXISTS "Ponto: envio da propria selfie" ON storage.objects;
CREATE POLICY "Ponto: envio da propria selfie" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ponto' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Ponto: leitura da propria selfie" ON storage.objects;
CREATE POLICY "Ponto: leitura da propria selfie" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ponto' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Ponto: gestores leem selfies" ON storage.objects;
CREATE POLICY "Ponto: gestores leem selfies" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ponto' AND (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')));
DROP POLICY IF EXISTS "Ponto: gestores apagam selfies" ON storage.objects;
CREATE POLICY "Ponto: gestores apagam selfies" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ponto' AND (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')));
