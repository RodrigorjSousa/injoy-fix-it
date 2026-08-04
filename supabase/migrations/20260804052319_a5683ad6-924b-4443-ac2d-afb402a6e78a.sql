-- Auditoria e correção das políticas de RLS para Manutenção Preventiva
-- Objetivo: Garantir que técnicos e gestores vejam exatamente os mesmos cards de tarefas (21 vs 18).

-- 1. Tabela preventive_tasks
DROP POLICY IF EXISTS "prev_tasks_select_staff" ON public.preventive_tasks;
DROP POLICY IF EXISTS "prev_tasks_select_auth" ON public.preventive_tasks;

CREATE POLICY "prev_tasks_select_all_authenticated" 
ON public.preventive_tasks 
FOR SELECT 
TO authenticated 
USING (true);

-- 2. Tabela preventive_logs
DROP POLICY IF EXISTS "prev_logs_select_staff" ON public.preventive_logs;
DROP POLICY IF EXISTS "prev_logs_select_auth" ON public.preventive_logs;

CREATE POLICY "prev_logs_select_all_authenticated" 
ON public.preventive_logs 
FOR SELECT 
TO authenticated 
USING (true);

-- 3. Tabela app_settings
DROP POLICY IF EXISTS "authenticated read safe operational settings" ON public.app_settings;

CREATE POLICY "authenticated_read_settings_v3"
ON public.app_settings
FOR SELECT
TO authenticated
USING (
  private.has_role(auth.uid(), 'gestor'::public.app_role)
  OR private.has_role(auth.uid(), 'admin'::public.app_role)
  OR key LIKE 'tarefas_extras_items:%'
  OR key = 'tarefas_extras_periodicity'
  OR key = 'reset_turno_password'
  OR key LIKE 'manutencao_areas_comuns_%'
  OR key LIKE 'manutencao_quartos_%'
  OR key = 'manutencao_areas_comuns'
);

-- 4. Garantir consistência de dados
UPDATE public.preventive_tasks SET property = 'Botafogo' WHERE property IS NULL;
