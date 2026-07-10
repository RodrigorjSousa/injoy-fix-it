CREATE OR REPLACE FUNCTION public.list_camareiras()
RETURNS TABLE(id uuid, nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.id, f.nome
  FROM public.funcionarios f
  JOIN public.user_roles ur ON ur.user_id = f.user_id
  WHERE ur.role = 'camareira'
  ORDER BY f.nome ASC
$$;

GRANT EXECUTE ON FUNCTION public.list_camareiras() TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.funcionarios;