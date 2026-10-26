-- 0083 — Lavanderia: peças que as camareiras separam para RELAVE na coleta (26/10/2026).
--
-- A camareira manda no mesmo talão peças que voltaram com mancha/sujeira para lavar de novo.
-- Elas entram na Saída Hotel do talão (a lavanderia anota junto), mas ficam marcadas em
-- lav_talao_itens.relave_hotel e NÃO são pagas no fechamento (é refazer o serviço).
--
-- Também traz (de novo) a 0046 da lavanderia, que não chegou a ser aplicada (o número 0046
-- foi usado por outra migração): catálogo completo + correção única da "Saída Lav." em branco
-- gravada como 0, dentro de public.lav_preparar() (versão 3).
-- Pode ser aplicada mais de uma vez sem problema. Depende da 0043.

ALTER TABLE public.lav_talao_itens ADD COLUMN IF NOT EXISTS relave_hotel integer NOT NULL DEFAULT 0;
ALTER TABLE public.lav_talao_itens DROP CONSTRAINT IF EXISTS lav_talao_itens_relave_hotel_check;
ALTER TABLE public.lav_talao_itens ADD CONSTRAINT lav_talao_itens_relave_hotel_check
  CHECK (relave_hotel >= 0 AND relave_hotel <= saida_hotel);

