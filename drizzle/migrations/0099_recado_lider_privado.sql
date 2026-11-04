-- Recado da líder das camareiras é PRIVADO: só a camareira envolvida (quem arrumou o quarto), a própria líder
-- e o gestor/admin veem. No card aparece "Recado da Gleidiane" / "Recado da Maria" (nome de quem mandou).
--  - Pendência de vistoria aberta pela líder → recado privado para a camareira do quarto.
--  - Avaliação da arrumação com "Refazer" → recado privado com o que refazer (push só para ela).
--  - Pendência resolvida → o recado sai do card.
-- Recados da Recepção continuam como antes. Idempotente.

ALTER TABLE public.recados_camareiras
  ADD COLUMN IF NOT EXISTS privado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS destinatarios uuid[],
  ADD COLUMN IF NOT EXISTS destinatario_nome text;

DROP POLICY IF EXISTS "Staff ve recados" ON public.recados_camareiras;
CREATE POLICY "Staff ve recados" ON public.recados_camareiras
FOR SELECT TO authenticated
USING (
  (
    NOT privado AND (
      private.has_role(auth.uid(), 'gestor'::app_role)
      OR private.has_role(auth.uid(), 'admin'::app_role)
      OR private.has_role(auth.uid(), 'recepcao'::app_role)
      OR private.has_role(auth.uid(), 'camareira'::app_role)
      OR private.has_role(auth.uid(), 'funcionario'::app_role)
      OR private.eh_lider_camareiras(auth.uid())
    )
  )
  OR (
    privado AND (
      created_by = auth.uid()
      OR auth.uid() = ANY (coalesce(destinatarios, '{}'::uuid[]))
      OR private.has_role(auth.uid(), 'gestor'::app_role)
      OR private.has_role(auth.uid(), 'admin'::app_role)
    )
  )
);

