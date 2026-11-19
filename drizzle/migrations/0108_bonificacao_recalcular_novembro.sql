-- Bonificação: recalcula as avaliações de NOVEMBRO/2026 com elogio pela regra nova (0107).
-- Pedido do Rodrigo, 19/11/2026. Ex.: Vanessa, 13/11: Recepção 10, Limpeza 10, Geral 8, elogiou a Julia.
--   Antes: -20 (1 nota ruim) + 20 (elogio) = R$ 0 para cada setor.
--   Certo:  -20 para cada setor, e R$ 20 só para a Julia (comentário individual).
-- 1) Refaz o valor do setor (o gatilho calcular_registro_bonificacao recalcula sem o elogio).
-- 2) Para cada avaliação de novembro com elogio e SEM nome marcado, liga a pessoa elogiada quando a
--    observação cita o primeiro nome de UM único funcionário (sem acento, maiúscula/minúscula). Se o nome
--    não aparece ou é ambíguo, não faz nada: o gestor marca em Bonificação › Pagamento.
-- Meses anteriores não são alterados. Pode rodar de novo sem duplicar.

DO $$
DECLARE
  r record;
  v_ref uuid;
  v_ids uuid[];
  v_obs text;
BEGIN
  UPDATE public.registros_bonificacao
     SET teve_elogio = teve_elogio
   WHERE data >= DATE '2026-11-01' AND teve_elogio;

  FOR r IN
    SELECT coalesce(b.avaliacao_id, b.id) AS ref,
           min(b.data) AS data, min(b.unidade) AS unidade, min(b.nome_hospede) AS hospede,
           string_agg(DISTINCT b.observacao, ' · ') AS obs
      FROM public.registros_bonificacao b
     WHERE b.data >= DATE '2026-11-01' AND b.teve_elogio
     GROUP BY coalesce(b.avaliacao_id, b.id)
  LOOP
    v_ref := r.ref;
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.bonus_elogios e WHERE e.avaliacao_ref = v_ref);
    v_obs := lower(translate(coalesce(r.obs, ''), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
                                                  'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'));
    CONTINUE WHEN v_obs = '';
    -- primeiro nome de cada funcionário que aparece como palavra inteira na observação
    WITH primeiro AS (
      SELECT f.id,
             lower(translate(split_part(btrim(f.nome), ' ', 1),
                   'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
                   'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')) AS pn
        FROM public.funcionarios f
       WHERE length(btrim(f.nome)) > 0
    ), citados AS (
      SELECT p.pn, array_agg(p.id) AS ids
        FROM primeiro p
       WHERE length(p.pn) >= 3 AND v_obs ~ ('(^|[^a-z])' || p.pn || '([^a-z]|$)')
       GROUP BY p.pn
    )
    SELECT array_agg(c.ids[1]) INTO v_ids
      FROM citados c
     WHERE cardinality(c.ids) = 1;   -- só nome que não se repete no cadastro

    IF v_ids IS NOT NULL AND cardinality(v_ids) BETWEEN 1 AND 10 THEN
      INSERT INTO public.bonus_elogios (data, unidade, funcionario_id, avaliacao_ref, nome_hospede, comentario, created_by)
      SELECT r.data, r.unidade, x, v_ref, r.hospede, r.obs,
             coalesce((SELECT criado_por FROM public.registros_bonificacao WHERE coalesce(avaliacao_id, id) = v_ref AND criado_por IS NOT NULL LIMIT 1),
                      '00000000-0000-0000-0000-000000000000'::uuid)
        FROM unnest(v_ids) AS x
      ON CONFLICT (avaliacao_ref, funcionario_id) WHERE avaliacao_ref IS NOT NULL DO NOTHING;
    END IF;
  END LOOP;
END $$;
