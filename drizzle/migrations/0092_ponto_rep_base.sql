-- 0092 — Ponto: base legal do REP-P, 1ª etapa (02/11/2026). Portaria MTP 671/2021, Anexo IX.
--
-- * escala_colaboradores.cpf: CPF de cada pessoa (obrigatório na marcação oficial). Só gestores
--   leem a tabela. Copiado de funcionarios.cpf quando o gestor ativa o registro oficial.
-- * ponto_empregador: CNPJ, razão social, CNO/CAEPF, nº de registro no INPI (quando houver) e
--   o momento em que o registro oficial foi ativado (oficial_desde).
-- * ponto_rep_registros: a ARP (Área de Registro Permanente) do REP-P. Registros tipo 2
--   (empregador), 5 (inclusão/alteração/exclusão de empregado), 6 (eventos sensíveis) e 7
--   (marcação), com NSR em sequência única do estabelecimento (mesmo CNPJ nas duas unidades) e,
--   no tipo 7, hash SHA-256 encadeado ao hash da marcação anterior. NUNCA é alterada nem apagada:
--   gatilhos recusam UPDATE, DELETE e TRUNCATE, inclusive pelo painel do Lovable.
--   As batidas em tempo real (app/recepção) viram tipo 7 automaticamente depois da ativação.
--   Lançamento manual, pedido aprovado e revisão são TRATAMENTO (ponto_batidas), não marcação.
-- * Modo oficial (após ativar): o ponto não bloqueia mais a marcação (art. 74). Fora do raio,
--   sem localização, ordem estranha ou batida repetida viram pendência para o gestor.
-- * ponto_revisar: recusar exige motivo. ponto_hora_servidor: relógio da tela.
-- * ponto_meus_comprovantes: comprovantes do próprio funcionário (últimos 7 dias).
-- Idempotente. Depende da 0080 (private.ponto_local e ponto_endereco_unidade).

-- ---------------------------------------------------------------------------
-- CPF
-- ---------------------------------------------------------------------------
ALTER TABLE public.escala_colaboradores ADD COLUMN IF NOT EXISTS cpf text;

CREATE OR REPLACE FUNCTION private.ponto_cpf_valido(_cpf text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  d int[];
  s int;
  dv1 int;
  dv2 int;
BEGIN
  IF _cpf IS NULL OR _cpf !~ '^\d{11}$' OR _cpf ~ '^(\d)\1{10}$' THEN RETURN false; END IF;
  SELECT array_agg(substr(_cpf, i, 1)::int ORDER BY i) INTO d FROM generate_series(1, 11) AS i;
  s := 0; FOR i IN 1..9 LOOP s := s + d[i] * (11 - i); END LOOP;
  dv1 := CASE WHEN s % 11 < 2 THEN 0 ELSE 11 - s % 11 END;
  s := 0; FOR i IN 1..10 LOOP s := s + d[i] * (12 - i); END LOOP;
  dv2 := CASE WHEN s % 11 < 2 THEN 0 ELSE 11 - s % 11 END;
  RETURN d[10] = dv1 AND d[11] = dv2;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'escala_colaboradores_cpf_valido') THEN
    ALTER TABLE public.escala_colaboradores
      ADD CONSTRAINT escala_colaboradores_cpf_valido CHECK (cpf IS NULL OR private.ponto_cpf_valido(cpf));
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION private.ponto_cpf_da_pessoa(_colaborador_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(c.cpf, nullif(regexp_replace(coalesce(f.cpf, ''), '\D', '', 'g'), ''))
  FROM public.escala_colaboradores c
  LEFT JOIN public.funcionarios f ON f.id = c.funcionario_id
  WHERE c.id = _colaborador_id
$$;
REVOKE ALL ON FUNCTION private.ponto_cpf_da_pessoa(uuid) FROM PUBLIC, anon, authenticated;

-- CPF de quem está logado (responsável por alterações); zeros se não houver
CREATE OR REPLACE FUNCTION private.ponto_cpf_responsavel()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT nullif(regexp_replace(coalesce(f.cpf, ''), '\D', '', 'g'), '')
     FROM public.funcionarios f WHERE f.user_id = auth.uid() ORDER BY f.nome LIMIT 1),
    '00000000000')
