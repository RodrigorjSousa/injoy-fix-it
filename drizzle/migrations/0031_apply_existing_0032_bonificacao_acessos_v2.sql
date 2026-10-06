-- Reaplicação corrigida da 0031 (a 0031 falhou: profiles não tem coluna email; agora usa auth.users.email).
-- Pode ser aplicada mais de uma vez sem problema.

-- Bonificação: acesso controlado pelo gestor (fim da regra fixa pelo nome "Mayara").
--
-- Antes, o acesso dependia de três coisas frágeis ao mesmo tempo: o papel
-- "recepcao", o cadastro em public.funcionarios estar LIGADO ao login
-- (funcionarios.user_id) e o nome conter "Mayara". Se o cadastro não estiver
-- ligado ao login, ou houver dois cadastros para a mesma pessoa, tudo falha e a
-- tela mostra "Acesso restrito aos gestores".
--
-- Agora existe uma lista única, ligada direto ao LOGIN (auth.users), que o
-- gestor edita em Bonificação › Acessos:
--   * estar na lista  = pode abrir a Bonificação e lançar avaliações
--   * pode_editar     = pode corrigir avaliações já lançadas
--   * pode_excluir    = pode apagar avaliações
-- Gestor e administrador continuam com acesso total.

CREATE TABLE IF NOT EXISTS public.bonificacao_acessos (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pode_editar boolean NOT NULL DEFAULT true,
  pode_excluir boolean NOT NULL DEFAULT false,
  liberado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.bonificacao_acessos TO authenticated;
GRANT ALL ON public.bonificacao_acessos TO service_role;
ALTER TABLE public.bonificacao_acessos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gestor e o proprio leem acessos bonif" ON public.bonificacao_acessos;
CREATE POLICY "Gestor e o proprio leem acessos bonif"
  ON public.bonificacao_acessos FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR private.has_role(auth.uid(), 'gestor'::public.app_role)
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Quem já tinha acesso continua tendo (o gestor pode retirar depois na tela).
INSERT INTO public.bonificacao_acessos (user_id)
SELECT DISTINCT u.id
FROM auth.users u
WHERE NOT (
    private.has_role(u.id, 'gestor'::public.app_role)
    OR private.has_role(u.id, 'admin'::public.app_role)
  )
  AND (
    private.has_role(u.id, 'recepcao'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.funcionarios f
      WHERE f.user_id = u.id
        AND (
          'bonificacao' = ANY (coalesce(f.telas_permitidas, '{}'::text[]))
          OR btrim(f.nome) ~* '(^|\s)mayara(\s|$)'
        )
    )
    OR coalesce(u.email, '') ~* '^mayara'
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = u.id
        AND btrim(coalesce(p.nome, '')) ~* '(^|\s)mayara(\s|$)'
    )
  )
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------- permissões
CREATE OR REPLACE FUNCTION private.bonificacao_eh_gestor(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    private.has_role(_uid, 'gestor'::public.app_role)
    OR private.has_role(_uid, 'admin'::public.app_role)
  )
$$;

CREATE OR REPLACE FUNCTION private.pode_registrar_bonificacao(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    private.bonificacao_eh_gestor(_uid)
    OR EXISTS (SELECT 1 FROM public.bonificacao_acessos a WHERE a.user_id = _uid)
  )
$$;

CREATE OR REPLACE FUNCTION private.pode_editar_bonificacao(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    private.bonificacao_eh_gestor(_uid)
    OR EXISTS (SELECT 1 FROM public.bonificacao_acessos a WHERE a.user_id = _uid AND a.pode_editar)
  )
$$;

CREATE OR REPLACE FUNCTION private.pode_excluir_bonificacao(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    private.bonificacao_eh_gestor(_uid)
    OR EXISTS (SELECT 1 FROM public.bonificacao_acessos a WHERE a.user_id = _uid AND a.pode_excluir)
  )
$$;

