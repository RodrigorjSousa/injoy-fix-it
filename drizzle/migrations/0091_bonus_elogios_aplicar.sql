-- Bonificação › Pagamento: elogio direto a um funcionário ("a Julia foi ótima no atendimento").
-- Cada elogio vale o "Bônus por elogio nominal" das Regras (config_bonificacao.valor_elogio, ex.: R$ 20)
-- para a pessoa elogiada. O gestor marca quem foi elogiado em cada avaliação (avaliacao_ref) ou lança
-- um elogio avulso (Booking, Google...). Sem inserção de dados. Idempotente.

CREATE TABLE IF NOT EXISTS public.bonus_elogios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL,
  unidade text NOT NULL CHECK (unidade IN ('Botafogo','Ipanema')),
  funcionario_id uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  -- avaliacao_id (ou id do registro) da avaliação da Bonificação; null = elogio avulso
  avaliacao_ref uuid,
  nome_hospede text,
  comentario text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bonus_elogios_avaliacao_pessoa_uidx
  ON public.bonus_elogios (avaliacao_ref, funcionario_id) WHERE avaliacao_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS bonus_elogios_data_idx ON public.bonus_elogios (data);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonus_elogios TO authenticated;
GRANT ALL ON public.bonus_elogios TO service_role;
ALTER TABLE public.bonus_elogios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestor administra elogios" ON public.bonus_elogios;
CREATE POLICY "Gestor administra elogios" ON public.bonus_elogios
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "Funcionario ve os proprios elogios" ON public.bonus_elogios;
CREATE POLICY "Funcionario ve os proprios elogios" ON public.bonus_elogios
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = funcionario_id AND f.user_id = auth.uid()));