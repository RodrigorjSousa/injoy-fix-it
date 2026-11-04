-- Avaliação da arrumação pelas líderes das camareiras (Gleidiane/Maria) — botão "Avaliar arrumação".
-- Cada item do checklist recebe OK / Ajustar / Refazer; a nota 0–10 sai sozinha (OK=1, Ajustar=0,5, Refazer=0).
-- Erro tem descrição (e foto); "Refazer" avisa a camareira no celular.
-- Itens editáveis pelo gestor (Área do Gestor › Qualidade da arrumação). Os 7 itens iniciais entram pela
-- função `avaliacao_arrumacao_preparar()` (o Lovable recusa INSERT no arquivo). Fotos no bucket `inspections`
-- (a líder já pode enviar, 0097). Não mexe na bonificação. Idempotente.

CREATE TABLE IF NOT EXISTS public.avaliacao_arrumacao_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (length(btrim(nome)) > 0),
  descricao text,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avaliacao_arrumacao_itens TO authenticated;
GRANT ALL ON public.avaliacao_arrumacao_itens TO service_role;
ALTER TABLE public.avaliacao_arrumacao_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Equipe le itens da avaliacao" ON public.avaliacao_arrumacao_itens;
CREATE POLICY "Equipe le itens da avaliacao" ON public.avaliacao_arrumacao_itens
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()) OR private.eh_lider_camareiras(auth.uid()));
DROP POLICY IF EXISTS "Gestor edita itens da avaliacao" ON public.avaliacao_arrumacao_itens;
CREATE POLICY "Gestor edita itens da avaliacao" ON public.avaliacao_arrumacao_itens
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.avaliacoes_arrumacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property text NOT NULL CHECK (property IN ('Botafogo','Ipanema')),
  room_number text NOT NULL,
  -- serviço avaliado (room_housekeeping_history); null quando a líder escolheu a camareira na mão
  servico_id uuid,
  tarefa text,
  servico_concluido_em timestamptz,
  camareira_nome text NOT NULL CHECK (length(btrim(camareira_nome)) > 0),
  avaliadora_id uuid NOT NULL DEFAULT auth.uid(),
  avaliadora_nome text,
  nota numeric(4,2) NOT NULL CHECK (nota BETWEEN 0 AND 10),
  -- [{item_id, nome, status: ok|ajustar|refazer, obs, foto_path}]
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  refazer boolean NOT NULL DEFAULT false,
  elogio text,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS avaliacoes_arrumacao_data_idx ON public.avaliacoes_arrumacao (created_at DESC);
CREATE INDEX IF NOT EXISTS avaliacoes_arrumacao_quarto_idx ON public.avaliacoes_arrumacao (property, room_number, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avaliacoes_arrumacao TO authenticated;
GRANT ALL ON public.avaliacoes_arrumacao TO service_role;
ALTER TABLE public.avaliacoes_arrumacao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lider e gestor leem avaliacoes" ON public.avaliacoes_arrumacao;
CREATE POLICY "Lider e gestor leem avaliacoes" ON public.avaliacoes_arrumacao
  FOR SELECT TO authenticated
  USING (
    private.eh_lider_camareiras(auth.uid())
    OR private.has_role(auth.uid(), 'gestor'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
  );
DROP POLICY IF EXISTS "Lider e gestor avaliam" ON public.avaliacoes_arrumacao;
CREATE POLICY "Lider e gestor avaliam" ON public.avaliacoes_arrumacao
  FOR INSERT TO authenticated
  WITH CHECK (
    avaliadora_id = auth.uid() AND (
      private.eh_lider_camareiras(auth.uid())
      OR private.has_role(auth.uid(), 'gestor'::app_role)
      OR private.has_role(auth.uid(), 'admin'::app_role)
    )
  );
DROP POLICY IF EXISTS "Gestor corrige avaliacoes" ON public.avaliacoes_arrumacao;
CREATE POLICY "Gestor corrige avaliacoes" ON public.avaliacoes_arrumacao
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role));

-- A líder precisa ver o histórico de serviços para saber quem arrumou o quarto.
DROP POLICY IF EXISTS "Lider camareiras ve historico de limpeza" ON public.room_housekeeping_history;
CREATE POLICY "Lider camareiras ve historico de limpeza" ON public.room_housekeeping_history
  FOR SELECT TO authenticated USING (private.eh_lider_camareiras(auth.uid()));

-- Itens iniciais (só quando a lista está vazia). Chamada pelo app.
CREATE OR REPLACE FUNCTION public.avaliacao_arrumacao_preparar()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (private.is_staff(auth.uid()) OR private.eh_lider_camareiras(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF EXISTS (SELECT 1 FROM public.avaliacao_arrumacao_itens) THEN RETURN; END IF;
  INSERT INTO public.avaliacao_arrumacao_itens (nome, descricao, ordem) VALUES
    ('Cama', 'Lençol, fronha, edredom esticados e limpos', 1),
    ('Banheiro', 'Vaso, box, pia, espelho e ralo', 2),
    ('Piso e poeira', 'Cantos, embaixo da cama, móveis e rodapé', 3),
    ('Enxoval e amenities', 'Toalhas, sabonete, shampoo, papel higiênico', 4),
    ('Lixo e frigobar', 'Lixeiras vazias com saco; frigobar limpo e conferido', 5),
    ('Cheiro e ventilação', 'Quarto arejado, sem cheiro', 6),
    ('Detalhes', 'Controle, cortina, luzes, cabides, mesa', 7);
END $$;
REVOKE EXECUTE ON FUNCTION public.avaliacao_arrumacao_preparar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.avaliacao_arrumacao_preparar() TO authenticated;

-- "Refazer": notificação no celular da camareira avaliada (cadastro pelo nome).
CREATE OR REPLACE FUNCTION private.tg_avaliacao_arrumacao_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_users uuid[];
BEGIN
  IF NOT NEW.refazer THEN RETURN NEW; END IF;
  SELECT array_agg(DISTINCT f.user_id) INTO v_users
  FROM public.funcionarios f
  WHERE f.user_id IS NOT NULL AND lower(btrim(f.nome)) = lower(btrim(NEW.camareira_nome));
  IF coalesce(array_length(v_users, 1), 0) > 0 THEN
    PERFORM private.enqueue_push_notification('arrumacao_refazer', jsonb_build_object(
      'id', NEW.id, 'property', NEW.property, 'room_number', NEW.room_number,
      'avaliadora_nome', NEW.avaliadora_nome, 'destinatarios', to_jsonb(v_users)
    ));
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION private.tg_avaliacao_arrumacao_push() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS avaliacoes_arrumacao_push ON public.avaliacoes_arrumacao;
CREATE TRIGGER avaliacoes_arrumacao_push AFTER INSERT ON public.avaliacoes_arrumacao
FOR EACH ROW EXECUTE FUNCTION private.tg_avaliacao_arrumacao_push();