REVOKE ALL ON FUNCTION private.bonificacao_eh_gestor(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.pode_registrar_bonificacao(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.pode_editar_bonificacao(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.pode_excluir_bonificacao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.bonificacao_eh_gestor(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.pode_registrar_bonificacao(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.pode_editar_bonificacao(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.pode_excluir_bonificacao(uuid) TO authenticated, service_role;

-- O app pergunta ao banco "o que eu posso fazer?" — uma única fonte da verdade.
CREATE OR REPLACE FUNCTION public.minha_permissao_bonificacao()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'gestor', private.bonificacao_eh_gestor(auth.uid()),
    'pode_registrar', private.pode_registrar_bonificacao(auth.uid()),
    'pode_editar', private.pode_editar_bonificacao(auth.uid()),
    'pode_excluir', private.pode_excluir_bonificacao(auth.uid())
  )
$$;
REVOKE ALL ON FUNCTION public.minha_permissao_bonificacao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minha_permissao_bonificacao() TO authenticated;

-- Lista de todos os logins para o gestor marcar quem acessa.
CREATE OR REPLACE FUNCTION public.bonificacao_acessos_listar()
RETURNS TABLE (
  user_id uuid, nome text, email text, papeis text[],
  gestor boolean, liberado boolean, pode_editar boolean, pode_excluir boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.bonificacao_eh_gestor(auth.uid()) THEN
    RAISE EXCEPTION 'Somente gestor ou administrador gerencia os acessos da Bonificação.';
  END IF;
  RETURN QUERY
  SELECT
    p.id,
    coalesce(nullif(btrim(f.nome), ''), nullif(btrim(p.nome), ''), u.email)::text,
    u.email::text,
    coalesce((SELECT array_agg(r.role::text ORDER BY r.role::text) FROM public.user_roles r WHERE r.user_id = p.id), '{}'::text[]),
    private.bonificacao_eh_gestor(p.id),
    a.user_id IS NOT NULL,
    coalesce(a.pode_editar, false),
    coalesce(a.pode_excluir, false)
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN LATERAL (
    SELECT fx.nome FROM public.funcionarios fx WHERE fx.user_id = p.id ORDER BY fx.nome LIMIT 1
  ) f ON true
  LEFT JOIN public.bonificacao_acessos a ON a.user_id = p.id
  WHERE coalesce(p.nome, '') <> 'Inativo'
  ORDER BY (a.user_id IS NOT NULL) DESC, 2;
END $$;
REVOKE ALL ON FUNCTION public.bonificacao_acessos_listar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bonificacao_acessos_listar() TO authenticated;

CREATE OR REPLACE FUNCTION public.bonificacao_definir_acesso(
  _user_id uuid, _liberado boolean, _pode_editar boolean, _pode_excluir boolean
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.bonificacao_eh_gestor(auth.uid()) THEN
    RAISE EXCEPTION 'Somente gestor ou administrador gerencia os acessos da Bonificação.';
  END IF;
  IF _user_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _user_id) THEN
    RAISE EXCEPTION 'Usuário não encontrado.';
  END IF;
  IF coalesce(_liberado, false) THEN
    INSERT INTO public.bonificacao_acessos (user_id, pode_editar, pode_excluir, liberado_por)
    VALUES (_user_id, coalesce(_pode_editar, true), coalesce(_pode_excluir, false), auth.uid())
    ON CONFLICT (user_id) DO UPDATE
      SET pode_editar = EXCLUDED.pode_editar,
          pode_excluir = EXCLUDED.pode_excluir,
          liberado_por = EXCLUDED.liberado_por,
          updated_at = now();
  ELSE
    DELETE FROM public.bonificacao_acessos WHERE user_id = _user_id;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.bonificacao_definir_acesso(uuid, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bonificacao_definir_acesso(uuid, boolean, boolean, boolean) TO authenticated;

-- ------------------------------------------------- registrar / editar / excluir
CREATE OR REPLACE FUNCTION public.registrar_bonificacao_conjunta(_data date, _nome_hospede text, _nota_funcionarios numeric, _nota_limpeza numeric, _nota_geral numeric, _observacao text, _teve_elogio boolean, _unidade text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_avaliacao uuid := gen_random_uuid();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão expirada. Entre novamente.'; END IF;
  IF NOT private.pode_registrar_bonificacao(auth.uid()) THEN
    RAISE EXCEPTION 'Seu login não está liberado para lançar avaliações. Peça ao gestor para liberar em Bonificação › Acessos.';
  END IF;
  IF _unidade NOT IN ('Botafogo', 'Ipanema') OR _data IS NULL OR length(btrim(coalesce(_nome_hospede, ''))) = 0 OR length(_nome_hospede) > 120 THEN
    RAISE EXCEPTION 'Unidade, data ou nome do hóspede inválido.';
  END IF;
  IF _nota_funcionarios IS NULL OR _nota_limpeza IS NULL OR _nota_geral IS NULL
    OR _nota_funcionarios NOT BETWEEN 0 AND 10 OR _nota_limpeza NOT BETWEEN 0 AND 10 OR _nota_geral NOT BETWEEN 0 AND 10 THEN
    RAISE EXCEPTION 'Informe as três notas entre 0 e 10.';
  END IF;
  INSERT INTO public.registros_bonificacao (data, nome_hospede, nota_funcionarios, nota_limpeza, nota_geral, observacao, teve_elogio, unidade, setor, criado_por, avaliacao_id)
  VALUES (_data, btrim(_nome_hospede), _nota_funcionarios, NULL, _nota_geral, nullif(btrim(_observacao), ''), coalesce(_teve_elogio, false), _unidade, 'recepcao', auth.uid(), v_avaliacao);
  INSERT INTO public.registros_bonificacao (data, nome_hospede, nota_funcionarios, nota_limpeza, nota_geral, observacao, teve_elogio, unidade, setor, criado_por, avaliacao_id)
  VALUES (_data, btrim(_nome_hospede), _nota_limpeza, _nota_limpeza, _nota_geral, nullif(btrim(_observacao), ''), coalesce(_teve_elogio, false), _unidade, 'camareiras', auth.uid(), v_avaliacao);
END; $function$;
REVOKE ALL ON FUNCTION public.registrar_bonificacao_conjunta(date, text, numeric, numeric, numeric, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_bonificacao_conjunta(date, text, numeric, numeric, numeric, text, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.editar_bonificacao_conjunta(_registro_id uuid, _data date, _nome_hospede text, _nota_funcionarios numeric, _nota_limpeza numeric, _nota_geral numeric, _observacao_recepcao text, _observacao_limpeza text, _teve_elogio boolean, _unidade text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_original public.registros_bonificacao%ROWTYPE; v_grupo uuid; v_recepcao_id uuid; v_limpeza_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão expirada. Entre novamente.'; END IF;
  IF NOT private.pode_editar_bonificacao(auth.uid()) THEN
    RAISE EXCEPTION 'Seu login não está liberado para editar avaliações. Peça ao gestor para liberar em Bonificação › Acessos.';
  END IF;
  IF _unidade NOT IN ('Botafogo', 'Ipanema') OR _data IS NULL OR length(btrim(coalesce(_nome_hospede, ''))) = 0 OR length(_nome_hospede) > 120
    OR length(coalesce(_observacao_recepcao, '')) > 500 OR length(coalesce(_observacao_limpeza, '')) > 500 THEN
    RAISE EXCEPTION 'Dados da avaliação inválidos.';
  END IF;
  IF _nota_funcionarios IS NULL OR _nota_limpeza IS NULL OR _nota_geral IS NULL
    OR _nota_funcionarios NOT BETWEEN 0 AND 10 OR _nota_limpeza NOT BETWEEN 0 AND 10 OR _nota_geral NOT BETWEEN 0 AND 10 THEN
    RAISE EXCEPTION 'Informe as três notas entre 0 e 10.';
  END IF;
  SELECT * INTO v_original FROM public.registros_bonificacao WHERE id = _registro_id FOR UPDATE;
  IF NOT FOUND OR v_original.unidade <> _unidade THEN RAISE EXCEPTION 'Avaliação não encontrada nesta unidade.'; END IF;
  v_grupo := coalesce(v_original.avaliacao_id, gen_random_uuid());
  PERFORM 1 FROM public.registros_bonificacao WHERE avaliacao_id = v_grupo ORDER BY id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.registros_bonificacao WHERE avaliacao_id = v_grupo AND unidade <> _unidade) THEN
    RAISE EXCEPTION 'Avaliação inconsistente entre unidades.';
  END IF;
  SELECT id INTO v_recepcao_id FROM public.registros_bonificacao WHERE avaliacao_id = v_grupo AND setor = 'recepcao' LIMIT 1;
  SELECT id INTO v_limpeza_id FROM public.registros_bonificacao WHERE avaliacao_id = v_grupo AND setor = 'camareiras' LIMIT 1;
  IF v_original.setor = 'recepcao' THEN v_recepcao_id := v_original.id; ELSE v_limpeza_id := v_original.id; END IF;
  IF (SELECT count(*) FROM public.registros_bonificacao WHERE avaliacao_id = v_grupo) > 2 THEN RAISE EXCEPTION 'Grupo de avaliação inconsistente.'; END IF;
  IF v_recepcao_id IS NULL THEN
    INSERT INTO public.registros_bonificacao (data, nome_hospede, nota_funcionarios, nota_geral, observacao, teve_elogio, unidade, setor, criado_por, avaliacao_id)
    VALUES (_data, btrim(_nome_hospede), _nota_funcionarios, _nota_geral, nullif(btrim(_observacao_recepcao), ''), coalesce(_teve_elogio, false), _unidade, 'recepcao', auth.uid(), v_grupo);
  ELSE
    UPDATE public.registros_bonificacao SET data = _data, nome_hospede = btrim(_nome_hospede), nota_funcionarios = _nota_funcionarios, nota_geral = _nota_geral, observacao = nullif(btrim(_observacao_recepcao), ''), teve_elogio = coalesce(_teve_elogio, false), avaliacao_id = v_grupo
    WHERE id = v_recepcao_id AND unidade = _unidade;
  END IF;
  IF v_limpeza_id IS NULL THEN
    INSERT INTO public.registros_bonificacao (data, nome_hospede, nota_funcionarios, nota_limpeza, nota_geral, observacao, teve_elogio, unidade, setor, criado_por, avaliacao_id)
    VALUES (_data, btrim(_nome_hospede), _nota_limpeza, _nota_limpeza, _nota_geral, nullif(btrim(_observacao_limpeza), ''), coalesce(_teve_elogio, false), _unidade, 'camareiras', auth.uid(), v_grupo);
  ELSE
    UPDATE public.registros_bonificacao SET data = _data, nome_hospede = btrim(_nome_hospede), nota_limpeza = _nota_limpeza, nota_geral = _nota_geral, observacao = nullif(btrim(_observacao_limpeza), ''), teve_elogio = coalesce(_teve_elogio, false), avaliacao_id = v_grupo
    WHERE id = v_limpeza_id AND unidade = _unidade;
  END IF;
END; $function$;
REVOKE ALL ON FUNCTION public.editar_bonificacao_conjunta(uuid, date, text, numeric, numeric, numeric, text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_bonificacao_conjunta(uuid, date, text, numeric, numeric, numeric, text, text, boolean, text) TO authenticated;

DROP POLICY IF EXISTS "Admin gestor delete registros bonif" ON public.registros_bonificacao;
DROP POLICY IF EXISTS "Autorizados excluem registros bonif" ON public.registros_bonificacao;
CREATE POLICY "Autorizados excluem registros bonif"
  ON public.registros_bonificacao FOR DELETE
  TO authenticated
  USING (private.pode_excluir_bonificacao(auth.uid()));

-- Regras de cálculo: leitura liberada a todos os logins (o resumo aparece para todos).
DROP POLICY IF EXISTS "Autorizados leem config bonificacao" ON public.config_bonificacao;
DROP POLICY IF EXISTS "Authenticated read config bonificacao" ON public.config_bonificacao;
CREATE POLICY "Authenticated read config bonificacao"
  ON public.config_bonificacao FOR SELECT
  TO authenticated
  USING (true);
GRANT SELECT ON public.config_bonificacao TO authenticated;
