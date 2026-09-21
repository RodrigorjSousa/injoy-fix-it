REVOKE INSERT, UPDATE, DELETE ON public.room_inspection_issues FROM authenticated;

DROP POLICY IF EXISTS "Recepcao e gestao podem abrir pendencias de vistoria" ON public.room_inspection_issues;
DROP POLICY IF EXISTS "Recepcao e gestao podem resolver pendencias de vistoria" ON public.room_inspection_issues;

COMMENT ON TABLE public.room_inspection_issues IS 'Pendências encontradas durante vistorias; criação e resolução somente pelas funções autenticadas do fluxo de vistoria.';