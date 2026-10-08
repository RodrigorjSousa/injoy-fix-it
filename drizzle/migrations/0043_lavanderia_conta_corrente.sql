-- 0043 — Lavanderia: conta corrente de peças por talão (ROL) da Clean Soft.
--
-- Ideia: cada talão tem 4 contagens por peça, igual ao papel:
--   saida_hotel  = camareira contou antes da coleta
--   ent_lav      = lavanderia contou ao receber (vem anotado no talão)
--   saida_lav    = lavanderia anotou que devolveu
--   guardado     = camareira contou ao guardar
-- O saldo de cada peça (o que está na lavanderia) passa de um mês para o outro e
-- começa em 01/10/2026. As tabelas antigas (laundry_*) ficam intactas.
--
-- Escritas só pelas funções (RPC) abaixo, que validam permissão, foto e data.
-- Pode ser aplicada mais de uma vez sem problema. Sem INSERT de dados no arquivo:
-- o catálogo inicial é criado por public.lav_preparar(), chamada pelo app.

-- ------------------------------------------------------------------ tabelas
CREATE TABLE IF NOT EXISTS public.lav_pecas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  grupo_fatura text NOT NULL,
  preco numeric(10,2) NOT NULL DEFAULT 0 CHECK (preco >= 0),
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lav_taloes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade text NOT NULL CHECK (unidade IN ('Botafogo', 'Ipanema')),
  numero text NOT NULL CHECK (numero ~ '^[0-9]{1,10}$'),
  data_coleta date NOT NULL,
  coleta_por uuid,
  coleta_por_nome text NOT NULL,
  coleta_foto text NOT NULL,
  coleta_obs text,
  coleta_em timestamptz NOT NULL DEFAULT now(),
  retorno_data date,
  retorno_por uuid,
  retorno_por_nome text,
  retorno_foto text,
  retorno_obs text,
  retorno_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lav_taloes_unidade_numero_key UNIQUE (unidade, numero)
);
CREATE INDEX IF NOT EXISTS idx_lav_taloes_unidade_data ON public.lav_taloes (unidade, data_coleta);

CREATE TABLE IF NOT EXISTS public.lav_talao_itens (
  talao_id uuid NOT NULL REFERENCES public.lav_taloes(id) ON DELETE CASCADE,
  peca_id uuid NOT NULL REFERENCES public.lav_pecas(id) ON DELETE RESTRICT,
  saida_hotel integer NOT NULL DEFAULT 0 CHECK (saida_hotel >= 0),
  ent_lav integer CHECK (ent_lav >= 0),
  saida_lav integer CHECK (saida_lav >= 0),
  guardado integer CHECK (guardado >= 0),
  PRIMARY KEY (talao_id, peca_id)
);

CREATE TABLE IF NOT EXISTS public.lav_faturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade text NOT NULL CHECK (unidade IN ('Botafogo', 'Ipanema')),
  competencia date NOT NULL CHECK (extract(day FROM competencia) = 1),
  qtd_fatura jsonb NOT NULL DEFAULT '{}'::jsonb,
  valor_fatura numeric(12,2),
  valor_esperado numeric(12,2),
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'aprovada')),
  obs text,
  aprovado_por uuid,
  aprovado_por_nome text,
  aprovado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lav_faturas_unidade_competencia_key UNIQUE (unidade, competencia)
);

DROP TRIGGER IF EXISTS lav_pecas_updated_at ON public.lav_pecas;
CREATE TRIGGER lav_pecas_updated_at BEFORE UPDATE ON public.lav_pecas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS lav_taloes_updated_at ON public.lav_taloes;
CREATE TRIGGER lav_taloes_updated_at BEFORE UPDATE ON public.lav_taloes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS lav_faturas_updated_at ON public.lav_faturas;
CREATE TRIGGER lav_faturas_updated_at BEFORE UPDATE ON public.lav_faturas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- --------------------------------------------------------------- permissões
-- Uma única fonte: gestor/admin gerem tudo; qualquer pessoa da equipe (com papel)
-- pode lançar coleta e retorno — a foto do talão e o nome ficam registrados.
CREATE OR REPLACE FUNCTION private.lav_eh_gestor(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    private.has_role(_uid, 'gestor'::public.app_role)
    OR private.has_role(_uid, 'admin'::public.app_role)
  )
