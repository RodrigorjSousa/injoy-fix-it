CREATE TABLE public.mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remetente_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  destinatario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conteudo TEXT NOT NULL,
  lida_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mensagens_par ON public.mensagens (
  LEAST(remetente_id, destinatario_id),
  GREATEST(remetente_id, destinatario_id),
  created_at DESC
);
CREATE INDEX idx_mensagens_dest ON public.mensagens (destinatario_id, lida_em);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mensagens TO authenticated;
GRANT ALL ON public.mensagens TO service_role;

ALTER TABLE public.mensagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ver minhas mensagens" ON public.mensagens
  FOR SELECT TO authenticated
  USING (auth.uid() = remetente_id OR auth.uid() = destinatario_id);

CREATE POLICY "enviar como eu" ON public.mensagens
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = remetente_id);

CREATE POLICY "marcar como lida (destinatario)" ON public.mensagens
  FOR UPDATE TO authenticated
  USING (auth.uid() = destinatario_id)
  WITH CHECK (auth.uid() = destinatario_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.mensagens;
ALTER TABLE public.mensagens REPLICA IDENTITY FULL;

-- Permitir que usuários autenticados vejam profiles para listar contatos
DROP POLICY IF EXISTS "profiles visiveis para autenticados" ON public.profiles;
CREATE POLICY "profiles visiveis para autenticados" ON public.profiles
  FOR SELECT TO authenticated USING (true);