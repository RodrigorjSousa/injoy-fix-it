DROP POLICY IF EXISTS "Funcionario ve a si proprio, gestores veem todos" ON public.funcionarios;
CREATE POLICY "Autenticados leem funcionarios"
ON public.funcionarios
FOR SELECT
TO authenticated
USING (true);