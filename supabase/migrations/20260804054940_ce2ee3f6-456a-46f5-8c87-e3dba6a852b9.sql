CREATE TABLE IF NOT EXISTS public.recepcao_caixa_movimentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('in', 'out')),
    reason TEXT NOT NULL,
    performed_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.recepcao_caixa_movimentos TO authenticated;
GRANT ALL ON public.recepcao_caixa_movimentos TO service_role;

ALTER TABLE public.recepcao_caixa_movimentos ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'recepcao_caixa_movimentos' AND policyname = 'Admins can see all movements'
    ) THEN
        CREATE POLICY "Admins can see all movements" ON public.recepcao_caixa_movimentos
            FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'gestor'::public.app_role));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'recepcao_caixa_movimentos' AND policyname = 'Staff can see own property movements'
    ) THEN
        CREATE POLICY "Staff can see own property movements" ON public.recepcao_caixa_movimentos
            FOR SELECT TO authenticated USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'recepcao_caixa_movimentos' AND policyname = 'Authenticated users can insert movements'
    ) THEN
        CREATE POLICY "Authenticated users can insert movements" ON public.recepcao_caixa_movimentos
            FOR INSERT TO authenticated WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'recepcao_caixa_movimentos' AND policyname = 'Admins can delete movements'
    ) THEN
        CREATE POLICY "Admins can delete movements" ON public.recepcao_caixa_movimentos
            FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'gestor'::public.app_role));
    END IF;
END $$;