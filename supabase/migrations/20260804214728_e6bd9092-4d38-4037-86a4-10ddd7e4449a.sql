
-- Adiciona coluna responsavel_nome e concluido_em na tabela chamados para histórico
ALTER TABLE public.chamados ADD COLUMN IF NOT EXISTS responsavel_nome TEXT;
ALTER TABLE public.chamados ADD COLUMN IF NOT EXISTS concluido_em TIMESTAMPTZ;

-- Função para atualizar responsavel_nome com base no responsavel_id antes de inserir/atualizar
CREATE OR REPLACE FUNCTION public.sync_chamado_responsavel_nome()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.responsavel_id IS NOT NULL THEN
    SELECT nome INTO NEW.responsavel_nome FROM public.funcionarios WHERE id = NEW.responsavel_id;
  END IF;
  
  IF NEW.status = 'Concluído' AND (OLD.status IS NULL OR OLD.status != 'Concluído') THEN
    NEW.concluido_em = now();
  ELSIF NEW.status != 'Concluído' THEN
    NEW.concluido_em = NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_sync_chamado_responsavel ON public.chamados;
CREATE TRIGGER tr_sync_chamado_responsavel
  BEFORE INSERT OR UPDATE ON public.chamados
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_chamado_responsavel_nome();

-- Grant permissões
GRANT UPDATE(responsavel_nome, concluido_em) ON public.chamados TO authenticated;
