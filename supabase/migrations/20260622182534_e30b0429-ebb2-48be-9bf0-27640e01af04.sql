
DROP FUNCTION IF EXISTS public.get_chat_contacts();

CREATE OR REPLACE FUNCTION private.get_chat_contacts()
RETURNS TABLE(id uuid, nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nome
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL AND p.id <> auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION private.get_chat_contacts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_chat_contacts() TO authenticated;

-- Expose a thin public wrapper that the client can call via rpc but with no SECURITY DEFINER chain visible
CREATE OR REPLACE FUNCTION public.chat_contacts()
RETURNS TABLE(id uuid, nome text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT * FROM private.get_chat_contacts();
$$;
REVOKE EXECUTE ON FUNCTION public.chat_contacts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_contacts() TO authenticated;
