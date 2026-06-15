
CREATE POLICY "Qualquer um pode ver fotos de manutencao"
ON storage.objects FOR SELECT
USING (bucket_id = 'fotos-manutencao');

CREATE POLICY "Qualquer um pode enviar fotos de manutencao"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'fotos-manutencao');

CREATE POLICY "Qualquer um pode atualizar fotos de manutencao"
ON storage.objects FOR UPDATE
USING (bucket_id = 'fotos-manutencao');

CREATE POLICY "Qualquer um pode deletar fotos de manutencao"
ON storage.objects FOR DELETE
USING (bucket_id = 'fotos-manutencao');
