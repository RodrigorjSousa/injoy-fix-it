
-- Preventive maintenance module

CREATE TABLE IF NOT EXISTS public.preventive_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('Quarto','Área Comum')),
  task_name text NOT NULL,
  frequency_days integer NOT NULL CHECK (frequency_days > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.preventive_tasks TO authenticated;
GRANT ALL ON public.preventive_tasks TO service_role;

ALTER TABLE public.preventive_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prev_tasks_select_auth" ON public.preventive_tasks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "prev_tasks_admin_write" ON public.preventive_tasks
  FOR INSERT TO authenticated WITH CHECK (
    private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'gestor')
  );
CREATE POLICY "prev_tasks_admin_update" ON public.preventive_tasks
  FOR UPDATE TO authenticated USING (
    private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'gestor')
  ) WITH CHECK (
    private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'gestor')
  );
CREATE POLICY "prev_tasks_admin_delete" ON public.preventive_tasks
  FOR DELETE TO authenticated USING (
    private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'gestor')
  );

CREATE TRIGGER preventive_tasks_updated_at BEFORE UPDATE ON public.preventive_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.preventive_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property text NOT NULL,
  category text NOT NULL,
  location_name text NOT NULL,
  task_id uuid NOT NULL REFERENCES public.preventive_tasks(id) ON DELETE CASCADE,
  technician_name text NOT NULL,
  technician_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  frequency_days integer NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  next_due_date date GENERATED ALWAYS AS ((completed_at AT TIME ZONE 'America/Sao_Paulo')::date + frequency_days) STORED,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prev_logs_location ON public.preventive_logs (property, location_name, task_id, completed_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.preventive_logs TO authenticated;
GRANT ALL ON public.preventive_logs TO service_role;

ALTER TABLE public.preventive_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prev_logs_select_auth" ON public.preventive_logs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "prev_logs_insert_auth" ON public.preventive_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "prev_logs_admin_delete" ON public.preventive_logs
  FOR DELETE TO authenticated USING (
    private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'gestor')
  );

INSERT INTO public.preventive_tasks (category, task_name, frequency_days) VALUES
('Quarto', 'Pintura Corretiva (Revisar e retocar)', 30),
('Quarto', 'Limpeza Filtro Ar-Condicionado', 30),
('Quarto', 'Limpeza Ralos e Sifões', 30),
('Quarto', 'Limpeza Trilhos, Janelas e Vidros', 15),
('Quarto', 'Revisar Rejuntes', 90),
('Quarto', 'Revisar LEDs, Tomadas e Vazamentos', 30),
('Quarto', 'Limpeza Pesada (Arrastar camas, atrás da TV, rodapés, exaustor)', 60),
('Área Comum', 'Pintura Corretiva Corredores e Áreas Comuns', 30),
('Área Comum', 'Limpeza Trilhos, Janelas e Portas', 15),
('Área Comum', 'Limpeza Ralos Externos (Cozinha e Pátios)', 60),
('Área Comum', 'Pintura da Fachada (Revisar)', 60),
('Área Comum', 'Limpeza Geral Jardim de Inverno + Pátios (Podar, Vidros, Piso)', 15)
ON CONFLICT DO NOTHING;