$$;
REVOKE ALL ON FUNCTION private.ponto_cpf_responsavel() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Empregador
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ponto_empregador (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  tipo_doc smallint NOT NULL DEFAULT 1 CHECK (tipo_doc IN (1, 2)),
  documento text NOT NULL CHECK (documento ~ '^(\d{11}|\d{14})$'),
  cno_caepf text CHECK (cno_caepf IS NULL OR cno_caepf ~ '^\d{1,14}$'),
  razao_social text NOT NULL CHECK (length(trim(razao_social)) BETWEEN 2 AND 150),
  inpi_registro text CHECK (inpi_registro IS NULL OR inpi_registro ~ '^\d{1,17}$'),
  desenvolvedor_documento text CHECK (desenvolvedor_documento IS NULL OR desenvolvedor_documento ~ '^(\d{11}|\d{14})$'),
  oficial_desde timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.ponto_empregador TO authenticated;
GRANT ALL ON public.ponto_empregador TO service_role;
ALTER TABLE public.ponto_empregador ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestores consultam empregador do ponto" ON public.ponto_empregador;
CREATE POLICY "Gestores consultam empregador do ponto" ON public.ponto_empregador FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION private.ponto_oficial_desde()
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT oficial_desde FROM public.ponto_empregador WHERE id = 1
$$;
REVOKE ALL ON FUNCTION private.ponto_oficial_desde() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- ARP: registros permanentes com NSR
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ponto_rep_nsr (
  estabelecimento smallint PRIMARY KEY,
  ultimo bigint NOT NULL DEFAULT 0 CHECK (ultimo >= 0)
);
GRANT ALL ON public.ponto_rep_nsr TO service_role;
ALTER TABLE public.ponto_rep_nsr ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.ponto_rep_registros (
  nsr bigint PRIMARY KEY CHECK (nsr > 0),
  tipo smallint NOT NULL CHECK (tipo IN (2, 4, 5, 6, 7)),
  gravado_em timestamptz NOT NULL DEFAULT now(),
  -- tipo 7 (marcação)
  marcacao_em timestamptz,
  cpf text,
  coletor text CHECK (coletor IS NULL OR coletor IN ('01', '02', '03', '04', '05')),
  offline boolean,
  hash text,
  batida_id uuid,
  colaborador_id uuid,
  unidade text,
  -- tipo 5 (empregado)
  operacao text CHECK (operacao IS NULL OR operacao IN ('I', 'A', 'E')),
  nome text,
  outros_dados text,
  -- tipos 2 e 5
  responsavel_cpf text,
  -- tipo 2 (empregador)
  tipo_doc smallint,
  documento text,
  cno_caepf text,
  razao_social text,
  local_prestacao text,
  -- tipo 6 (evento sensível)
  evento_codigo text,
  CHECK (tipo <> 7 OR (marcacao_em IS NOT NULL AND cpf IS NOT NULL AND coletor IS NOT NULL AND hash ~ '^[0-9a-f]{64}$')),
  CHECK (tipo <> 5 OR (operacao IS NOT NULL AND cpf IS NOT NULL AND nome IS NOT NULL)),
  CHECK (tipo <> 2 OR (documento IS NOT NULL AND razao_social IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ponto_rep_registros_gravado_idx ON public.ponto_rep_registros (gravado_em);
CREATE INDEX IF NOT EXISTS ponto_rep_registros_colab_idx ON public.ponto_rep_registros (colaborador_id, marcacao_em);
CREATE UNIQUE INDEX IF NOT EXISTS ponto_rep_registros_batida_uq ON public.ponto_rep_registros (batida_id) WHERE batida_id IS NOT NULL;
GRANT SELECT ON public.ponto_rep_registros TO authenticated;
GRANT ALL ON public.ponto_rep_registros TO service_role;
ALTER TABLE public.ponto_rep_registros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestores consultam registros do REP" ON public.ponto_rep_registros;
CREATE POLICY "Gestores consultam registros do REP" ON public.ponto_rep_registros FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));

-- Imutável: nenhum UPDATE, DELETE ou TRUNCATE
CREATE OR REPLACE FUNCTION private.tg_ponto_rep_imutavel()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Registro permanente do ponto (Portaria 671): não pode ser alterado nem apagado';
END;
$$;
DROP TRIGGER IF EXISTS tr_ponto_rep_imutavel ON public.ponto_rep_registros;
CREATE TRIGGER tr_ponto_rep_imutavel BEFORE UPDATE OR DELETE ON public.ponto_rep_registros
  FOR EACH ROW EXECUTE FUNCTION private.tg_ponto_rep_imutavel();
DROP TRIGGER IF EXISTS tr_ponto_rep_imutavel_truncate ON public.ponto_rep_registros;
CREATE TRIGGER tr_ponto_rep_imutavel_truncate BEFORE TRUNCATE ON public.ponto_rep_registros
  FOR EACH STATEMENT EXECUTE FUNCTION private.tg_ponto_rep_imutavel();
DROP TRIGGER IF EXISTS tr_ponto_rep_nsr_imutavel ON public.ponto_rep_nsr;
CREATE TRIGGER tr_ponto_rep_nsr_imutavel BEFORE DELETE ON public.ponto_rep_nsr
  FOR EACH ROW EXECUTE FUNCTION private.tg_ponto_rep_imutavel();
DROP TRIGGER IF EXISTS tr_ponto_rep_nsr_imutavel_truncate ON public.ponto_rep_nsr;
CREATE TRIGGER tr_ponto_rep_nsr_imutavel_truncate BEFORE TRUNCATE ON public.ponto_rep_nsr
  FOR EACH STATEMENT EXECUTE FUNCTION private.tg_ponto_rep_imutavel();

-- Próximo NSR (trava a linha até o fim da transação: sequência sem buracos e hash em ordem)
CREATE OR REPLACE FUNCTION private.ponto_rep_proximo_nsr()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v bigint;
BEGIN
  INSERT INTO public.ponto_rep_nsr (estabelecimento, ultimo) VALUES (1, 0) ON CONFLICT DO NOTHING;
  UPDATE public.ponto_rep_nsr SET ultimo = ultimo + 1 WHERE estabelecimento = 1 RETURNING ultimo INTO v;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION private.ponto_rep_proximo_nsr() FROM PUBLIC, anon, authenticated;

-- Data e hora no formato do AFD (AAAA-MM-ddThh:mm:00-0300)
CREATE OR REPLACE FUNCTION private.ponto_afd_dh(_t timestamptz)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT to_char(_t AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI') || ':00-0300'
$$;

-- Marcação (tipo 7). Hash = SHA-256 (hex minúsculo) de NSR + tipo + data/hora da marcação + CPF +
-- data/hora da gravação + coletor + on-line/off-line + hash da marcação anterior (se houver).
CREATE OR REPLACE FUNCTION private.ponto_rep_marcar(
  _batida_id uuid, _colaborador_id uuid, _marcacao_em timestamptz, _unidade text,
  _coletor text DEFAULT '02', _offline boolean DEFAULT false
)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_nsr bigint;
  v_cpf text := lpad(coalesce(private.ponto_cpf_da_pessoa(_colaborador_id), ''), 12, '0');
  v_gravado timestamptz := now();
  v_anterior text;
  v_hash text;
BEGIN
  v_nsr := private.ponto_rep_proximo_nsr();
  SELECT r.hash INTO v_anterior FROM public.ponto_rep_registros r
  WHERE r.tipo = 7 ORDER BY r.nsr DESC LIMIT 1;
  v_hash := encode(sha256(convert_to(
    lpad(v_nsr::text, 9, '0') || '7' || private.ponto_afd_dh(_marcacao_em) || v_cpf
    || private.ponto_afd_dh(v_gravado) || _coletor || CASE WHEN _offline THEN '1' ELSE '0' END
    || coalesce(v_anterior, ''), 'UTF8')), 'hex');
  INSERT INTO public.ponto_rep_registros (nsr, tipo, gravado_em, marcacao_em, cpf, coletor, offline, hash,
    batida_id, colaborador_id, unidade)
  VALUES (v_nsr, 7, v_gravado, _marcacao_em, v_cpf, _coletor, _offline, v_hash,
    _batida_id, _colaborador_id, _unidade);
  RETURN v_nsr;
END;
$$;
REVOKE ALL ON FUNCTION private.ponto_rep_marcar(uuid, uuid, timestamptz, text, text, boolean) FROM PUBLIC, anon, authenticated;

-- Empregado (tipo 5)
CREATE OR REPLACE FUNCTION private.ponto_rep_empregado(_operacao text, _cpf text, _nome text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nsr bigint;
BEGIN
  v_nsr := private.ponto_rep_proximo_nsr();
  INSERT INTO public.ponto_rep_registros (nsr, tipo, operacao, cpf, nome, responsavel_cpf)
  VALUES (v_nsr, 5, _operacao, lpad(_cpf, 12, '0'), left(trim(_nome), 52), private.ponto_cpf_responsavel());
  RETURN v_nsr;
END;
$$;
REVOKE ALL ON FUNCTION private.ponto_rep_empregado(text, text, text) FROM PUBLIC, anon, authenticated;

-- Empregador (tipo 2): um registro por local de prestação (Botafogo e Ipanema)
CREATE OR REPLACE FUNCTION private.ponto_rep_empregador()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emp public.ponto_empregador%ROWTYPE;
  r record;
  v_qtd integer := 0;
BEGIN
  SELECT * INTO v_emp FROM public.ponto_empregador WHERE id = 1;
  IF v_emp.id IS NULL THEN RETURN 0; END IF;
  FOR r IN SELECT e.unidade, e.endereco FROM private.ponto_endereco_unidade() e ORDER BY e.unidade LOOP
    INSERT INTO public.ponto_rep_registros (nsr, tipo, responsavel_cpf, tipo_doc, documento, cno_caepf, razao_social, local_prestacao, unidade)
    VALUES (private.ponto_rep_proximo_nsr(), 2, private.ponto_cpf_responsavel(), v_emp.tipo_doc, v_emp.documento,
            v_emp.cno_caepf, left(v_emp.razao_social, 150), left(r.endereco, 100), r.unidade);
    v_qtd := v_qtd + 1;
  END LOOP;
  RETURN v_qtd;
END;
$$;
REVOKE ALL ON FUNCTION private.ponto_rep_empregador() FROM PUBLIC, anon, authenticated;

-- Batida em tempo real → marcação oficial (depois da ativação)
CREATE OR REPLACE FUNCTION private.tg_ponto_batida_rep()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_desde timestamptz := private.ponto_oficial_desde();
BEGIN
  IF v_desde IS NOT NULL AND NEW.origem IN ('app', 'quiosque') AND NEW.registrado_em >= v_desde THEN
    PERFORM private.ponto_rep_marcar(NEW.id, NEW.colaborador_id, NEW.registrado_em, NEW.unidade, '02', false);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tr_ponto_batida_rep ON public.ponto_batidas;
CREATE TRIGGER tr_ponto_batida_rep AFTER INSERT ON public.ponto_batidas
  FOR EACH ROW EXECUTE FUNCTION private.tg_ponto_batida_rep();

-- Pessoa incluída, alterada ou retirada → tipo 5 (depois da ativação; só com CPF)
CREATE OR REPLACE FUNCTION private.tg_ponto_colaborador_rep()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_novo boolean;
  v_velho boolean;
BEGIN
  IF private.ponto_oficial_desde() IS NULL THEN RETURN NEW; END IF;
  v_novo := NEW.ativo AND NEW.ponto_habilitado AND NEW.cpf IS NOT NULL;
  IF TG_OP = 'INSERT' THEN
    IF v_novo THEN PERFORM private.ponto_rep_empregado('I', NEW.cpf, NEW.nome); END IF;
    RETURN NEW;
  END IF;
  v_velho := OLD.ativo AND OLD.ponto_habilitado AND OLD.cpf IS NOT NULL;
  IF v_novo AND NOT v_velho THEN
    PERFORM private.ponto_rep_empregado('I', NEW.cpf, NEW.nome);
  ELSIF v_velho AND NOT v_novo THEN
    PERFORM private.ponto_rep_empregado('E', OLD.cpf, OLD.nome);
  ELSIF v_novo AND (NEW.cpf IS DISTINCT FROM OLD.cpf OR NEW.nome IS DISTINCT FROM OLD.nome) THEN
    PERFORM private.ponto_rep_empregado('A', NEW.cpf, NEW.nome);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tr_ponto_colaborador_rep ON public.escala_colaboradores;
CREATE TRIGGER tr_ponto_colaborador_rep AFTER INSERT OR UPDATE ON public.escala_colaboradores
  FOR EACH ROW EXECUTE FUNCTION private.tg_ponto_colaborador_rep();

-- ---------------------------------------------------------------------------
-- Funções do gestor
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ponto_salvar_empregador(
  _tipo_doc smallint, _documento text, _razao_social text, _cno_caepf text DEFAULT NULL,
  _inpi_registro text DEFAULT NULL, _desenvolvedor_documento text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doc text := regexp_replace(coalesce(_documento, ''), '\D', '', 'g');
  v_cno text := nullif(regexp_replace(coalesce(_cno_caepf, ''), '\D', '', 'g'), '');
  v_inpi text := nullif(regexp_replace(coalesce(_inpi_registro, ''), '\D', '', 'g'), '');
  v_dev text := nullif(regexp_replace(coalesce(_desenvolvedor_documento, ''), '\D', '', 'g'), '');
  v_antes public.ponto_empregador%ROWTYPE;
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Acesso restrito aos gestores';
  END IF;
  IF coalesce(_tipo_doc, 1) = 1 AND length(v_doc) <> 14 THEN RAISE EXCEPTION 'CNPJ deve ter 14 dígitos'; END IF;
  IF _tipo_doc = 2 AND NOT private.ponto_cpf_valido(v_doc) THEN RAISE EXCEPTION 'CPF do empregador inválido'; END IF;
  IF nullif(trim(coalesce(_razao_social, '')), '') IS NULL THEN RAISE EXCEPTION 'Informe a razão social'; END IF;
  SELECT * INTO v_antes FROM public.ponto_empregador WHERE id = 1;
  INSERT INTO public.ponto_empregador (id, tipo_doc, documento, cno_caepf, razao_social, inpi_registro,
    desenvolvedor_documento, updated_by)
  VALUES (1, coalesce(_tipo_doc, 1), v_doc, v_cno, trim(_razao_social), v_inpi, v_dev, auth.uid())
  ON CONFLICT (id) DO UPDATE SET
    tipo_doc = EXCLUDED.tipo_doc, documento = EXCLUDED.documento, cno_caepf = EXCLUDED.cno_caepf,
    razao_social = EXCLUDED.razao_social, inpi_registro = EXCLUDED.inpi_registro,
    desenvolvedor_documento = EXCLUDED.desenvolvedor_documento, updated_at = now(), updated_by = auth.uid();
  -- Depois da ativação, mudança nos dados do empregador gera novo registro tipo 2
  IF v_antes.oficial_desde IS NOT NULL AND (v_antes.documento, v_antes.razao_social, v_antes.cno_caepf, v_antes.tipo_doc)
     IS DISTINCT FROM (v_doc, trim(_razao_social), v_cno, coalesce(_tipo_doc, 1)::smallint) THEN
    PERFORM private.ponto_rep_empregador();
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.ponto_salvar_empregador(smallint, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_salvar_empregador(smallint, text, text, text, text, text) TO authenticated;

-- Ativa o registro oficial: copia CPFs de funcionarios, grava empregador (tipo 2) e as pessoas
-- habilitadas com CPF (tipo 5 'I'). Daí em diante as batidas em tempo real viram tipo 7.
CREATE OR REPLACE FUNCTION public.ponto_rep_ativar()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emp public.ponto_empregador%ROWTYPE;
  r record;
  v_pessoas integer := 0;
  v_sem_cpf jsonb;
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Acesso restrito aos gestores';
  END IF;
  SELECT * INTO v_emp FROM public.ponto_empregador WHERE id = 1 FOR UPDATE;
  IF v_emp.id IS NULL THEN RAISE EXCEPTION 'Salve antes os dados do empregador (CNPJ e razão social)'; END IF;
  IF v_emp.oficial_desde IS NOT NULL THEN RAISE EXCEPTION 'O registro oficial já está ativo desde %',
    to_char(v_emp.oficial_desde AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'); END IF;

  UPDATE public.escala_colaboradores c
  SET cpf = regexp_replace(f.cpf, '\D', '', 'g')
  FROM public.funcionarios f
  WHERE f.id = c.funcionario_id AND c.cpf IS NULL
    AND private.ponto_cpf_valido(regexp_replace(coalesce(f.cpf, ''), '\D', '', 'g'));

  PERFORM private.ponto_rep_empregador();
  FOR r IN SELECT c.cpf, c.nome FROM public.escala_colaboradores c
           WHERE c.ativo AND c.ponto_habilitado AND c.cpf IS NOT NULL ORDER BY c.nome LOOP
    PERFORM private.ponto_rep_empregado('I', r.cpf, r.nome);
    v_pessoas := v_pessoas + 1;
  END LOOP;

  UPDATE public.ponto_empregador SET oficial_desde = now(), updated_at = now(), updated_by = auth.uid() WHERE id = 1;

  SELECT coalesce(jsonb_agg(c.nome ORDER BY c.nome), '[]'::jsonb) INTO v_sem_cpf
  FROM public.escala_colaboradores c WHERE c.ativo AND c.ponto_habilitado AND c.cpf IS NULL;
  RETURN jsonb_build_object('pessoas', v_pessoas, 'sem_cpf', v_sem_cpf);
END;
$$;
REVOKE ALL ON FUNCTION public.ponto_rep_ativar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_rep_ativar() TO authenticated;

-- Recusar batida exige motivo (a batida original fica guardada; recusa é tratamento)
CREATE OR REPLACE FUNCTION public.ponto_revisar(_batida_id uuid, _aprovar boolean, _observacao text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Acesso restrito aos gestores';
  END IF;
  IF NOT _aprovar AND nullif(trim(coalesce(_observacao, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo da recusa';
  END IF;
  UPDATE public.ponto_batidas
  SET status = CASE WHEN _aprovar THEN 'aprovada' ELSE 'recusada' END,
      revisado_por = auth.uid(), revisado_em = now(),
      observacao = nullif(trim(coalesce(_observacao, '')), '')
  WHERE id = _batida_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batida não encontrada'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.ponto_revisar(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_revisar(uuid, boolean, text) TO authenticated;

-- Hora do servidor (relógio com segundos na tela)
CREATE OR REPLACE FUNCTION public.ponto_hora_servidor()
RETURNS timestamptz LANGUAGE sql STABLE AS $$ SELECT now() $$;
REVOKE ALL ON FUNCTION public.ponto_hora_servidor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_hora_servidor() TO authenticated;

-- Comprovantes do próprio funcionário (últimos 7 dias; a Portaria exige ao menos 48 h)
CREATE OR REPLACE FUNCTION public.ponto_meus_comprovantes()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_colab uuid := private.ponto_colaborador_do_usuario(auth.uid());
  v_emp public.ponto_empregador%ROWTYPE;
BEGIN
  IF v_colab IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT * INTO v_emp FROM public.ponto_empregador WHERE id = 1;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'nsr', r.nsr, 'marcacao_em', r.marcacao_em, 'gravado_em', r.gravado_em, 'cpf', r.cpf,
      'hash', r.hash, 'unidade', r.unidade, 'nome', c.nome,
      'local', (SELECT e.endereco FROM private.ponto_endereco_unidade() e WHERE e.unidade = r.unidade),
      'empregador', v_emp.razao_social, 'tipo_doc', v_emp.tipo_doc, 'documento', v_emp.documento,
      'cno_caepf', v_emp.cno_caepf, 'inpi', v_emp.inpi_registro
    ) ORDER BY r.nsr DESC)
    FROM public.ponto_rep_registros r
    JOIN public.escala_colaboradores c ON c.id = r.colaborador_id
    WHERE r.tipo = 7 AND r.colaborador_id = v_colab AND r.marcacao_em > now() - interval '7 days'
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.ponto_meus_comprovantes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_meus_comprovantes() TO authenticated;

-- ---------------------------------------------------------------------------
-- Registrar batida (mesma assinatura da 0080). Antes da ativação: igual à 0080 (bloqueia fora
-- do raio). Depois da ativação (modo oficial): nunca bloqueia; inconsistências viram pendência.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ponto_registrar(
  _descritor jsonb,
  _latitude numeric,
  _longitude numeric,
  _precisao_m numeric,
  _vivacidade_ok boolean,
  _device_id text,
  _selfie_path text,
  _modo text DEFAULT 'app',
  _colaborador_id uuid DEFAULT NULL,
  _tipo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_oficial boolean := private.ponto_oficial_desde() IS NOT NULL;
  v_colab public.escala_colaboradores%ROWTYPE;
  v_bio public.ponto_biometria%ROWTYPE;
  v_cfg public.ponto_config%ROWTYPE;
  v_local jsonb;
  v_local_ok boolean;
  v_unidade text;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_jornada record;
  v_permitidos text[];
  v_ultima timestamptz;
  v_tipo text;
  v_data_ref date;
  v_dist numeric;
  v_face numeric;
  v_face_ok boolean;
  v_device_ok boolean;
  v_motivos text[] := '{}';
  v_status text;
  v_id uuid;
  v_rep record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Faça login para bater o ponto'; END IF;
  IF _modo NOT IN ('app', 'quiosque') THEN RAISE EXCEPTION 'Modo inválido'; END IF;

  IF _modo = 'app' THEN
    SELECT * INTO v_colab FROM public.escala_colaboradores WHERE id = private.ponto_colaborador_do_usuario(v_uid);
    IF v_colab.id IS NULL THEN
      RAISE EXCEPTION 'Seu usuário ainda não está ligado à escala. Procure o gestor.';
    END IF;
    IF NOT v_colab.ponto_habilitado THEN
      IF NOT v_oficial THEN
        RAISE EXCEPTION 'Você não está habilitado para o ponto do app. Procure o gestor.';
      END IF;
      v_motivos := array_append(v_motivos, 'nao_habilitado');
    END IF;
  ELSE
    IF NOT (private.has_role(v_uid, 'recepcao') OR private.has_role(v_uid, 'gestor') OR private.has_role(v_uid, 'admin')) THEN
      RAISE EXCEPTION 'Somente a recepção ou o gestor podem usar o ponto da recepção';
    END IF;
    SELECT * INTO v_colab FROM public.escala_colaboradores WHERE id = _colaborador_id AND ativo AND ponto_habilitado;
    IF v_colab.id IS NULL THEN RAISE EXCEPTION 'Pessoa não encontrada ou não habilitada para o ponto'; END IF;
  END IF;

  IF _selfie_path IS NOT NULL AND split_part(_selfie_path, '/', 1) <> v_uid::text THEN
    RAISE EXCEPTION 'Caminho da selfie inválido';
  END IF;

  -- Local: a até raio_m de uma das unidades
  v_local := private.ponto_local(_latitude, _longitude, _precisao_m);
  v_local_ok := coalesce((v_local->>'permitido')::boolean, false);
  IF NOT v_local_ok THEN
    IF NOT v_oficial THEN RAISE EXCEPTION '%', v_local->>'mensagem'; END IF;
    v_motivos := array_append(v_motivos, coalesce(v_local->>'motivo', 'fora_da_unidade'));
  END IF;
  v_dist := (v_local->>'distancia_m')::numeric;

  -- Batida repetida (toque duplo)
  SELECT max(registrado_em) INTO v_ultima FROM public.ponto_batidas
  WHERE colaborador_id = v_colab.id AND status <> 'recusada';
  IF v_ultima IS NOT NULL AND now() - v_ultima < interval '2 minutes' THEN
    IF NOT v_oficial THEN RAISE EXCEPTION 'Batida já registrada há instantes'; END IF;
    v_motivos := array_append(v_motivos, 'batida_repetida');
  END IF;

  -- Jornada aberta (entrada nas últimas 18 h ainda sem saída final)
  SELECT * INTO v_jornada FROM private.ponto_jornada_aberta(v_colab.id);
  v_permitidos := private.ponto_proximos_tipos(v_jornada.ultimo_tipo);
  v_tipo := coalesce(_tipo, v_permitidos[1]);
  IF v_tipo NOT IN ('entrada', 'saida_almoco', 'volta_almoco', 'saida') THEN RAISE EXCEPTION 'Tipo de batida inválido'; END IF;
  IF NOT (v_tipo = ANY (v_permitidos)) THEN
    IF NOT v_oficial THEN
      RAISE EXCEPTION 'Agora não é possível registrar "%". Opções: %', v_tipo, array_to_string(v_permitidos, ', ');
    END IF;
    v_motivos := array_append(v_motivos, 'ordem_inconsistente');
  END IF;

  IF v_jornada.entrada_id IS NOT NULL AND v_tipo <> 'entrada' THEN
    v_data_ref := v_jornada.data_ref; v_unidade := v_jornada.unidade;
  ELSE
    v_data_ref := v_hoje;
    v_unidade := coalesce(v_local->>'unidade',
      CASE WHEN v_colab.unidade IN ('Botafogo', 'Ipanema') THEN v_colab.unidade ELSE 'Botafogo' END);
  END IF;

  SELECT * INTO v_cfg FROM public.ponto_config WHERE unidade = v_unidade;

  -- Rosto (1:1)
  SELECT * INTO v_bio FROM public.ponto_biometria WHERE colaborador_id = v_colab.id;
  IF v_bio.colaborador_id IS NULL THEN
    v_face_ok := false; v_motivos := array_append(v_motivos, 'sem_cadastro_facial');
  ELSIF _descritor IS NULL OR NOT private.ponto_descritor_valido(_descritor) THEN
    v_face_ok := false; v_motivos := array_append(v_motivos, 'rosto_nao_detectado');
  ELSE
    v_face := round(private.ponto_face_distancia(_descritor, v_bio.descritores), 4);
    v_face_ok := v_face IS NOT NULL AND v_face <= coalesce(v_cfg.limiar_face, 0.5);
    IF NOT v_face_ok THEN v_motivos := array_append(v_motivos, 'rosto_nao_confere'); END IF;
  END IF;

  -- Aparelho (só no modo app). Sem aparelho vinculado: vincula este no primeiro uso.
  IF _modo = 'app' THEN
    IF v_bio.colaborador_id IS NOT NULL AND v_bio.device_id IS NULL AND nullif(_device_id, '') IS NOT NULL
       AND _device_id <> 'sem-armazenamento' THEN
      UPDATE public.ponto_biometria SET device_id = _device_id WHERE colaborador_id = v_colab.id;
      v_bio.device_id := _device_id;
    END IF;
    v_device_ok := v_bio.device_id IS NULL OR v_bio.device_id = _device_id;
    IF NOT v_device_ok THEN v_motivos := array_append(v_motivos, 'aparelho_diferente'); END IF;
  END IF;

  v_status := CASE WHEN cardinality(v_motivos) = 0 THEN 'valida' ELSE 'pendente' END;

  INSERT INTO public.ponto_batidas (
    colaborador_id, unidade, tipo, data_ref, origem, latitude, longitude, precisao_m,
    distancia_m, dentro_raio, face_distancia, face_ok, vivacidade_ok, device_id, device_ok,
    selfie_path, status, motivos, registrado_por
  ) VALUES (
    v_colab.id, v_unidade, v_tipo, v_data_ref, CASE WHEN _modo = 'app' THEN 'app' ELSE 'quiosque' END,
    _latitude, _longitude, _precisao_m, v_dist, v_local_ok, v_face, v_face_ok, coalesce(_vivacidade_ok, false),
    _device_id, v_device_ok, _selfie_path, v_status, v_motivos, v_uid
  ) RETURNING id INTO v_id;

  IF v_status = 'pendente' THEN
    PERFORM private.enqueue_push_notification('ponto_pendente', jsonb_build_object(
      'id', v_id, 'nome', v_colab.nome, 'tipo', v_tipo, 'unidade', v_unidade, 'motivos', to_jsonb(v_motivos)
    ));
  END IF;

  SELECT r.nsr, r.hash INTO v_rep FROM public.ponto_rep_registros r WHERE r.batida_id = v_id;

  RETURN jsonb_build_object(
    'id', v_id, 'tipo', v_tipo, 'status', v_status, 'motivos', to_jsonb(v_motivos),
    'registrado_em', now(), 'unidade', v_unidade, 'nome', v_colab.nome,
    'nsr', v_rep.nsr, 'hash', v_rep.hash
  );
END;
$$;
REVOKE ALL ON FUNCTION public.ponto_registrar(jsonb, numeric, numeric, numeric, boolean, text, text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_registrar(jsonb, numeric, numeric, numeric, boolean, text, text, text, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
