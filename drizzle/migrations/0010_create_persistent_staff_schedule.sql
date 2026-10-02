CREATE TABLE public.escala_colaboradores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  nome text NOT NULL,
  setor text NOT NULL CHECK (setor IN ('manutencao', 'recepcao', 'camareiras')),
  unidade text NOT NULL CHECK (unidade IN ('Botafogo', 'Ipanema', 'Ambas')),
  vinculo text NOT NULL CHECK (vinculo IN ('fixo', 'freelance')),
  turno_padrao text CHECK (turno_padrao IN ('manha', 'noite', 'dia')),
  telefone text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.escala_colaboradores TO authenticated;
GRANT ALL ON public.escala_colaboradores TO service_role;
ALTER TABLE public.escala_colaboradores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestores administram colaboradores da escala" ON public.escala_colaboradores FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));
CREATE UNIQUE INDEX escala_colaboradores_identidade_uq ON public.escala_colaboradores ((lower(nome)), setor, unidade);
CREATE INDEX escala_colaboradores_funcionario_idx ON public.escala_colaboradores (funcionario_id);

CREATE TABLE public.escala_freelance_modalidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  motivo text NOT NULL CHECK (motivo IN ('reforco_ocupacao', 'cobertura_falta', 'outro')),
  horas numeric(6,2) NOT NULL CHECK (horas > 0),
  valor numeric(10,2) NOT NULL CHECK (valor >= 0),
  unidade text NOT NULL CHECK (unidade IN ('Botafogo', 'Ipanema', 'Ambas')),
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.escala_freelance_modalidades TO authenticated;
GRANT ALL ON public.escala_freelance_modalidades TO service_role;
ALTER TABLE public.escala_freelance_modalidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestores administram modalidades da escala" ON public.escala_freelance_modalidades FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));
CREATE UNIQUE INDEX escala_modalidades_nome_unidade_uq ON public.escala_freelance_modalidades ((lower(nome)), unidade);

CREATE TABLE public.escala_padroes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES public.escala_colaboradores(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('12x36', '5x2_fixo', '5x2_revezamento', '6x1')),
  hora_entrada time,
  hora_saida time,
  intervalo_minutos integer CHECK (intervalo_minutos IS NULL OR intervalo_minutos >= 0),
  data_base date,
  folgas_fixas smallint[] NOT NULL DEFAULT '{}',
  folga_semana_a smallint CHECK (folga_semana_a BETWEEN 0 AND 6),
  folga_semana_b smallint CHECK (folga_semana_b BETWEEN 0 AND 6),
  vigente_desde date NOT NULL DEFAULT current_date,
  vigente_ate date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (vigente_ate IS NULL OR vigente_ate >= vigente_desde),
  CHECK (folgas_fixas <@ ARRAY[0,1,2,3,4,5,6]::smallint[])
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.escala_padroes TO authenticated;
GRANT ALL ON public.escala_padroes TO service_role;
ALTER TABLE public.escala_padroes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestores administram padroes da escala" ON public.escala_padroes FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));
CREATE UNIQUE INDEX escala_padroes_ativo_uq ON public.escala_padroes (colaborador_id) WHERE vigente_ate IS NULL;

