
-- Add direction column to distinguish messages recepcao->camareira and camareira->recepcao
ALTER TABLE public.recados_camareiras
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'to_camareira'
  CHECK (direction IN ('to_camareira','to_recepcao'));

-- Allow camareiras to also insert recados (to recepção)
DROP POLICY IF EXISTS "Staff cria recados" ON public.recados_camareiras;
CREATE POLICY "Staff cria recados"
ON public.recados_camareiras
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid() AND (
    private.has_role(auth.uid(), 'gestor'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'funcionario'::app_role)
    OR private.has_role(auth.uid(), 'camareira'::app_role)
  )
);
