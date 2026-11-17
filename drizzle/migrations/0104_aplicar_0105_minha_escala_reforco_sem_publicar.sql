-- Minha Escala: plantão extra/reforço aparece para a pessoa assim que o gestor ou a recepção lança,
-- mesmo que o mês ainda não tenha sido publicado (freelancer é chamado dia a dia).
-- Os demais status (trabalho, folga etc.) continuam só depois da publicação do mês.
CREATE OR REPLACE FUNCTION public.minha_escala_publicada(_inicio date, _fim date)
RETURNS TABLE(
  id uuid, data date, unidade text, setor text, turno text,
  hora_entrada time, hora_saida time, status text, motivo text,
  publicada_em timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id,d.data,d.unidade,d.setor,d.turno,d.hora_entrada,d.hora_saida,
         d.status,d.motivo,m.publicada_em
    FROM public.escala_dias d
    JOIN public.escala_colaboradores c ON c.id=d.colaborador_id
    JOIN public.funcionarios f ON f.id=c.funcionario_id AND f.user_id=auth.uid()
    LEFT JOIN public.escala_meses m ON m.unidade=d.unidade AND m.setor=d.setor
      AND m.competencia=date_trunc('month',d.data)::date AND m.status='publicada'
   WHERE d.data BETWEEN _inicio AND _fim
     AND (m.id IS NOT NULL OR d.status='extra')
   ORDER BY d.data,d.turno;
$$;
REVOKE ALL ON FUNCTION public.minha_escala_publicada(date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minha_escala_publicada(date,date) TO authenticated, service_role;
