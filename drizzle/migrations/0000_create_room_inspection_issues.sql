CREATE TABLE public.room_inspection_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property text NOT NULL CHECK (property IN ('Botafogo', 'Ipanema')),
  room_number text NOT NULL,
  team text NOT NULL CHECK (team IN ('camareira', 'manutencao')),
  description text NOT NULL CHECK (length(btrim(description)) >= 4),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  responsible_id uuid,
  responsible_name text NOT NULL,
  chamado_id uuid REFERENCES public.chamados(id) ON DELETE SET NULL,
  recado_id uuid REFERENCES public.recados_camareiras(id) ON DELETE SET NULL,
  opened_by uuid NOT NULL,
  opened_by_name text NOT NULL,
  resolved_by uuid,
  resolved_by_name text,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.room_inspection_issues TO authenticated;
GRANT ALL ON public.room_inspection_issues TO service_role;

ALTER TABLE public.room_inspection_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipe pode visualizar pendencias de vistoria"
ON public.room_inspection_issues
FOR SELECT
TO authenticated
USING (private.is_staff(auth.uid()));

CREATE POLICY "Recepcao e gestao podem abrir pendencias de vistoria"
ON public.room_inspection_issues
FOR INSERT
TO authenticated
WITH CHECK (
  opened_by = auth.uid()
  AND (
    private.has_role(auth.uid(), 'recepcao'::app_role)
    OR private.has_role(auth.uid(), 'gestor'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
  )
);

CREATE POLICY "Recepcao e gestao podem resolver pendencias de vistoria"
ON public.room_inspection_issues
FOR UPDATE
TO authenticated
USING (
  private.has_role(auth.uid(), 'recepcao'::app_role)
  OR private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  private.has_role(auth.uid(), 'recepcao'::app_role)
  OR private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
);

CREATE TRIGGER update_room_inspection_issues_updated_at
BEFORE UPDATE ON public.room_inspection_issues
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX room_inspection_issues_room_status_idx
ON public.room_inspection_issues (property, room_number, status, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.room_inspection_issues;