
CREATE OR REPLACE FUNCTION public.get_my_incoming_shift(_unidade text)
RETURNS TABLE (
  id uuid,
  unidade text,
  funcionario_saida text,
  funcionario_entrada text,
  caixa_status text,
  caixa_obs text,
  estoque_status text,
  estoque_obs text,
  gastos_detalhes text,
  maquina_bebidas text,
  observacoes text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT
      lower(trim(COALESCE(p.nome, ''))) AS profile_nome,
      lower(trim(COALESCE(f.nome, ''))) AS func_nome
    FROM public.profiles p
    LEFT JOIN public.funcionarios f ON f.user_id = p.id
    WHERE p.id = auth.uid()
  )
  SELECT t.id, t.unidade, t.funcionario_saida, t.funcionario_entrada,
         t.caixa_status, t.caixa_obs, t.estoque_status, t.estoque_obs,
         t.gastos_detalhes, t.maquina_bebidas, t.observacoes, t.created_at
  FROM public.trocas_turno t, me
  WHERE t.unidade = _unidade
    AND t.created_at > now() - interval '1 hour'
    AND (
      (me.profile_nome <> '' AND lower(t.funcionario_entrada) LIKE '%' || me.profile_nome || '%')
      OR (me.func_nome <> '' AND lower(t.funcionario_entrada) LIKE '%' || me.func_nome || '%')
      OR (me.profile_nome <> '' AND split_part(me.profile_nome, ' ', 1) <> ''
          AND lower(t.funcionario_entrada) LIKE '%' || split_part(me.profile_nome, ' ', 1) || '%')
    )
  ORDER BY t.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_incoming_shift(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_incoming_shift(text) TO authenticated;
