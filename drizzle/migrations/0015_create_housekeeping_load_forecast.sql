CREATE TABLE public.previsao_carga_config (
  unidade text PRIMARY KEY CHECK (unidade IN ('Botafogo','Ipanema')),
  geral_minutos integer NOT NULL DEFAULT 45 CHECK (geral_minutos BETWEEN 5 AND 180),
  geral_checkin_minutos integer NOT NULL DEFAULT 50 CHECK (geral_checkin_minutos BETWEEN 5 AND 180),
  troca_arrumacao_minutos integer NOT NULL DEFAULT 30 CHECK (troca_arrumacao_minutos BETWEEN 5 AND 180),
  arrumacao_minutos integer NOT NULL DEFAULT 20 CHECK (arrumacao_minutos BETWEEN 5 AND 180),
  margem_pct numeric NOT NULL DEFAULT 15 CHECK (margem_pct BETWEEN 0 AND 50),
  limite_amarelo_pct numeric NOT NULL DEFAULT 85 CHECK (limite_amarelo_pct BETWEEN 1 AND 300),
  limite_vermelho_pct numeric NOT NULL DEFAULT 100 CHECK (limite_vermelho_pct BETWEEN 1 AND 300),
  limite_amarelo_gerais integer NOT NULL CHECK (limite_amarelo_gerais >= 0),
  limite_vermelho_gerais integer NOT NULL CHECK (limite_vermelho_gerais >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.previsao_carga_config TO authenticated;
GRANT ALL ON public.previsao_carga_config TO service_role;
ALTER TABLE public.previsao_carga_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestores consultam configuracao de carga" ON public.previsao_carga_config FOR SELECT TO authenticated USING (private.has_role(auth.uid(),'gestor') OR private.has_role(auth.uid(),'admin'));
CREATE POLICY "Gestores alteram configuracao de carga" ON public.previsao_carga_config FOR ALL TO authenticated USING (private.has_role(auth.uid(),'gestor') OR private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'gestor') OR private.has_role(auth.uid(),'admin'));

CREATE TABLE public.previsao_carga (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade text NOT NULL CHECK (unidade IN ('Botafogo','Ipanema')),
  data date NOT NULL,
  calculado_em timestamptz NOT NULL DEFAULT now(),
  horizonte_dias integer NOT NULL CHECK (horizonte_dias BETWEEN 0 AND 7),
  qtd_geral integer NOT NULL DEFAULT 0,
  qtd_geral_checkin integer NOT NULL DEFAULT 0,
  qtd_troca_arrumacao integer NOT NULL DEFAULT 0,
  qtd_arrumacao integer NOT NULL DEFAULT 0,
  qtd_checkins integer NOT NULL DEFAULT 0,
  qtd_checkouts integer NOT NULL DEFAULT 0,
  carga_minutos integer NOT NULL DEFAULT 0,
  capacidade_minutos integer NOT NULL DEFAULT 0,
  camareiras_escaladas integer NOT NULL DEFAULT 0,
  freelancers_escalados integer NOT NULL DEFAULT 0,
  ocupacao_carga_pct numeric NOT NULL DEFAULT 0,
  nivel text NOT NULL CHECK (nivel IN ('verde','amarelo','vermelho')),
  chegada_mais_cedo time,
  detalhes jsonb NOT NULL DEFAULT '[]'::jsonb,
  capacidade_detalhes jsonb NOT NULL DEFAULT '[]'::jsonb
);
GRANT SELECT ON public.previsao_carga TO authenticated;
GRANT ALL ON public.previsao_carga TO service_role;
ALTER TABLE public.previsao_carga ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestores consultam previsoes de carga" ON public.previsao_carga FOR SELECT TO authenticated USING (private.has_role(auth.uid(),'gestor') OR private.has_role(auth.uid(),'admin'));
CREATE INDEX previsao_carga_data_idx ON public.previsao_carga (data, unidade, calculado_em DESC);
CREATE INDEX previsao_carga_calculado_idx ON public.previsao_carga (calculado_em DESC);

CREATE TABLE public.previsao_carga_alertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade text NOT NULL CHECK (unidade IN ('Botafogo','Ipanema')),
  data date NOT NULL,
  nivel text NOT NULL CHECK (nivel IN ('amarelo','vermelho')),
  tipo text NOT NULL CHECK (tipo IN ('d2','mudanca_nivel','lembrete_d1')),
  previsao_id uuid NOT NULL REFERENCES public.previsao_carga(id) ON DELETE CASCADE,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unidade, data, nivel, tipo)
);
GRANT SELECT ON public.previsao_carga_alertas TO authenticated;
GRANT ALL ON public.previsao_carga_alertas TO service_role;
ALTER TABLE public.previsao_carga_alertas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestores consultam alertas de carga" ON public.previsao_carga_alertas FOR SELECT TO authenticated USING (private.has_role(auth.uid(),'gestor') OR private.has_role(auth.uid(),'admin'));

CREATE OR REPLACE VIEW public.previsao_tempos_medianos
WITH (security_invoker = true) AS
SELECT property AS unidade,
       upper(regexp_replace(task_name, '\\s+', ' ', 'g')) AS tarefa,
       count(*)::integer AS amostras,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (ended_at-started_at))/60.0)::numeric(8,2) AS mediana_minutos
FROM public.room_housekeeping_history
WHERE started_at IS NOT NULL AND ended_at IS NOT NULL
  AND started_at >= now() - interval '60 days'
  AND extract(epoch FROM (ended_at-started_at))/60.0 BETWEEN 5 AND 180
  AND upper(regexp_replace(task_name, '\\s+', ' ', 'g')) IN ('GERAL','GERAL - CHECK-IN','TROCA + ARRUMAÇÃO','ARRUMAÇÃO')
GROUP BY property, upper(regexp_replace(task_name, '\\s+', ' ', 'g'));
GRANT SELECT ON public.previsao_tempos_medianos TO authenticated;
GRANT SELECT ON public.previsao_tempos_medianos TO service_role;

CREATE OR REPLACE FUNCTION public.previsao_carga_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.updated_at=now(); NEW.updated_by=auth.uid(); RETURN NEW; END $$;
CREATE TRIGGER previsao_carga_config_updated BEFORE UPDATE ON public.previsao_carga_config FOR EACH ROW EXECUTE FUNCTION public.previsao_carga_set_updated_at();