
-- hotel_metrics: restrict SELECT to staff roles
DROP POLICY IF EXISTS "Authenticated users can view hotel metrics" ON public.hotel_metrics;
CREATE POLICY "Staff roles can view hotel metrics"
  ON public.hotel_metrics FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'gestor'::app_role)
    OR private.has_role(auth.uid(), 'recepcao'::app_role)
    OR private.has_role(auth.uid(), 'camareira'::app_role)
  );

-- housekeeping_tasks: restrict SELECT to staff roles
DROP POLICY IF EXISTS "Authenticated users can view housekeeping tasks" ON public.housekeeping_tasks;
CREATE POLICY "Staff roles can view housekeeping tasks"
  ON public.housekeeping_tasks FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'gestor'::app_role)
    OR private.has_role(auth.uid(), 'recepcao'::app_role)
    OR private.has_role(auth.uid(), 'camareira'::app_role)
  );

-- room_housekeeping_history: restrict SELECT and INSERT to staff roles
DROP POLICY IF EXISTS "Autenticados podem ler histórico" ON public.room_housekeeping_history;
DROP POLICY IF EXISTS "Autenticados podem inserir histórico" ON public.room_housekeeping_history;
CREATE POLICY "Staff roles can view room_housekeeping_history"
  ON public.room_housekeeping_history FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'gestor'::app_role)
    OR private.has_role(auth.uid(), 'recepcao'::app_role)
    OR private.has_role(auth.uid(), 'camareira'::app_role)
  );
CREATE POLICY "Staff roles can insert room_housekeeping_history"
  ON public.room_housekeeping_history FOR INSERT
  TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(), 'gestor'::app_role)
    OR private.has_role(auth.uid(), 'recepcao'::app_role)
    OR private.has_role(auth.uid(), 'camareira'::app_role)
  );

-- inspections bucket: replace public read with staff-only read
DROP POLICY IF EXISTS "Public read inspections" ON storage.objects;
CREATE POLICY "Staff roles can read inspections"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'inspections'
    AND (
      private.has_role(auth.uid(), 'gestor'::app_role)
      OR private.has_role(auth.uid(), 'recepcao'::app_role)
      OR private.has_role(auth.uid(), 'camareira'::app_role)
    )
  );
