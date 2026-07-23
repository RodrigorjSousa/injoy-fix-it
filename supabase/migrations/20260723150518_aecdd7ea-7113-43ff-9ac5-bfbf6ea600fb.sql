DROP POLICY IF EXISTS "Gestor recepcao camareira create chamados" ON public.chamados;

CREATE POLICY "Authenticated users create chamados"
ON public.chamados
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND criado_por = auth.uid());