CREATE TABLE public.escala_freelance_modalidades_seed_guard (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  seeded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.escala_freelance_modalidades_seed_guard TO authenticated;
GRANT ALL ON public.escala_freelance_modalidades_seed_guard TO service_role;
ALTER TABLE public.escala_freelance_modalidades_seed_guard ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestores consultam seed da escala" ON public.escala_freelance_modalidades_seed_guard FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));

CREATE TABLE public.escala_dias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES public.escala_colaboradores(id) ON DELETE RESTRICT,
  unidade text NOT NULL CHECK (unidade IN ('Botafogo', 'Ipanema')),
  setor text NOT NULL CHECK (setor IN ('manutencao', 'recepcao', 'camareiras')),
  data date NOT NULL,
  turno text NOT NULL CHECK (turno IN ('manha', 'noite', 'dia')),
  hora_entrada time,
  hora_saida time,
  status text NOT NULL CHECK (status IN ('trabalho', 'folga', 'falta', 'atestado', 'ferias', 'extra')),
  origem text NOT NULL CHECK (origem IN ('gerado', 'manual')),
  substitui_colaborador_id uuid REFERENCES public.escala_colaboradores(id) ON DELETE SET NULL,
  motivo text,
  modalidade_id uuid REFERENCES public.escala_freelance_modalidades(id) ON DELETE SET NULL,
  motivo_chamada text CHECK (motivo_chamada IN ('reforco_ocupacao', 'cobertura_falta', 'outro')),
  horas_contratadas numeric(6,2) CHECK (horas_contratadas IS NULL OR horas_contratadas > 0),
  valor_combinado numeric(10,2) CHECK (valor_combinado IS NULL OR valor_combinado >= 0),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (colaborador_id, data, turno)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.escala_dias TO authenticated;
GRANT ALL ON public.escala_dias TO service_role;
ALTER TABLE public.escala_dias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestores administram dias da escala" ON public.escala_dias FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));
CREATE INDEX escala_dias_unidade_data_idx ON public.escala_dias (unidade, data);
CREATE INDEX escala_dias_data_idx ON public.escala_dias (data);

CREATE TABLE public.escala_meses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade text NOT NULL CHECK (unidade IN ('Botafogo', 'Ipanema')),
  setor text NOT NULL CHECK (setor IN ('manutencao', 'recepcao', 'camareiras')),
  competencia date NOT NULL CHECK (competencia = date_trunc('month', competencia)::date),
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'publicada')),
  publicada_em timestamptz,
  publicada_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unidade, setor, competencia)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.escala_meses TO authenticated;
GRANT ALL ON public.escala_meses TO service_role;
ALTER TABLE public.escala_meses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestores administram meses da escala" ON public.escala_meses FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));

CREATE TABLE public.escala_alteracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escala_dia_id uuid NOT NULL REFERENCES public.escala_dias(id) ON DELETE CASCADE,
  alterado_por uuid,
  alterado_em timestamptz NOT NULL DEFAULT now(),
  antes jsonb NOT NULL,
  depois jsonb NOT NULL,
  motivo text
);
GRANT SELECT ON public.escala_alteracoes TO authenticated;
GRANT ALL ON public.escala_alteracoes TO service_role;
ALTER TABLE public.escala_alteracoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestores consultam alteracoes da escala" ON public.escala_alteracoes FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));
CREATE INDEX escala_alteracoes_dia_idx ON public.escala_alteracoes (escala_dia_id, alterado_em DESC);

CREATE TABLE public.feriados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL,
  nome text NOT NULL,
  abrangencia text NOT NULL CHECK (abrangencia IN ('nacional', 'estadual_RJ', 'municipal_Rio')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (data, nome, abrangencia)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feriados TO authenticated;
GRANT ALL ON public.feriados TO service_role;
ALTER TABLE public.feriados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestores administram feriados" ON public.feriados FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));
CREATE INDEX feriados_data_idx ON public.feriados (data);

CREATE OR REPLACE FUNCTION public.escala_set_audit_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.escala_registrar_alteracao_publicada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.escala_meses m
    WHERE m.unidade = OLD.unidade
      AND m.setor = OLD.setor
      AND m.competencia = date_trunc('month', OLD.data)::date
      AND m.status = 'publicada'
  ) THEN
    INSERT INTO public.escala_alteracoes (escala_dia_id, alterado_por, antes, depois, motivo)
    VALUES (OLD.id, auth.uid(), to_jsonb(OLD), to_jsonb(NEW), NEW.motivo);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.escala_registrar_alteracao_publicada() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.escala_registrar_alteracao_publicada() TO service_role;

CREATE TRIGGER tr_escala_colaboradores_updated_at BEFORE UPDATE ON public.escala_colaboradores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tr_escala_modalidades_updated BEFORE UPDATE ON public.escala_freelance_modalidades FOR EACH ROW EXECUTE FUNCTION public.escala_set_audit_fields();
CREATE TRIGGER tr_escala_dias_updated BEFORE UPDATE ON public.escala_dias FOR EACH ROW EXECUTE FUNCTION public.escala_set_audit_fields();
CREATE TRIGGER tr_escala_meses_updated BEFORE UPDATE ON public.escala_meses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tr_escala_dias_auditoria AFTER UPDATE ON public.escala_dias FOR EACH ROW EXECUTE FUNCTION public.escala_registrar_alteracao_publicada();