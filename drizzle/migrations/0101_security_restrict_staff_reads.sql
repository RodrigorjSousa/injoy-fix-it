DROP POLICY IF EXISTS "boas_vindas_config_select_auth" ON public.boas_vindas_config;
CREATE POLICY "boas_vindas_config_select_staff" ON public.boas_vindas_config FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated read config bonificacao" ON public.config_bonificacao;
CREATE POLICY "Staff read config bonificacao" ON public.config_bonificacao FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "prev_logs_select_all_authenticated" ON public.preventive_logs;
CREATE POLICY "prev_logs_select_staff" ON public.preventive_logs FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "prev_tasks_select_all_authenticated" ON public.preventive_tasks;
CREATE POLICY "prev_tasks_select_staff" ON public.preventive_tasks FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Todos leem config meta" ON public.bonus_meta_config;
CREATE POLICY "Staff leem config meta" ON public.bonus_meta_config FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated read registros bonif" ON public.registros_bonificacao;
CREATE POLICY "Staff read registros bonif" ON public.registros_bonificacao FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Todos leem agenda tarefas extras" ON public.tarefas_extras_agenda;
CREATE POLICY "Staff leem agenda tarefas extras" ON public.tarefas_extras_agenda FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.recepcao_caixa_movimentos;
DROP POLICY IF EXISTS "Staff can see own property movements" ON public.recepcao_caixa_movimentos;
DROP POLICY IF EXISTS "Authenticated users can insert movements" ON public.recepcao_caixa_movimentos;
CREATE POLICY "Recepcao can see movements" ON public.recepcao_caixa_movimentos FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'recepcao'::app_role));
CREATE POLICY "Staff can insert movements" ON public.recepcao_caixa_movimentos FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'recepcao'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated read fotos-manutencao" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload fotos-manutencao" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update fotos-manutencao" ON storage.objects;
CREATE POLICY "Staff read fotos-manutencao" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'fotos-manutencao' AND private.is_staff(auth.uid()));
CREATE POLICY "Owner upload fotos-manutencao" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'fotos-manutencao' AND (storage.foldername(name))[1] = (select auth.uid()::text));
CREATE POLICY "Owner update fotos-manutencao" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'fotos-manutencao' AND owner_id = (select auth.uid()::text)) WITH CHECK (bucket_id = 'fotos-manutencao' AND (storage.foldername(name))[1] = (select auth.uid()::text));