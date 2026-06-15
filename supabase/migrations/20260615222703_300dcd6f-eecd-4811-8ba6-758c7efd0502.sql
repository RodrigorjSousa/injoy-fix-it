
-- Restrict storage policies for fotos-manutencao bucket to authenticated users with path-based ownership
-- Path convention: <auth.uid()>/<uuid>.<ext>

DROP POLICY IF EXISTS "Public read fotos-manutencao" ON storage.objects;
DROP POLICY IF EXISTS "Public insert fotos-manutencao" ON storage.objects;
DROP POLICY IF EXISTS "Public update fotos-manutencao" ON storage.objects;
DROP POLICY IF EXISTS "Public delete fotos-manutencao" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read fotos-manutencao" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload to fotos-manutencao" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update fotos-manutencao" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete fotos-manutencao" ON storage.objects;
DROP POLICY IF EXISTS "fotos-manutencao read" ON storage.objects;
DROP POLICY IF EXISTS "fotos-manutencao insert" ON storage.objects;
DROP POLICY IF EXISTS "fotos-manutencao update" ON storage.objects;
DROP POLICY IF EXISTS "fotos-manutencao delete" ON storage.objects;

CREATE POLICY "Authenticated users read fotos-manutencao"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'fotos-manutencao');

CREATE POLICY "Users upload own folder fotos-manutencao"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'fotos-manutencao'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users update own files fotos-manutencao"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'fotos-manutencao'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'fotos-manutencao'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users delete own files fotos-manutencao"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'fotos-manutencao'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
