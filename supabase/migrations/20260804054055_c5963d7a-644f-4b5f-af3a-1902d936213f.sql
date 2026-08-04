-- Create table for reception cash control
CREATE TABLE IF NOT EXISTS public.recepcao_caixa_movimentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property public.unidade NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('in', 'out')),
    reason TEXT NOT NULL,
    performed_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Grant access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recepcao_caixa_movimentos TO authenticated;
GRANT ALL ON public.recepcao_caixa_movimentos TO service_role;

-- Enable RLS
ALTER TABLE public.recepcao_caixa_movimentos ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Enable all for authenticated users"
ON public.recepcao_caixa_movimentos
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
