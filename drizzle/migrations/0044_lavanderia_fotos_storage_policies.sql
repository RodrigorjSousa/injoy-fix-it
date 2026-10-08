-- 0044 — Políticas do bucket privado "lavanderia" (fotos dos talões).
-- PRÉ-REQUISITO: o bucket "lavanderia" (privado, não público) precisa existir —
-- crie pela ferramenta de armazenamento antes de aplicar esta migração.
-- Depende da 0043 (funções private.lav_*).
-- Caminho dos arquivos: <auth.uid()>/<unidade>/<arquivo>.jpg

DROP POLICY IF EXISTS "Lavanderia: envio da propria foto" ON storage.objects;
CREATE POLICY "Lavanderia: envio da propria foto" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lavanderia'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND private.lav_pode_lancar(auth.uid())
  );
DROP POLICY IF EXISTS "Lavanderia: leitura da propria foto" ON storage.objects;
CREATE POLICY "Lavanderia: leitura da propria foto" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'lavanderia' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Lavanderia: gestores leem fotos" ON storage.objects;
CREATE POLICY "Lavanderia: gestores leem fotos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'lavanderia' AND private.lav_eh_gestor(auth.uid()));
DROP POLICY IF EXISTS "Lavanderia: gestores apagam fotos" ON storage.objects;
CREATE POLICY "Lavanderia: gestores apagam fotos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'lavanderia' AND private.lav_eh_gestor(auth.uid()));
