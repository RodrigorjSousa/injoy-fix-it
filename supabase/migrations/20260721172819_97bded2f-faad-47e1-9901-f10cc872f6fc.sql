
CREATE OR REPLACE FUNCTION public.adjust_preventive_log_date(_log_id uuid, _new_date date)
RETURNS TABLE(id uuid, completed_at timestamptz, next_due_date date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role)) THEN
    RAISE EXCEPTION 'Somente administradores ou gestores podem ajustar datas de manutenção.';
  END IF;

  RETURN QUERY
  UPDATE public.preventive_logs pl
  SET completed_at = ((_new_date::text || ' 12:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo')
  WHERE pl.id = _log_id
  RETURNING pl.id, pl.completed_at, pl.next_due_date;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_preventive_log_date(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_preventive_log_date(uuid, date) TO authenticated;

-- Corrigir datas do Quarto 01 Botafogo para 02/07/2026 conforme solicitado
UPDATE public.preventive_logs
SET completed_at = (('2026-07-02 12:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo')
WHERE property = 'Botafogo' AND location_name = 'Quarto 01'
  AND completed_at::date = '2026-07-20';
