-- Tarefas Extras: próxima execução definida pelo gestor (por unidade e área).
-- Se o gestor não definir, o app calcula: última execução + periodicidade (dias).
-- Quando alguém registra a tarefa depois da data definida, volta a valer o cálculo automático.
-- Pode ser aplicada mais de uma vez.

CREATE TABLE IF NOT EXISTS public.tarefas_extras_agenda (
  unidade text NOT NULL CHECK (unidade IN ('Botafogo', 'Ipanema')),
  categoria text NOT NULL,
  proxima_data date NOT NULL,
  definido_em timestamptz NOT NULL DEFAULT now(),
  definido_por uuid,
  PRIMARY KEY (unidade, categoria)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarefas_extras_agenda TO authenticated;
GRANT ALL ON public.tarefas_extras_agenda TO service_role;
ALTER TABLE public.tarefas_extras_agenda ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Todos leem agenda tarefas extras" ON public.tarefas_extras_agenda;
CREATE POLICY "Todos leem agenda tarefas extras" ON public.tarefas_extras_agenda
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Gestor define agenda tarefas extras" ON public.tarefas_extras_agenda;
CREATE POLICY "Gestor define agenda tarefas extras" ON public.tarefas_extras_agenda
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role));
