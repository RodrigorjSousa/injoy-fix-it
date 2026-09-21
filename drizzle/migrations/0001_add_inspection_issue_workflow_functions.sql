CREATE OR REPLACE FUNCTION public.open_room_inspection_issue(
  _property text,
  _room_number text,
  _team text,
  _description text,
  _category text DEFAULT NULL,
  _responsible_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_opened_by_name text;
  v_responsible_name text;
  v_chamado_id uuid;
  v_recado_id uuid;
  v_issue_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF NOT (
    private.has_role(v_user_id, 'recepcao'::app_role)
    OR private.has_role(v_user_id, 'gestor'::app_role)
    OR private.has_role(v_user_id, 'admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para abrir pendência de vistoria';
  END IF;
  IF _property NOT IN ('Botafogo', 'Ipanema') OR length(btrim(_room_number)) = 0 THEN
    RAISE EXCEPTION 'Unidade ou quarto inválido';
  END IF;
  IF _team NOT IN ('camareira', 'manutencao') OR length(btrim(_description)) < 4 THEN
    RAISE EXCEPTION 'Equipe ou descrição inválida';
  END IF;

  SELECT COALESCE(p.nome, 'Recepção') INTO v_opened_by_name
  FROM public.profiles p WHERE p.id = v_user_id;
  v_opened_by_name := COALESCE(v_opened_by_name, 'Recepção');

  IF _team = 'camareira' THEN
    v_responsible_name := 'Camareiras';
    INSERT INTO public.recados_camareiras (
      property, room_number, message, created_by, created_by_name, direction
    ) VALUES (
      _property,
      btrim(_room_number),
      '[PENDÊNCIA DE VISTORIA] ' || btrim(_description),
      v_user_id,
      v_opened_by_name,
      'to_camareira'
    ) RETURNING id INTO v_recado_id;
  ELSE
    IF _category IS NULL OR _responsible_id IS NULL THEN
      RAISE EXCEPTION 'Categoria e técnico são obrigatórios';
    END IF;
    SELECT f.nome INTO v_responsible_name
    FROM public.funcionarios f
    WHERE f.id = _responsible_id
      AND EXISTS (
        SELECT 1 FROM unnest(COALESCE(f.categorias, ARRAY[]::text[])) c
        WHERE lower(btrim(c)) = lower(btrim(_category))
      );
    IF v_responsible_name IS NULL THEN
      RAISE EXCEPTION 'Técnico inválido para esta categoria';
    END IF;
    INSERT INTO public.chamados (
      unidade, categoria, descricao, status, responsavel_id, criado_por, midias
    ) VALUES (
      _property::public.unidade,
      _category,
      '[URGENTE] [VISTORIA QUARTO ' || btrim(_room_number) || '] ' || btrim(_description),
      'Aberto'::public.chamado_status,
      _responsible_id,
      v_user_id,
      '[]'::jsonb
    ) RETURNING id INTO v_chamado_id;
  END IF;

  INSERT INTO public.room_inspection_issues (
    property, room_number, team, description, responsible_id, responsible_name,
    chamado_id, recado_id, opened_by, opened_by_name
  ) VALUES (
    _property, btrim(_room_number), _team, btrim(_description), _responsible_id,
    v_responsible_name, v_chamado_id, v_recado_id, v_user_id, v_opened_by_name
  ) RETURNING id INTO v_issue_id;

  RETURN v_issue_id;
END;
$$;

REVOKE ALL ON FUNCTION public.open_room_inspection_issue(text, text, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_room_inspection_issue(text, text, text, text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.open_room_inspection_issue(text, text, text, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_room_inspection_issue(_issue_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_resolved_by_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF NOT (
    private.has_role(v_user_id, 'recepcao'::app_role)
    OR private.has_role(v_user_id, 'gestor'::app_role)
    OR private.has_role(v_user_id, 'admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para resolver pendência de vistoria';
  END IF;

  SELECT COALESCE(p.nome, 'Recepção') INTO v_resolved_by_name
  FROM public.profiles p WHERE p.id = v_user_id;

  UPDATE public.room_inspection_issues
  SET status = 'resolved',
      resolved_by = v_user_id,
      resolved_by_name = COALESCE(v_resolved_by_name, 'Recepção'),
      resolved_at = now()
  WHERE id = _issue_id AND status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pendência não encontrada ou já resolvida';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_room_inspection_issue(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_room_inspection_issue(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_room_inspection_issue(uuid) TO authenticated;