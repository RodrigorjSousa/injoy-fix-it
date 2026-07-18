
DROP FUNCTION IF EXISTS public.get_my_incoming_shift(text);

DROP POLICY IF EXISTS "tt_select" ON public.trocas_turno;
CREATE POLICY "tt_select"
  ON public.trocas_turno FOR SELECT
  TO authenticated
  USING (
    funcionario_saida_user_id = auth.uid()
    OR private.has_role(auth.uid(), 'gestor'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR (
      created_at > now() - interval '1 hour'
      AND EXISTS (
        SELECT 1
        FROM public.profiles p
        LEFT JOIN public.funcionarios f ON f.user_id = p.id
        WHERE p.id = auth.uid()
          AND (
            (COALESCE(p.nome, '') <> '' AND lower(trocas_turno.funcionario_entrada) LIKE '%' || lower(trim(p.nome)) || '%')
            OR (COALESCE(f.nome, '') <> '' AND lower(trocas_turno.funcionario_entrada) LIKE '%' || lower(trim(f.nome)) || '%')
            OR (COALESCE(p.nome, '') <> '' AND lower(trocas_turno.funcionario_entrada) LIKE '%' || lower(split_part(trim(p.nome), ' ', 1)) || '%')
          )
      )
    )
  );
