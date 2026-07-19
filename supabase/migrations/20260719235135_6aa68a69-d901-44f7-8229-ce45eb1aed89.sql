
CREATE OR REPLACE FUNCTION public.list_tecnicos()
RETURNS TABLE(id uuid, nome text, categorias text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, nome, COALESCE(categorias, ARRAY[]::text[]) FROM public.funcionarios ORDER BY nome;
$$;
GRANT EXECUTE ON FUNCTION public.list_tecnicos() TO authenticated;