$$;

CREATE OR REPLACE FUNCTION private.lav_pode_lancar(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = _uid)
$$;

REVOKE ALL ON FUNCTION private.lav_eh_gestor(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.lav_pode_lancar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.lav_eh_gestor(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.lav_pode_lancar(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.lav_minha_permissao()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'gestor', private.lav_eh_gestor(auth.uid()),
    'pode_lancar', private.lav_pode_lancar(auth.uid())
  )
$$;
REVOKE ALL ON FUNCTION public.lav_minha_permissao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lav_minha_permissao() TO authenticated;

-- Nome de quem lançou (cadastro do funcionário, perfil ou e-mail do login).
CREATE OR REPLACE FUNCTION private.lav_nome_usuario(_uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT nullif(btrim(f.nome), '') FROM public.funcionarios f WHERE f.user_id = _uid ORDER BY f.nome LIMIT 1),
    (SELECT nullif(btrim(p.nome), '') FROM public.profiles p WHERE p.id = _uid),
    (SELECT u.email FROM auth.users u WHERE u.id = _uid),
    '—'
  )
$$;
REVOKE ALL ON FUNCTION private.lav_nome_usuario(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.lav_nome_usuario(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------- RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lav_pecas TO authenticated;
GRANT SELECT ON public.lav_taloes TO authenticated;
GRANT SELECT ON public.lav_talao_itens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lav_faturas TO authenticated;
GRANT ALL ON public.lav_pecas, public.lav_taloes, public.lav_talao_itens, public.lav_faturas TO service_role;

ALTER TABLE public.lav_pecas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lav_taloes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lav_talao_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lav_faturas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lav_pecas_ler" ON public.lav_pecas;
CREATE POLICY "lav_pecas_ler" ON public.lav_pecas FOR SELECT TO authenticated
  USING (private.lav_pode_lancar(auth.uid()));
DROP POLICY IF EXISTS "lav_pecas_gestor" ON public.lav_pecas;
CREATE POLICY "lav_pecas_gestor" ON public.lav_pecas FOR ALL TO authenticated
  USING (private.lav_eh_gestor(auth.uid())) WITH CHECK (private.lav_eh_gestor(auth.uid()));

DROP POLICY IF EXISTS "lav_taloes_ler" ON public.lav_taloes;
CREATE POLICY "lav_taloes_ler" ON public.lav_taloes FOR SELECT TO authenticated
  USING (private.lav_pode_lancar(auth.uid()));
DROP POLICY IF EXISTS "lav_talao_itens_ler" ON public.lav_talao_itens;
CREATE POLICY "lav_talao_itens_ler" ON public.lav_talao_itens FOR SELECT TO authenticated
  USING (private.lav_pode_lancar(auth.uid()));

DROP POLICY IF EXISTS "lav_faturas_gestor" ON public.lav_faturas;
CREATE POLICY "lav_faturas_gestor" ON public.lav_faturas FOR ALL TO authenticated
  USING (private.lav_eh_gestor(auth.uid())) WITH CHECK (private.lav_eh_gestor(auth.uid()));

-- ------------------------------------------------- catálogo inicial (Clean Soft)
-- Preços da planilha de cobrança da Clean Soft (agosto/2026). O gestor edita na tela.
CREATE OR REPLACE FUNCTION public.lav_preparar()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.lav_pode_lancar(auth.uid()) THEN
    RAISE EXCEPTION 'Seu login não tem acesso à lavanderia.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.lav_pecas) THEN
    RETURN;
  END IF;
  INSERT INTO public.lav_pecas (ordem, nome, grupo_fatura, preco) VALUES
    (10,  'Protetor Travesseiro',      'Capa almofada / Prot. trav.',           9.46),
    (20,  'Capa de Almofada',          'Capa almofada / Prot. trav.',           9.46),
    (30,  'Pillow Top',                'Pillow top',                            55.00),
    (40,  'Cobertor / Manta',          'Cobertor / Colcha',                     10.37),
    (50,  'Edredom',                   'Edredom',                               10.37),
    (60,  'Fronha',                    'Fronha',                                1.26),
    (70,  'Lençol Casal',              'Lençol casal / king',                   4.48),
    (80,  'Lençol King',               'Lençol casal / king',                   4.48),
    (90,  'Lençol Solteiro',           'Lençol solteiro',                       4.43),
    (100, 'Lençol Casal Elástico',     'Lençol casal elástico',                 4.68),
    (110, 'Lençol Solteiro Elástico',  'Lençol solteiro elástico',              4.64),
    (120, 'Piso',                      'Piso',                                  1.46),
    (130, 'Toalha Banho',              'Toalha banho',                          3.42),
    (140, 'Toalha Rosto',              'Toalha rosto',                          1.46),
    (150, 'Protetor Colchão Casal',    'Prot. colchão casal / saia',            6.15),
    (160, 'Protetor Colchão Solteiro', 'Prot. colchão casal / saia',            6.15),
    (170, 'Peseira',                   'Prot. colchão casal / saia',            6.15),
    (180, 'Tapete 1,50 x 2,00',        'Tapete 1,50 x 2,00',                    157.11),
    (190, 'Tapete Pequeno',            'Tapete pequeno / travesseiro / cortina', 21.68),
    (200, 'Travesseiro',               'Tapete pequeno / travesseiro / cortina', 21.68),
    (210, 'Pano de Copa',              'Pano de copa',                          1.36)
  ON CONFLICT (nome) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.lav_preparar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lav_preparar() TO authenticated;

-- ------------------------------------------------------------ coleta (1ª contagem)
-- p_itens: [{"peca_id": "...", "qtd": 10}, ...]
-- p_talao_id preenchido = correção pelo gestor (p_foto nulo mantém a foto).
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
    IF v_qtd < 0 THEN RAISE EXCEPTION 'Quantidade negativa não é permitida.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.lav_pecas WHERE id = v_peca) THEN
      RAISE EXCEPTION 'Peça não encontrada no catálogo.';
    END IF;
    IF v_peca = ANY (v_pecas) THEN RAISE EXCEPTION 'Peça repetida na lista.'; END IF;
    IF v_qtd > 0 THEN
      v_pecas := array_append(v_pecas, v_peca);
      v_total := v_total + v_qtd;
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
    UPDATE public.lav_talao_itens SET saida_hotel = 0
     WHERE talao_id = v_id AND NOT (peca_id = ANY (v_pecas));
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    v_qtd := coalesce((v_item->>'qtd')::integer, 0);
    IF v_qtd > 0 THEN
      INSERT INTO public.lav_talao_itens (talao_id, peca_id, saida_hotel)
      VALUES (v_id, (v_item->>'peca_id')::uuid, v_qtd)
      ON CONFLICT (talao_id, peca_id) DO UPDATE SET saida_hotel = EXCLUDED.saida_hotel;
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

-- ------------------------------------------------- retorno (2ª, 3ª e 4ª contagens)
-- p_itens: [{"peca_id": "...", "ent_lav": 10, "saida_lav": 16, "guardado": 16}, ...]
-- Toda peça que saiu do hotel precisa vir na lista com os três números (0 é válido).
CREATE OR REPLACE FUNCTION public.lav_registrar_retorno(
  p_talao_id uuid,
  p_data date,
  p_itens jsonb,
  p_foto text,
  p_obs text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_gestor boolean := private.lav_eh_gestor(auth.uid());
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_foto text := nullif(btrim(coalesce(p_foto, '')), '');
  v_t record;
  v_item jsonb;
  v_peca uuid;
  v_ent integer;
  v_sai integer;
  v_gua integer;
  v_pecas uuid[] := ARRAY[]::uuid[];
  v_faltando text;
BEGIN
  IF NOT private.lav_pode_lancar(v_uid) THEN
    RAISE EXCEPTION 'Seu login não tem acesso à lavanderia.';
  END IF;
  SELECT * INTO v_t FROM public.lav_taloes WHERE id = p_talao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Talão não encontrado.'; END IF;
  IF v_t.retorno_data IS NOT NULL AND NOT v_gestor THEN
    RAISE EXCEPTION 'O retorno do talão nº % já foi registrado por % em %. Para corrigir, fale com o gestor.',
      v_t.numero, v_t.retorno_por_nome, to_char(v_t.retorno_data, 'DD/MM/YYYY');
  END IF;
  IF p_data IS NULL OR p_data > v_hoje OR p_data < v_t.data_coleta THEN
    RAISE EXCEPTION 'Data do retorno inválida (não pode ser antes da coleta nem no futuro).';
  END IF;
  IF NOT v_gestor AND p_data <> v_hoje THEN
    RAISE EXCEPTION 'O retorno só pode ser lançado com a data de hoje. Para outra data, fale com o gestor.';
  END IF;
  IF v_foto IS NULL AND v_t.retorno_foto IS NULL THEN
    RAISE EXCEPTION 'A foto do talão de retorno é obrigatória.';
  END IF;
  IF v_foto IS NOT NULL AND NOT v_gestor AND split_part(v_foto, '/', 1) <> v_uid::text THEN
    RAISE EXCEPTION 'Foto inválida. Tire a foto de novo.';
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'Lista de peças inválida.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    v_peca := (v_item->>'peca_id')::uuid;
    v_ent := (v_item->>'ent_lav')::integer;
    v_sai := (v_item->>'saida_lav')::integer;
    v_gua := (v_item->>'guardado')::integer;
    IF v_ent IS NULL OR v_sai IS NULL OR v_gua IS NULL THEN
      RAISE EXCEPTION 'Preencha as três contagens de todas as peças (use 0 quando não houver).';
    END IF;
    IF v_ent < 0 OR v_sai < 0 OR v_gua < 0 THEN
      RAISE EXCEPTION 'Quantidade negativa não é permitida.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.lav_pecas WHERE id = v_peca) THEN
      RAISE EXCEPTION 'Peça não encontrada no catálogo.';
    END IF;
    IF v_peca = ANY (v_pecas) THEN RAISE EXCEPTION 'Peça repetida na lista.'; END IF;
    v_pecas := array_append(v_pecas, v_peca);
  END LOOP;

  SELECT string_agg(p.nome, ', ' ORDER BY p.ordem) INTO v_faltando
  FROM public.lav_talao_itens i JOIN public.lav_pecas p ON p.id = i.peca_id
  WHERE i.talao_id = p_talao_id AND i.saida_hotel > 0 AND NOT (i.peca_id = ANY (v_pecas));
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'Faltou preencher: %.', v_faltando;
  END IF;

  -- Correção pelo gestor: peças que saíram da lista perdem as contagens de retorno.
  UPDATE public.lav_talao_itens SET ent_lav = NULL, saida_lav = NULL, guardado = NULL
   WHERE talao_id = p_talao_id AND NOT (peca_id = ANY (v_pecas));

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    INSERT INTO public.lav_talao_itens (talao_id, peca_id, saida_hotel, ent_lav, saida_lav, guardado)
    VALUES (p_talao_id, (v_item->>'peca_id')::uuid, 0,
            (v_item->>'ent_lav')::integer, (v_item->>'saida_lav')::integer, (v_item->>'guardado')::integer)
    ON CONFLICT (talao_id, peca_id) DO UPDATE
      SET ent_lav = EXCLUDED.ent_lav, saida_lav = EXCLUDED.saida_lav, guardado = EXCLUDED.guardado;
  END LOOP;

  DELETE FROM public.lav_talao_itens
   WHERE talao_id = p_talao_id AND saida_hotel = 0
     AND coalesce(ent_lav, 0) = 0 AND coalesce(saida_lav, 0) = 0 AND coalesce(guardado, 0) = 0;

  UPDATE public.lav_taloes
     SET retorno_data = p_data,
         retorno_por = CASE WHEN retorno_data IS NULL THEN v_uid ELSE retorno_por END,
         retorno_por_nome = CASE WHEN retorno_data IS NULL THEN private.lav_nome_usuario(v_uid) ELSE retorno_por_nome END,
         retorno_foto = coalesce(v_foto, retorno_foto),
         retorno_obs = nullif(btrim(coalesce(p_obs, '')), ''),
         retorno_em = CASE WHEN retorno_data IS NULL THEN now() ELSE retorno_em END
   WHERE id = p_talao_id;
END;
$$;
REVOKE ALL ON FUNCTION public.lav_registrar_retorno(uuid, date, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lav_registrar_retorno(uuid, date, jsonb, text, text) TO authenticated;

-- ------------------------------------------------------------- gestor: desfazer
CREATE OR REPLACE FUNCTION public.lav_desfazer_retorno(p_talao_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_foto text;
BEGIN
  IF NOT private.lav_eh_gestor(auth.uid()) THEN
    RAISE EXCEPTION 'Só o gestor pode desfazer um retorno.';
  END IF;
  SELECT retorno_foto INTO v_foto FROM public.lav_taloes WHERE id = p_talao_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Talão não encontrado.'; END IF;
  DELETE FROM public.lav_talao_itens WHERE talao_id = p_talao_id AND saida_hotel = 0;
  UPDATE public.lav_talao_itens SET ent_lav = NULL, saida_lav = NULL, guardado = NULL WHERE talao_id = p_talao_id;
  UPDATE public.lav_taloes
     SET retorno_data = NULL, retorno_por = NULL, retorno_por_nome = NULL, retorno_foto = NULL,
         retorno_obs = NULL, retorno_em = NULL
   WHERE id = p_talao_id;
  RETURN v_foto;
END;
$$;
REVOKE ALL ON FUNCTION public.lav_desfazer_retorno(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lav_desfazer_retorno(uuid) TO authenticated;

-- Devolve as fotos para o app apagar do armazenamento.
CREATE OR REPLACE FUNCTION public.lav_excluir_talao(p_talao_id uuid)
RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fotos text[];
BEGIN
  IF NOT private.lav_eh_gestor(auth.uid()) THEN
    RAISE EXCEPTION 'Só o gestor pode excluir um talão.';
  END IF;
  DELETE FROM public.lav_taloes WHERE id = p_talao_id
  RETURNING array_remove(ARRAY[coleta_foto, retorno_foto], NULL) INTO v_fotos;
  IF v_fotos IS NULL THEN RAISE EXCEPTION 'Talão não encontrado.'; END IF;
  RETURN v_fotos;
END;
$$;
REVOKE ALL ON FUNCTION public.lav_excluir_talao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lav_excluir_talao(uuid) TO authenticated;

-- Aprovação da fatura grava quem aprovou (o nome vem do banco).
CREATE OR REPLACE FUNCTION public.lav_aprovar_fatura(p_fatura_id uuid, p_aprovar boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.lav_eh_gestor(auth.uid()) THEN
    RAISE EXCEPTION 'Só o gestor pode aprovar a fatura.';
  END IF;
  UPDATE public.lav_faturas
     SET status = CASE WHEN p_aprovar THEN 'aprovada' ELSE 'rascunho' END,
         aprovado_por = CASE WHEN p_aprovar THEN auth.uid() END,
         aprovado_por_nome = CASE WHEN p_aprovar THEN private.lav_nome_usuario(auth.uid()) END,
         aprovado_em = CASE WHEN p_aprovar THEN now() END
   WHERE id = p_fatura_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fatura não encontrada. Salve antes de aprovar.'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.lav_aprovar_fatura(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lav_aprovar_fatura(uuid, boolean) TO authenticated;
