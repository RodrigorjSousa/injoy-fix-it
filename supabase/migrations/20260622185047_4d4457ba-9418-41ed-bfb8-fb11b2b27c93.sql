-- Grant admin role to admin@injoy.com.br
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users WHERE lower(email)='admin@injoy.com.br'
ON CONFLICT (user_id, role) DO NOTHING;

-- Allow admins to insert/delete gestor role rows
CREATE POLICY "Admins can grant gestor"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role) AND role = 'gestor'::public.app_role);

CREATE POLICY "Admins can revoke gestor"
  ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role) AND role = 'gestor'::public.app_role);