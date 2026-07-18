
CREATE TABLE public.rotinas_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  frequencia_dias INTEGER NOT NULL CHECK (frequencia_dias > 0),
  escopo_unidade TEXT NOT NULL CHECK (escopo_unidade IN ('Ambas','Botafogo','Ipanema')),
  checklist TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rotinas_config TO authenticated;
GRANT ALL ON public.rotinas_config TO service_role;
ALTER TABLE public.rotinas_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rotinas_config_select_auth" ON public.rotinas_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "rotinas_config_manage_admin_gestor" ON public.rotinas_config FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'gestor'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'gestor'::app_role));
CREATE TRIGGER update_rotinas_config_updated_at BEFORE UPDATE ON public.rotinas_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.rotinas_locais (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rotina_config_id UUID NOT NULL REFERENCES public.rotinas_config(id) ON DELETE CASCADE,
  nome_local TEXT NOT NULL,
  unidade TEXT NOT NULL CHECK (unidade IN ('Botafogo','Ipanema')),
  ultima_execucao TIMESTAMPTZ,
  ultimo_tecnico TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rotinas_locais TO authenticated;
GRANT ALL ON public.rotinas_locais TO service_role;
ALTER TABLE public.rotinas_locais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rotinas_locais_select_auth" ON public.rotinas_locais FOR SELECT TO authenticated USING (true);
CREATE POLICY "rotinas_locais_manage_admin_gestor" ON public.rotinas_locais FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'gestor'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'gestor'::app_role));
CREATE POLICY "rotinas_locais_update_staff" ON public.rotinas_locais FOR UPDATE TO authenticated
  USING (
    private.has_role(auth.uid(),'admin'::app_role)
    OR private.has_role(auth.uid(),'gestor'::app_role)
    OR private.has_role(auth.uid(),'funcionario'::app_role)
  ) WITH CHECK (true);
CREATE TRIGGER update_rotinas_locais_updated_at BEFORE UPDATE ON public.rotinas_locais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX rotinas_locais_config_idx ON public.rotinas_locais(rotina_config_id);

CREATE TABLE public.rotinas_historico (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rotina_local_id UUID NOT NULL REFERENCES public.rotinas_locais(id) ON DELETE CASCADE,
  data_execucao TIMESTAMPTZ NOT NULL DEFAULT now(),
  tecnico TEXT NOT NULL,
  observacoes TEXT,
  registrado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rotinas_historico TO authenticated;
GRANT ALL ON public.rotinas_historico TO service_role;
ALTER TABLE public.rotinas_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rotinas_historico_select_auth" ON public.rotinas_historico FOR SELECT TO authenticated USING (true);
CREATE POLICY "rotinas_historico_insert_staff" ON public.rotinas_historico FOR INSERT TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(),'admin'::app_role)
    OR private.has_role(auth.uid(),'gestor'::app_role)
    OR private.has_role(auth.uid(),'funcionario'::app_role)
  );
CREATE POLICY "rotinas_historico_manage_admin_gestor" ON public.rotinas_historico FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'gestor'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'gestor'::app_role));
CREATE INDEX rotinas_historico_local_idx ON public.rotinas_historico(rotina_local_id, data_execucao DESC);

CREATE OR REPLACE FUNCTION public.sync_rotinas_locais_ultima_execucao()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.rotinas_locais
    SET ultima_execucao = NEW.data_execucao,
        ultimo_tecnico = NEW.tecnico,
        updated_at = now()
  WHERE id = NEW.rotina_local_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_sync_rotinas_locais AFTER INSERT ON public.rotinas_historico
  FOR EACH ROW EXECUTE FUNCTION public.sync_rotinas_locais_ultima_execucao();

INSERT INTO public.rotinas_config (titulo, frequencia_dias, escopo_unidade, checklist) VALUES
  ('Pintura corretiva - Quartos', 30, 'Ambas', '{}'),
  ('Pintura corretiva - Áreas Comuns e Corredores', 30, 'Ambas', '{}'),
  ('Limpeza Geral Profunda - Quartos', 60, 'Ambas', ARRAY['Ralos','Sifão','Chuveiro','Exaustor','Filtro do ar','Rodapés','Limpeza de tomadas','Atrás da TV','Arrastar móveis','Arrastar camas','Limpar atrás da cabeceira']),
  ('Revisão de Rejuntes', 90, 'Ambas', '{}'),
  ('Limpeza Trilhos, Janelas e Portas (Vidros)', 15, 'Ambas', '{}'),
  ('Limpeza Ralos Externos (Cozinha e Pátios)', 60, 'Ambas', '{}'),
  ('Pintura Fachada', 60, 'Ambas', '{}'),
  ('Limpeza Geral Jardim de Inverno e Pátios', 15, 'Botafogo', ARRAY['Podar plantas','Limpeza de vidros','Lavar piso']);
