-- 0093 — Ponto REP-P, 2ª etapa (02/11/2026): certificado A1 guardado no servidor e novo termo.
--
-- * ponto_certificado: o arquivo .pfx do e-CNPJ A1 (em base64). RLS ligada e NENHUMA política:
--   só o servidor (service_role) lê. A senha NÃO fica no banco: é o segredo CERT_A1_SENHA do
--   Lovable. O gestor envia o arquivo pelo app (função do servidor confere a senha e grava) e vê
--   só os dados públicos (titular, CNPJ, emissor, validade) por ponto_certificado_info().
-- * ponto_termo_aceites: aceite do novo termo (ponto oficial + biometria) pelo próprio
--   funcionário, por versão. Não bloqueia a marcação.
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.ponto_certificado (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  pfx_base64 text NOT NULL,
  titular text NOT NULL,
  documento text,
  emissor text,
  valido_de timestamptz NOT NULL,
  valido_ate timestamptz NOT NULL,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  enviado_por uuid
);
REVOKE ALL ON public.ponto_certificado FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ponto_certificado TO service_role;
ALTER TABLE public.ponto_certificado ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.ponto_certificado_info()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.ponto_certificado%ROWTYPE;
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Acesso restrito aos gestores';
  END IF;
  SELECT * INTO v FROM public.ponto_certificado WHERE id = 1;
  IF v.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('titular', v.titular, 'documento', v.documento, 'emissor', v.emissor,
    'valido_de', v.valido_de, 'valido_ate', v.valido_ate, 'enviado_em', v.enviado_em);
END;
$$;
REVOKE ALL ON FUNCTION public.ponto_certificado_info() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_certificado_info() TO authenticated;

-- ---------------------------------------------------------------------------
-- Termo
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ponto_termo_aceites (
  colaborador_id uuid NOT NULL REFERENCES public.escala_colaboradores(id) ON DELETE CASCADE,
  versao text NOT NULL CHECK (length(versao) BETWEEN 1 AND 40),
  texto_sha256 text NOT NULL CHECK (texto_sha256 ~ '^[0-9a-f]{64}$'),
  aceito_em timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  PRIMARY KEY (colaborador_id, versao)
);
GRANT SELECT ON public.ponto_termo_aceites TO authenticated;
GRANT ALL ON public.ponto_termo_aceites TO service_role;
ALTER TABLE public.ponto_termo_aceites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestores consultam aceites do termo" ON public.ponto_termo_aceites;
CREATE POLICY "Gestores consultam aceites do termo" ON public.ponto_termo_aceites FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Funcionario consulta os proprios aceites" ON public.ponto_termo_aceites;
CREATE POLICY "Funcionario consulta os proprios aceites" ON public.ponto_termo_aceites FOR SELECT TO authenticated
  USING (colaborador_id = private.ponto_meu_colaborador());

-- O app envia a versão e o SHA-256 do texto exibido (prova de qual texto foi aceito)
CREATE OR REPLACE FUNCTION public.ponto_aceitar_termo(_versao text, _texto_sha256 text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_colab uuid := private.ponto_colaborador_do_usuario(auth.uid());
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login'; END IF;
  IF v_colab IS NULL THEN RAISE EXCEPTION 'Seu usuário ainda não está ligado à escala. Procure o gestor.'; END IF;
  IF nullif(trim(coalesce(_versao, '')), '') IS NULL OR coalesce(_texto_sha256, '') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Termo inválido';
  END IF;
  INSERT INTO public.ponto_termo_aceites (colaborador_id, versao, texto_sha256, user_id)
  VALUES (v_colab, trim(_versao), _texto_sha256, auth.uid())
  ON CONFLICT (colaborador_id, versao) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.ponto_aceitar_termo(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_aceitar_termo(text, text) TO authenticated;

-- Situação do termo para o funcionário (registro oficial ativo? já aceitou esta versão?)
CREATE OR REPLACE FUNCTION public.ponto_meu_termo(_versao text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'oficial', private.ponto_oficial_desde() IS NOT NULL,
    'vinculado', private.ponto_colaborador_do_usuario(auth.uid()) IS NOT NULL,
    'aceito_em', (SELECT a.aceito_em FROM public.ponto_termo_aceites a
                  WHERE a.colaborador_id = private.ponto_colaborador_do_usuario(auth.uid()) AND a.versao = _versao)
  )
$$;
REVOKE ALL ON FUNCTION public.ponto_meu_termo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_meu_termo(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
