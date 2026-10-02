CREATE OR REPLACE FUNCTION private.notify_finance_due_daily()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_due_today integer;
  v_due_in_three_days integer;
BEGIN
  SELECT count(*) FILTER (WHERE data_vencimento = v_today),
         count(*) FILTER (WHERE data_vencimento = v_today + 3)
  INTO v_due_today, v_due_in_three_days
  FROM public.fin_lancamentos
  WHERE tipo = 'despesa'
    AND status = 'a_pagar'
    AND data_vencimento IN (v_today, v_today + 3);

  IF coalesce(v_due_today, 0) + coalesce(v_due_in_three_days, 0) > 0 THEN
    PERFORM private.enqueue_push_notification(
      'finance_due',
      jsonb_build_object(
        'date', v_today,
        'count', v_due_today + v_due_in_three_days,
        'due_today', v_due_today,
        'due_in_three_days', v_due_in_three_days
      )
    );
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.notify_finance_due_daily() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.notify_finance_due_daily() FROM anon;
REVOKE ALL ON FUNCTION private.notify_finance_due_daily() FROM authenticated;
GRANT EXECUTE ON FUNCTION private.notify_finance_due_daily() TO service_role;

SELECT cron.schedule(
  'finance-alerts-daily-0800-brasilia',
  '0 11 * * *',
  'SELECT private.notify_finance_due_daily()'
);