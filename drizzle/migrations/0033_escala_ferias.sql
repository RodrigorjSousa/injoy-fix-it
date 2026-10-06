-- Férias na Escala: período de férias de um colaborador fixo e a freelancer que cobre.
-- Os dias em si continuam em escala_dias (status 'ferias' para quem sai e 'extra' para quem cobre);
-- esta tabela guarda o lançamento para listar, editar e cancelar. Idempotente.

CREATE TABLE IF NOT EXISTS public.escala_ferias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES public.escala_colaboradores(id) ON DELETE CASCADE,
  unidade text NOT NULL CHECK (unidade IN ('Botafogo', 'Ipanema')),
  inicio date NOT NULL,
  fim date NOT NULL,
  substituto_id uuid REFERENCES public.escala_colaboradores(id) ON DELETE SET NULL,
  modalidade_id uuid REFERENCES public.escala_freelance_modalidades(id) ON DELETE SET NULL,
  hora_entrada time,
  horas_contratadas numeric(6,2) CHECK (horas_contratadas IS NULL OR horas_contratadas > 0),
  valor_combinado numeric(10,2) CHECK (valor_combinado IS NULL OR valor_combinado >= 0),
  observacao text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT escala_ferias_periodo_ck CHECK (fim >= inicio AND fim - inicio <= 60),
  CONSTRAINT escala_ferias_substituto_ck CHECK (substituto_id IS NULL OR substituto_id <> colaborador_id)
);

CREATE INDEX IF NOT EXISTS escala_ferias_colaborador_idx ON public.escala_ferias (colaborador_id, inicio);
CREATE INDEX IF NOT EXISTS escala_ferias_periodo_idx ON public.escala_ferias (inicio, fim);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.escala_ferias TO authenticated;
GRANT ALL ON public.escala_ferias TO service_role;
ALTER TABLE public.escala_ferias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gestores administram ferias da escala" ON public.escala_ferias;
CREATE POLICY "Gestores administram ferias da escala" ON public.escala_ferias
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));

-- Não deixa lançar dois períodos de férias que se sobrepõem para a mesma pessoa.
CREATE OR REPLACE FUNCTION private.tg_escala_ferias_validar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.escala_ferias f
    WHERE f.colaborador_id = NEW.colaborador_id
      AND f.id <> NEW.id
      AND f.inicio <= NEW.fim AND f.fim >= NEW.inicio
  ) THEN
    RAISE EXCEPTION 'Já existem férias lançadas para esta pessoa nesse período';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_escala_ferias_validar ON public.escala_ferias;
CREATE TRIGGER tr_escala_ferias_validar
BEFORE INSERT OR UPDATE ON public.escala_ferias
FOR EACH ROW EXECUTE FUNCTION private.tg_escala_ferias_validar();
