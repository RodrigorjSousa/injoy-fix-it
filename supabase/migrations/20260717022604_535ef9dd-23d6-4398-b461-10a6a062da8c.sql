
-- 1) ativos_ar: switch technician access from name matching to stable FK
ALTER TABLE public.ativos_ar ADD COLUMN IF NOT EXISTS tecnico_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL;

UPDATE public.ativos_ar a
SET tecnico_id = f.id
FROM public.funcionarios f
WHERE a.tecnico_id IS NULL
  AND a.tecnico IS NOT NULL
  AND lower(trim(f.nome)) = lower(trim(a.tecnico));

DROP POLICY IF EXISTS "Gestor ou tecnico AC visualiza ativos" ON public.ativos_ar;
DROP POLICY IF EXISTS "Gestor ou tecnico atribuido atualiza ativos" ON public.ativos_ar;

CREATE POLICY "Gestor ou tecnico AC visualiza ativos"
ON public.ativos_ar FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'gestor'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.funcionarios f
    WHERE f.user_id = auth.uid()
      AND f.id = ativos_ar.tecnico_id
      AND 'Ar condicionado' = ANY (f.categorias)
  )
);

CREATE POLICY "Gestor ou tecnico atribuido atualiza ativos"
ON public.ativos_ar FOR UPDATE TO authenticated
USING (
  private.has_role(auth.uid(), 'gestor'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.funcionarios f
    WHERE f.user_id = auth.uid()
      AND f.id = ativos_ar.tecnico_id
      AND 'Ar condicionado' = ANY (f.categorias)
  )
)
WITH CHECK (
  private.has_role(auth.uid(), 'gestor'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.funcionarios f
    WHERE f.user_id = auth.uid()
      AND f.id = ativos_ar.tecnico_id
      AND 'Ar condicionado' = ANY (f.categorias)
  )
);

-- Keep tecnico_id in sync when tecnico (name) is set/changed
CREATE OR REPLACE FUNCTION public.sync_ativos_ar_tecnico_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tecnico IS NOT NULL AND (NEW.tecnico_id IS NULL OR (TG_OP = 'UPDATE' AND NEW.tecnico IS DISTINCT FROM OLD.tecnico)) THEN
    SELECT f.id INTO NEW.tecnico_id
    FROM public.funcionarios f
    WHERE lower(trim(f.nome)) = lower(trim(NEW.tecnico))
    LIMIT 1;
  END IF;
  IF NEW.tecnico IS NULL THEN
    NEW.tecnico_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_ativos_ar_tecnico_id ON public.ativos_ar;
CREATE TRIGGER trg_sync_ativos_ar_tecnico_id
BEFORE INSERT OR UPDATE ON public.ativos_ar
FOR EACH ROW EXECUTE FUNCTION public.sync_ativos_ar_tecnico_id();

-- 2) cloudbeds_checkout_logs: allow gestor/admin to correct or remove erroneous entries
CREATE POLICY "Gestor admin update checkout logs"
ON public.cloudbeds_checkout_logs FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Gestor admin delete checkout logs"
ON public.cloudbeds_checkout_logs FOR DELETE TO authenticated
USING (private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role));

-- 3) laundry_debt: narrow INSERT — remove generic 'funcionario' role
DROP POLICY IF EXISTS "Staff can create laundry debt" ON public.laundry_debt;
CREATE POLICY "Staff can create laundry debt"
ON public.laundry_debt FOR INSERT TO authenticated
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'recepcao'::app_role)
  OR private.has_role(auth.uid(), 'camareira'::app_role)
);

DROP POLICY IF EXISTS "Staff can read laundry debt" ON public.laundry_debt;
CREATE POLICY "Staff can read laundry debt"
ON public.laundry_debt FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'recepcao'::app_role)
  OR private.has_role(auth.uid(), 'camareira'::app_role)
);
