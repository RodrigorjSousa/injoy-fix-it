DROP POLICY IF EXISTS "Read chamados by role" ON public.chamados;
CREATE POLICY "Authenticated users read all chamados"
ON public.chamados FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);