-- Camareira do quarto: quem fez o último serviço (24 h); senão quem está designada no quarto agora.
CREATE OR REPLACE FUNCTION private.camareira_do_quarto(_property text, _room_number text)
RETURNS TABLE (nome text, user_ids uuid[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nome text;
BEGIN
  SELECT nullif(btrim(x.camareira_name), '') INTO v_nome
  FROM public.room_housekeeping_history x
  WHERE x.property = _property AND x.room_number = _room_number AND x.created_at > now() - interval '24 hours'
  ORDER BY x.created_at DESC LIMIT 1;
  IF v_nome IS NULL THEN
    SELECT nullif(btrim(h.assigned_camareira), '') INTO v_nome
    FROM public.room_housekeeping h
    WHERE h.property = _property AND h.room_number = _room_number
    LIMIT 1;
  END IF;
  RETURN QUERY
  SELECT v_nome,
         (SELECT array_agg(DISTINCT f.user_id) FROM public.funcionarios f
          WHERE v_nome IS NOT NULL AND f.user_id IS NOT NULL AND lower(btrim(f.nome)) = lower(v_nome));
END $$;
REVOKE ALL ON FUNCTION private.camareira_do_quarto(text, text) FROM PUBLIC, anon, authenticated;

-- Push do recado: privado vai só para os destinatários.
CREATE OR REPLACE FUNCTION private.tg_recados_push()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM private.enqueue_push_notification('recado_camareira', jsonb_build_object(
    'id', NEW.id, 'property', NEW.property, 'room_number', NEW.room_number,
    'message', NEW.message, 'direction', NEW.direction, 'created_by_name', NEW.created_by_name,
    'privado', NEW.privado, 'destinatarios', to_jsonb(coalesce(NEW.destinatarios, '{}'::uuid[]))
  ));
  RETURN NEW;
END $$;

-- Avaliação com "Refazer": recado privado para a camareira (o push sai pelo recado).
CREATE OR REPLACE FUNCTION private.tg_avaliacao_arrumacao_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_users uuid[];
  v_txt text;
BEGIN
  IF NOT NEW.refazer THEN RETURN NEW; END IF;
  SELECT array_agg(DISTINCT f.user_id) INTO v_users
  FROM public.funcionarios f
  WHERE f.user_id IS NOT NULL AND lower(btrim(f.nome)) = lower(btrim(NEW.camareira_nome));
  SELECT string_agg(
           (CASE WHEN i->>'status' = 'refazer' THEN 'REFAZER ' ELSE 'AJUSTAR ' END) || (i->>'nome')
           || coalesce(': ' || nullif(i->>'obs', ''), ''), ' · ')
    INTO v_txt
  FROM jsonb_array_elements(coalesce(NEW.itens, '[]'::jsonb)) i
  WHERE i->>'status' IN ('refazer', 'ajustar');
  INSERT INTO public.recados_camareiras (
    property, room_number, message, created_by, created_by_name, direction,
    privado, destinatarios, destinatario_nome
  ) VALUES (
    NEW.property, NEW.room_number,
    '[REFAZER ARRUMAÇÃO] ' || coalesce(v_txt, 'ver avaliação') || coalesce(' — ' || nullif(NEW.observacao, ''), ''),
    NEW.avaliadora_id, coalesce(NEW.avaliadora_nome, 'Líder'), 'to_camareira',
    true, v_users, NEW.camareira_nome
  );
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION private.tg_avaliacao_arrumacao_push() FROM PUBLIC, anon, authenticated;

-- Pendências da vistoria (versão da 0097 + recado privado da líder + baixa do recado ao resolver).
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
  v_cam_nome text;
  v_cam_users uuid[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF NOT (
    private.has_role(v_user_id, 'recepcao'::app_role)
    OR private.has_role(v_user_id, 'gestor'::app_role)
    OR private.has_role(v_user_id, 'admin'::app_role)
    OR private.eh_lider_camareiras(v_user_id)
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

  IF _team = 'camareira' AND private.eh_lider_camareiras(v_user_id) THEN
    -- Líder: recado PRIVADO só para a camareira que arrumou o quarto (e gestor).
    SELECT c.nome, c.user_ids INTO v_cam_nome, v_cam_users
    FROM private.camareira_do_quarto(_property, btrim(_room_number)) c;
    v_responsible_name := coalesce(v_cam_nome, 'Camareira do quarto');
    INSERT INTO public.recados_camareiras (
      property, room_number, message, created_by, created_by_name, direction,
      privado, destinatarios, destinatario_nome
    ) VALUES (
      _property,
      btrim(_room_number),
      '[PENDÊNCIA DE VISTORIA] ' || btrim(_description),
      v_user_id,
      v_opened_by_name,
      'to_camareira',
      true, v_cam_users, v_cam_nome
    ) RETURNING id INTO v_recado_id;
  ELSIF _team = 'camareira' THEN
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
    OR private.eh_lider_camareiras(v_user_id)
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

  -- Pendência resolvida: o recado dela sai do card (o privado só a líder/gestor removeriam).
  UPDATE public.recados_camareiras r
  SET read_at = now(), read_by = coalesce(v_resolved_by_name, 'Líder')
  FROM public.room_inspection_issues i
  WHERE i.id = _issue_id AND r.id = i.recado_id AND r.read_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_room_inspection_issue(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_room_inspection_issue(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_room_inspection_issue(uuid) TO authenticated;
-- Recados de pendência que as líderes já mandaram (ainda abertos) passam a ser privados da camareira do quarto.
DO $$
DECLARE r record; v_nome text; v_users uuid[];
BEGIN
  FOR r IN
    SELECT rc.id, rc.property, rc.room_number
    FROM public.recados_camareiras rc
    WHERE rc.read_at IS NULL AND NOT rc.privado AND rc.room_number IS NOT NULL
      AND rc.message LIKE '[PENDÊNCIA DE VISTORIA]%' AND private.eh_lider_camareiras(rc.created_by)
  LOOP
    SELECT c.nome, c.user_ids INTO v_nome, v_users FROM private.camareira_do_quarto(r.property, r.room_number) c;
    UPDATE public.recados_camareiras
    SET privado = true, destinatarios = v_users, destinatario_nome = v_nome
    WHERE id = r.id;
  END LOOP;
END $$;
