-- 0026 — Bonificação: libera o registro de avaliações para quem tem a tela liberada.
--
-- Problema: a tela Bonificação abre para a Mayara (liberação por nome no app e pela
-- lista de telas em EQUIPE), mas a função registrar_bonificacao_conjunta rodava com
-- as permissões do usuário e a regra do banco só aceitava INSERT de quem tem o papel
-- gestor, admin ou recepcao. Sem esse papel, o banco recusava ("row-level security").
--
-- Agora a mesma regra vale no app e no banco: pode registrar quem é gestor/admin,
-- quem tem o papel recepcao, quem tem a tela "bonificacao" liberada em EQUIPE, ou a
-- Mayara (regra já usada no app). Editar e excluir continuam só com gestor/admin.

CREATE OR REPLACE FUNCTION private.pode_registrar_bonificacao(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _uid IS NOT NULL AND (
    private.has_role(_uid, 'gestor'::public.app_role)
    OR private.has_role(_uid, 'admin'::public.app_role)
    OR private.has_role(_uid, 'recepcao'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.funcionarios f
      WHERE f.user_id = _uid
        AND (
          'bonificacao' = ANY (coalesce(f.telas_permitidas, '{}'::text[]))
          OR btrim(f.nome) ~* '(^|\s)mayara(\s|$)'
        )
    )
  )
$$;
REVOKE ALL ON FUNCTION private.pode_registrar_bonificacao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.pode_registrar_bonificacao(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.registrar_bonificacao_conjunta(_data date, _nome_hospede text, _nota_funcionarios numeric, _nota_limpeza numeric, _nota_geral numeric, _observacao text, _teve_elogio boolean, _unidade text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_avaliacao uuid := gen_random_uuid();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão expirada. Entre novamente.'; END IF;
  IF NOT private.pode_registrar_bonificacao(auth.uid()) THEN
    RAISE EXCEPTION 'Seu usuário não tem permissão para registrar avaliações de bonificação. Peça ao gestor para liberar a tela Bonificação.';
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

-- Mesma regra na inserção direta (mantém coerência com a função)
DROP POLICY IF EXISTS "Recepcao gestor admin insert registros bonif" ON public.registros_bonificacao;
DROP POLICY IF EXISTS "Autorizados inserem registros bonif" ON public.registros_bonificacao;
CREATE POLICY "Autorizados inserem registros bonif"
  ON public.registros_bonificacao FOR INSERT
  TO authenticated
  WITH CHECK (private.pode_registrar_bonificacao(auth.uid()));
