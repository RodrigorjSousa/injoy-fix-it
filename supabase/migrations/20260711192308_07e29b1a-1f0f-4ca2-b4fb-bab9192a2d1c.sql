
CREATE TABLE IF NOT EXISTS public.room_inspections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property TEXT NOT NULL,
  room_number TEXT NOT NULL,
  inspector_name TEXT,
  inspector_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  checklist JSONB NOT NULL,
  photo_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.room_inspections TO authenticated;
GRANT ALL ON public.room_inspections TO service_role;

ALTER TABLE public.room_inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read inspections"
  ON public.room_inspections FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'gestor'::app_role)
    OR private.has_role(auth.uid(), 'recepcao'::app_role)
    OR private.has_role(auth.uid(), 'camareira'::app_role)
  );

CREATE POLICY "Staff can insert inspections"
  ON public.room_inspections FOR INSERT TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(), 'gestor'::app_role)
    OR private.has_role(auth.uid(), 'recepcao'::app_role)
    OR private.has_role(auth.uid(), 'camareira'::app_role)
  );

CREATE INDEX IF NOT EXISTS room_inspections_property_room_idx
  ON public.room_inspections (property, room_number, created_at DESC);

-- Storage policies for 'inspections' bucket
CREATE POLICY "Public read inspections"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'inspections');

CREATE POLICY "Authenticated upload inspections"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'inspections');
