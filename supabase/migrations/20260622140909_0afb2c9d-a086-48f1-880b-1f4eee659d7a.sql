-- Restringe UPDATE em ativos_ar: precisa ser gestor OU funcionário vinculado
DROP POLICY IF EXISTS "Authenticated update ativos (registrar limpeza)" ON public.ativos_ar;
CREATE POLICY "Gestor ou funcionario vinculado atualiza ativos"
  ON public.ativos_ar FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestor')
    OR EXISTS (SELECT 1 FROM public.funcionarios WHERE user_id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'gestor')
    OR EXISTS (SELECT 1 FROM public.funcionarios WHERE user_id = auth.uid())
  );

-- Revoga EXECUTE de funções SECURITY DEFINER que só devem ser chamadas por triggers
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_funcionario_to_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;