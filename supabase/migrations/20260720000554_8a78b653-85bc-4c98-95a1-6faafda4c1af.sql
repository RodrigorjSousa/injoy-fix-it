
ALTER TABLE public.room_housekeeping
  ADD COLUMN IF NOT EXISTS comment_media_url text,
  ADD COLUMN IF NOT EXISTS comment_media_type text;

-- RLS policies for storage bucket housekeeping-media
CREATE POLICY "housekeeping_media_read_authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'housekeeping-media');

CREATE POLICY "housekeeping_media_insert_authenticated"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'housekeeping-media');

CREATE POLICY "housekeeping_media_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'housekeeping-media' AND owner = auth.uid());

CREATE POLICY "housekeeping_media_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'housekeeping-media' AND owner = auth.uid());
