-- Segurança (alerta do Supabase "Function Search Path Mutable"): fixa o search_path das funções que
-- ainda não tinham. Não muda o que elas fazem. Idempotente; ignora função que não exista.
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'private.ponto_distancia_m(numeric, numeric, numeric, numeric)',
    'private.ponto_face_distancia(jsonb, jsonb)',
    'private.ponto_descritor_valido(jsonb)',
    'private.ponto_proximos_tipos(text)',
    'public.sync_chamado_responsavel_nome()'
  ] LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, private', f);
    ELSE
      RAISE NOTICE 'Função não encontrada (ignorada): %', f;
    END IF;
  END LOOP;
END $$;