-- ------------------------------------------------- coleta com peças de relave
CREATE OR REPLACE FUNCTION public.lav_registrar_coleta(
  p_unidade text,
  p_numero text,
  p_data date,
  p_itens jsonb,
  p_foto text,
  p_obs text DEFAULT NULL,
  p_talao_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_gestor boolean := private.lav_eh_gestor(auth.uid());
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_numero text := btrim(coalesce(p_numero, ''));
  v_foto text := nullif(btrim(coalesce(p_foto, '')), '');
  v_id uuid;
  v_exist record;
  v_item jsonb;
  v_peca uuid;
  v_qtd integer;
  v_rel integer;
  v_total integer := 0;
  v_pecas uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT private.lav_pode_lancar(v_uid) THEN
    RAISE EXCEPTION 'Seu login não tem acesso à lavanderia.';
  END IF;
  IF p_unidade IS NULL OR p_unidade NOT IN ('Botafogo', 'Ipanema') THEN
    RAISE EXCEPTION 'Unidade inválida.';
  END IF;
  IF v_numero !~ '^[0-9]{1,10}$' THEN
    RAISE EXCEPTION 'Digite o número do talão (só números).';
  END IF;
  IF p_data IS NULL OR p_data > v_hoje THEN
    RAISE EXCEPTION 'Data da coleta inválida.';
  END IF;
  IF NOT v_gestor AND p_data <> v_hoje THEN
    RAISE EXCEPTION 'A coleta só pode ser lançada com a data de hoje. Para outra data, fale com o gestor.';
  END IF;
  IF p_talao_id IS NOT NULL AND NOT v_gestor THEN
    RAISE EXCEPTION 'Só o gestor pode corrigir um talão já lançado.';
  END IF;
  IF p_talao_id IS NULL AND v_foto IS NULL THEN
    RAISE EXCEPTION 'A foto do talão é obrigatória.';
  END IF;
  IF v_foto IS NOT NULL AND NOT v_gestor AND split_part(v_foto, '/', 1) <> v_uid::text THEN
    RAISE EXCEPTION 'Foto inválida. Tire a foto de novo.';
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'Lista de peças inválida.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    v_peca := (v_item->>'peca_id')::uuid;
    v_qtd := coalesce((v_item->>'qtd')::integer, 0);
    v_rel := coalesce((v_item->>'relave')::integer, 0);
    IF v_qtd < 0 OR v_rel < 0 THEN RAISE EXCEPTION 'Quantidade negativa não é permitida.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.lav_pecas WHERE id = v_peca) THEN
      RAISE EXCEPTION 'Peça não encontrada no catálogo.';
    END IF;
    IF v_peca = ANY (v_pecas) THEN RAISE EXCEPTION 'Peça repetida na lista.'; END IF;
    IF v_qtd + v_rel > 0 THEN
      v_pecas := array_append(v_pecas, v_peca);
      v_total := v_total + v_qtd + v_rel;
    END IF;
  END LOOP;
  IF v_total = 0 THEN
    RAISE EXCEPTION 'Informe a quantidade de pelo menos uma peça.';
  END IF;

  -- Número já usado nesta unidade?
  SELECT id, data_coleta, coleta_por_nome INTO v_exist
  FROM public.lav_taloes
  WHERE unidade = p_unidade AND numero = v_numero AND id IS DISTINCT FROM p_talao_id;
  IF FOUND THEN
    RAISE EXCEPTION 'O talão nº % já foi lançado em % (%, por %).', v_numero, p_unidade,
      to_char(v_exist.data_coleta, 'DD/MM/YYYY'), v_exist.coleta_por_nome;
  END IF;

  IF p_talao_id IS NULL THEN
    INSERT INTO public.lav_taloes (unidade, numero, data_coleta, coleta_por, coleta_por_nome, coleta_foto, coleta_obs)
    VALUES (p_unidade, v_numero, p_data, v_uid, private.lav_nome_usuario(v_uid), v_foto, nullif(btrim(coalesce(p_obs, '')), ''))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.lav_taloes
       SET unidade = p_unidade, numero = v_numero, data_coleta = p_data,
           coleta_foto = coalesce(v_foto, coleta_foto),
           coleta_obs = nullif(btrim(coalesce(p_obs, '')), '')
     WHERE id = p_talao_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Talão não encontrado.'; END IF;
    IF EXISTS (SELECT 1 FROM public.lav_taloes WHERE id = v_id AND retorno_data IS NOT NULL AND retorno_data < p_data) THEN
      RAISE EXCEPTION 'A data da coleta não pode ser depois da data do retorno.';
    END IF;
    -- Peças que saíram da lista: zera a saída; apaga as linhas que ficaram vazias.
    UPDATE public.lav_talao_itens SET saida_hotel = 0, relave_hotel = 0
     WHERE talao_id = v_id AND NOT (peca_id = ANY (v_pecas));
  END IF;

  -- saida_hotel = total que saiu (normal + relave); relave_hotel = parte que é relave.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    v_qtd := coalesce((v_item->>'qtd')::integer, 0);
    v_rel := coalesce((v_item->>'relave')::integer, 0);
    IF v_qtd + v_rel > 0 THEN
      INSERT INTO public.lav_talao_itens (talao_id, peca_id, saida_hotel, relave_hotel)
      VALUES (v_id, (v_item->>'peca_id')::uuid, v_qtd + v_rel, v_rel)
      ON CONFLICT (talao_id, peca_id) DO UPDATE
        SET saida_hotel = EXCLUDED.saida_hotel, relave_hotel = EXCLUDED.relave_hotel;
    END IF;
  END LOOP;

  DELETE FROM public.lav_talao_itens
   WHERE talao_id = v_id AND saida_hotel = 0
     AND coalesce(ent_lav, 0) = 0 AND coalesce(saida_lav, 0) = 0 AND coalesce(guardado, 0) = 0;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.lav_registrar_coleta(text, text, date, jsonb, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lav_registrar_coleta(text, text, date, jsonb, text, text, uuid) TO authenticated;

-- ------------------------------------------- 0046 (não aplicada antes): lav_preparar v3
CREATE TABLE IF NOT EXISTS public.lav_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  catalogo_versao integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lav_config TO authenticated;
GRANT ALL ON public.lav_config TO service_role;
ALTER TABLE public.lav_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lav_config_ler" ON public.lav_config;
CREATE POLICY "lav_config_ler" ON public.lav_config FOR SELECT TO authenticated
  USING (private.lav_pode_lancar(auth.uid()));

CREATE OR REPLACE FUNCTION public.lav_preparar()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_versao integer;
  c_versao constant integer := 3;
BEGIN
  IF NOT private.lav_pode_lancar(auth.uid()) THEN
    RAISE EXCEPTION 'Seu login não tem acesso à lavanderia.';
  END IF;
  SELECT catalogo_versao INTO v_versao FROM public.lav_config WHERE id = 1;
  v_versao := coalesce(v_versao, 0);
  IF v_versao >= c_versao THEN
    RETURN;
  END IF;

  -- versão 2: catálogo completo do talão (igual à 0045)
  IF v_versao < 2 THEN
    INSERT INTO public.lav_pecas (ordem, nome, grupo_fatura, preco) VALUES
      -- tabela de cobrança da Clean Soft (mesmas da 0043)
      (10,  'Protetor Travesseiro',      'Capa almofada / Prot. trav.',            9.46),
      (20,  'Capa de Almofada',          'Capa almofada / Prot. trav.',            9.46),
      (30,  'Pillow Top',                'Pillow top',                             55.00),
      (40,  'Cobertor / Manta',          'Cobertor / Colcha',                      10.37),
      (50,  'Edredom',                   'Edredom',                                10.37),
      (60,  'Fronha',                    'Fronha',                                 1.26),
      (70,  'Lençol Casal',              'Lençol casal / king',                    4.48),
      (80,  'Lençol King',               'Lençol casal / king',                    4.48),
      (90,  'Lençol Solteiro',           'Lençol solteiro',                        4.43),
      (100, 'Lençol Casal Elástico',     'Lençol casal elástico',                  4.68),
      (110, 'Lençol Solteiro Elástico',  'Lençol solteiro elástico',               4.64),
      (120, 'Piso',                      'Piso',                                   1.46),
      (130, 'Toalha Banho',              'Toalha banho',                           3.42),
      (140, 'Toalha Rosto',              'Toalha rosto',                           1.46),
      (150, 'Protetor Colchão Casal',    'Prot. colchão casal / saia',             6.15),
      (160, 'Protetor Colchão Solteiro', 'Prot. colchão casal / saia',             6.15),
      (170, 'Peseira',                   'Prot. colchão casal / saia',             6.15),
      (180, 'Tapete 1,50 x 2,00',        'Tapete 1,50 x 2,00',                     157.11),
      (190, 'Tapete Pequeno',            'Tapete pequeno / travesseiro / cortina', 21.68),
      (200, 'Travesseiro',               'Tapete pequeno / travesseiro / cortina', 21.68),
      (210, 'Pano de Copa',              'Pano de copa',                           1.36),
      -- demais linhas do talão (sem preço na tabela da Clean Soft)
      (142, 'Toalha com Logo',           'Outros (sem preço na tabela)',           0),
      (144, 'Roupão',                    'Outros (sem preço na tabela)',           0),
      (201, 'Capa de Sofá',              'Outros (sem preço na tabela)',           0),
      (202, 'Capa de Poltrona',          'Outros (sem preço na tabela)',           0),
      (203, 'Capa de Pranchão',          'Outros (sem preço na tabela)',           0),
      (204, 'Forro de Capa',             'Outros (sem preço na tabela)',           0),
      (205, 'Toalha de Mesa Retangular', 'Outros (sem preço na tabela)',           0),
      (206, 'Toalha de Mesa Redonda',    'Outros (sem preço na tabela)',           0),
      (207, 'Lenço de Seda',             'Outros (sem preço na tabela)',           0),
      (208, 'Guardanapo de Linho',       'Outros (sem preço na tabela)',           0),
      (209, 'Guardanapo',                'Outros (sem preço na tabela)',           0),
      (211, 'Cortina (m²)',              'Outros (sem preço na tabela)',           0),
      (212, 'Tapete (m²)',               'Outros (sem preço na tabela)',           0),
      (220, 'Pano de Chão',              'Outros (sem preço na tabela)',           0)
    ON CONFLICT (nome) DO NOTHING;
  END IF;

  -- versão 3: Saída Lav. em branco (gravada como 0) passa a valer o Contado
  IF v_versao < 3 THEN
    UPDATE public.lav_talao_itens i
       SET saida_lav = i.guardado
      FROM public.lav_taloes t
     WHERE t.id = i.talao_id
       AND t.retorno_data IS NOT NULL
       AND i.saida_lav = 0
       AND coalesce(i.guardado, 0) > 0;
  END IF;

  INSERT INTO public.lav_config (id, catalogo_versao) VALUES (1, c_versao)
  ON CONFLICT (id) DO UPDATE SET catalogo_versao = EXCLUDED.catalogo_versao, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.lav_preparar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lav_preparar() TO authenticated;