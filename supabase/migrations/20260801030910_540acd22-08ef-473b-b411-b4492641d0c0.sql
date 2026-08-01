REVOKE ALL ON FUNCTION public.list_staff_basic() FROM anon;
REVOKE ALL ON FUNCTION public.list_tecnicos() FROM anon;
REVOKE ALL ON FUNCTION public.adjust_preventive_log_date(uuid, date) FROM anon;
REVOKE ALL ON FUNCTION private.get_recepcao_user_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.get_camareiras_user_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.list_camareiras() FROM PUBLIC;