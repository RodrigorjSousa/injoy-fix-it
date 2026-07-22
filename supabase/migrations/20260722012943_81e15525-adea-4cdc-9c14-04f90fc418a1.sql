
REVOKE ALL ON FUNCTION private.enqueue_push_notification(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.tg_chamados_push() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.tg_recados_push() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.tg_trocas_push() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.tg_purchase_push() FROM PUBLIC, anon, authenticated;
