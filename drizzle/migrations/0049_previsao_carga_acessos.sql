-- Previsão de Carga: o gestor escolhe quem vê, numa lista própria (Área do Gestor › Previsão de Carga › Quem vê).
-- Regra (nesta ordem):
--   1. gestor/admin sempre vê;
--   2. se o gestor marcou a pessoa na lista, vale o que ele marcou (liberado ou bloqueado);
--   3. senão: vê quem é Recepção ou quem tem "Previsão de Carga" nas telas personalizadas de Equipe.
-- Idempotente. Sem FK para auth.users (o Lovable recusa).

CREATE TABLE IF NOT EXISTS public.previsao_carga_acessos (
  user_id uuid PRIMARY KEY,
  liberado boolean NOT NULL,
  definido_por uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.previsao_carga_acessos TO authenticated;
GRANT ALL ON public.previsao_carga_acessos TO service_role;
ALTER TABLE public.previsao_carga_acessos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestores consultam acessos da previsao" ON public.previsao_carga_acessos;
CREATE POLICY "Gestores consultam acessos da previsao" ON public.previsao_carga_acessos
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION private.pode_ver_previsao_carga(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT _uid IS NOT NULL AND (
    private.has_role(_uid, 'gestor') OR private.has_role(_uid, 'admin')
    OR coalesce(
      (SELECT a.liberado FROM public.previsao_carga_acessos a WHERE a.user_id = _uid),
      private.has_role(_uid, 'recepcao')
      OR EXISTS (
        SELECT 1 FROM public.funcionarios f
        WHERE f.user_id = _uid AND f.telas_permitidas IS NOT NULL
          AND 'previsao-carga' = ANY (f.telas_permitidas)
      )
    )
  );
$$;
REVOKE ALL ON FUNCTION private.pode_ver_previsao_carga(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.pode_ver_previsao_carga(uuid) TO authenticated, service_role;

-- Lista de todos os logins para o gestor marcar quem vê.
CREATE OR REPLACE FUNCTION public.previsao_acessos_listar()
RETURNS TABLE (user_id uuid, nome text, email text, papeis text[], gestor boolean, ve boolean, origem text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Somente gestor ou administrador escolhe quem vê a Previsão de Carga.';
  END IF;
  RETURN QUERY
  SELECT
    u.id,
    coalesce(nullif(btrim(f.nome), ''), u.email)::text,
    u.email::text,
    coalesce((SELECT array_agg(r.role::text ORDER BY r.role::text) FROM public.user_roles r WHERE r.user_id = u.id), '{}'::text[]),
    (private.has_role(u.id, 'gestor') OR private.has_role(u.id, 'admin')),
    private.pode_ver_previsao_carga(u.id),
    CASE
      WHEN private.has_role(u.id, 'gestor') OR private.has_role(u.id, 'admin') THEN 'gestor'
      WHEN a.user_id IS NOT NULL THEN CASE WHEN a.liberado THEN 'liberado' ELSE 'bloqueado' END
      WHEN private.has_role(u.id, 'recepcao') THEN 'recepcao'
      WHEN private.pode_ver_previsao_carga(u.id) THEN 'equipe'
      ELSE 'sem_acesso'
    END
  FROM auth.users u
  LEFT JOIN LATERAL (
    SELECT fx.nome FROM public.funcionarios fx WHERE fx.user_id = u.id ORDER BY fx.nome LIMIT 1
  ) f ON true
  LEFT JOIN public.previsao_carga_acessos a ON a.user_id = u.id
  WHERE EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id)
     OR EXISTS (SELECT 1 FROM public.funcionarios fx WHERE fx.user_id = u.id)
  ORDER BY 6 DESC, 2;
END;
$$;
REVOKE ALL ON FUNCTION public.previsao_acessos_listar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.previsao_acessos_listar() TO authenticated;

-- Gestor libera ou bloqueia uma pessoa. _liberado NULL = volta ao padrão (Recepção vê).
CREATE OR REPLACE FUNCTION public.previsao_definir_acesso(_user_id uuid, _liberado boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Somente gestor ou administrador escolhe quem vê a Previsão de Carga.';
  END IF;
  IF _liberado IS NULL THEN
    DELETE FROM public.previsao_carga_acessos WHERE user_id = _user_id;
  ELSE
    INSERT INTO public.previsao_carga_acessos (user_id, liberado, definido_por, updated_at)
    VALUES (_user_id, _liberado, auth.uid(), now())
    ON CONFLICT (user_id) DO UPDATE
      SET liberado = EXCLUDED.liberado, definido_por = EXCLUDED.definido_por, updated_at = now();
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.previsao_definir_acesso(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.previsao_definir_acesso(uuid, boolean) TO authenticated;
