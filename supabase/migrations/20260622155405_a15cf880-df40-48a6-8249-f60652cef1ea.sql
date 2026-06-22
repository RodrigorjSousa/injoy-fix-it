
-- Cria conta admin exclusiva com papel de Gestor
DO $$
DECLARE
  v_user_id UUID;
  v_email TEXT := 'admin@injoy.com.br';
  v_password TEXT := 'Admin@1234';
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_email);

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change,
      email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id, 'authenticated', 'authenticated', v_email,
      crypt(v_password, gen_salt('bf')),
      now(),
      jsonb_build_object('provider','email','providers',ARRAY['email']),
      jsonb_build_object('nome','Administrador'),
      now(), now(), '', '', '', ''
    );

    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_user_id,
            jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
            'email', v_user_id::text, now(), now(), now());

    INSERT INTO public.profiles (id, email, nome) VALUES (v_user_id, v_email, 'Administrador')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Garante papel de gestor
  INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, 'gestor')
  ON CONFLICT DO NOTHING;
END $$;
