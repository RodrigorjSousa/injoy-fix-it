-- 0109 — Lavanderia: preço por unidade e Uber no talão (23/11/2026)
--
-- 1) lav_pecas_unidade: grupo da fatura e preço de cada peça POR UNIDADE. A Clean Soft cobra
--    Botafogo com outra tabela (e outras colunas) que Ipanema. Sem linha para a unidade, vale o
--    grupo/preço do catálogo (lav_pecas).
-- 2) lav_taloes.uber_valor: Uber que a Clean Soft cobra no talão quando a roupa vem com urgência.
--    Só o gestor grava (RPC lav_definir_uber). Entra no fechamento do mês.
-- 3) lav_preparar v4: preenche uma vez Ipanema (cópia do catálogo atual) e Botafogo (tabela da
--    fatura de outubro/2026), sem sobrescrever o que já existir.
-- Idempotente: pode ser aplicada de novo sem erro.

CREATE TABLE IF NOT EXISTS public.lav_pecas_unidade (
  peca_id uuid NOT NULL REFERENCES public.lav_pecas(id) ON DELETE CASCADE,
  unidade text NOT NULL CHECK (unidade IN ('Botafogo', 'Ipanema')),
  grupo_fatura text NOT NULL,
  preco numeric(10,2) NOT NULL DEFAULT 0 CHECK (preco >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (peca_id, unidade)
);
DROP TRIGGER IF EXISTS lav_pecas_unidade_updated_at ON public.lav_pecas_unidade;
CREATE TRIGGER lav_pecas_unidade_updated_at BEFORE UPDATE ON public.lav_pecas_unidade
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lav_pecas_unidade TO authenticated;
GRANT ALL ON public.lav_pecas_unidade TO service_role;
ALTER TABLE public.lav_pecas_unidade ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lav_pecas_unidade_ler" ON public.lav_pecas_unidade;
CREATE POLICY "lav_pecas_unidade_ler" ON public.lav_pecas_unidade FOR SELECT TO authenticated
  USING (private.lav_pode_lancar(auth.uid()));
DROP POLICY IF EXISTS "lav_pecas_unidade_gestor" ON public.lav_pecas_unidade;
CREATE POLICY "lav_pecas_unidade_gestor" ON public.lav_pecas_unidade FOR ALL TO authenticated
  USING (private.lav_eh_gestor(auth.uid())) WITH CHECK (private.lav_eh_gestor(auth.uid()));

ALTER TABLE public.lav_taloes ADD COLUMN IF NOT EXISTS uber_valor numeric(10,2);
ALTER TABLE public.lav_taloes DROP CONSTRAINT IF EXISTS lav_taloes_uber_valor_check;
ALTER TABLE public.lav_taloes ADD CONSTRAINT lav_taloes_uber_valor_check
  CHECK (uber_valor IS NULL OR uber_valor >= 0);

CREATE OR REPLACE FUNCTION public.lav_definir_uber(p_talao_id uuid, p_valor numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.lav_eh_gestor(auth.uid()) THEN
    RAISE EXCEPTION 'Só o gestor registra o Uber do talão.';
  END IF;
  IF p_valor IS NOT NULL AND p_valor < 0 THEN
    RAISE EXCEPTION 'Valor do Uber inválido.';
  END IF;
  UPDATE public.lav_taloes
     SET uber_valor = CASE WHEN coalesce(p_valor, 0) = 0 THEN NULL ELSE round(p_valor, 2) END
   WHERE id = p_talao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Talão não encontrado.';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.lav_definir_uber(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lav_definir_uber(uuid, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.lav_preparar()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_versao integer;
  c_versao constant integer := 4;
BEGIN
  IF NOT private.lav_pode_lancar(auth.uid()) THEN
    RAISE EXCEPTION 'Seu login não tem acesso à lavanderia.';
  END IF;
  SELECT catalogo_versao INTO v_versao FROM public.lav_config WHERE id = 1;
  v_versao := coalesce(v_versao, 0);
  IF v_versao >= c_versao THEN
    RETURN;
  END IF;

  -- versão 2: catálogo completo do talão (igual à 0045)
  IF v_versao < 2 THEN
    INSERT INTO public.lav_pecas (ordem, nome, grupo_fatura, preco) VALUES
      -- tabela de cobrança da Clean Soft (mesmas da 0043)
      (10,  'Protetor Travesseiro',      'Capa almofada / Prot. trav.',            9.46),
      (20,  'Capa de Almofada',          'Capa almofada / Prot. trav.',            9.46),
      (30,  'Pillow Top',                'Pillow top',                             55.00),
      (40,  'Cobertor / Manta',          'Cobertor / Colcha',                      10.37),
      (50,  'Edredom',                   'Edredom',                                10.37),
      (60,  'Fronha',                    'Fronha',                                 1.26),
      (70,  'Lençol Casal',              'Lençol casal / king',                    4.48),
      (80,  'Lençol King',               'Lençol casal / king',                    4.48),
      (90,  'Lençol Solteiro',           'Lençol solteiro',                        4.43),
      (100, 'Lençol Casal Elástico',     'Lençol casal elástico',                  4.68),
      (110, 'Lençol Solteiro Elástico',  'Lençol solteiro elástico',               4.64),
      (120, 'Piso',                      'Piso',                                   1.46),
      (130, 'Toalha Banho',              'Toalha banho',                           3.42),
      (140, 'Toalha Rosto',              'Toalha rosto',                           1.46),
      (150, 'Protetor Colchão Casal',    'Prot. colchão casal / saia',             6.15),
      (160, 'Protetor Colchão Solteiro', 'Prot. colchão casal / saia',             6.15),
      (170, 'Peseira',                   'Prot. colchão casal / saia',             6.15),
      (180, 'Tapete 1,50 x 2,00',        'Tapete 1,50 x 2,00',                     157.11),
      (190, 'Tapete Pequeno',            'Tapete pequeno / travesseiro / cortina', 21.68),
      (200, 'Travesseiro',               'Tapete pequeno / travesseiro / cortina', 21.68),
      (210, 'Pano de Copa',              'Pano de copa',                           1.36),
      -- demais linhas do talão (sem preço na tabela da Clean Soft)
      (142, 'Toalha com Logo',           'Outros (sem preço na tabela)',           0),
      (144, 'Roupão',                    'Outros (sem preço na tabela)',           0),
      (201, 'Capa de Sofá',              'Outros (sem preço na tabela)',           0),
      (202, 'Capa de Poltrona',          'Outros (sem preço na tabela)',           0),
      (203, 'Capa de Pranchão',          'Outros (sem preço na tabela)',           0),
      (204, 'Forro de Capa',             'Outros (sem preço na tabela)',           0),
      (205, 'Toalha de Mesa Retangular', 'Outros (sem preço na tabela)',           0),
      (206, 'Toalha de Mesa Redonda',    'Outros (sem preço na tabela)',           0),
      (207, 'Lenço de Seda',             'Outros (sem preço na tabela)',           0),
      (208, 'Guardanapo de Linho',       'Outros (sem preço na tabela)',           0),
      (209, 'Guardanapo',                'Outros (sem preço na tabela)',           0),
      (211, 'Cortina (m²)',              'Outros (sem preço na tabela)',           0),
      (212, 'Tapete (m²)',               'Outros (sem preço na tabela)',           0),
      (220, 'Pano de Chão',              'Outros (sem preço na tabela)',           0)
    ON CONFLICT (nome) DO NOTHING;
  END IF;

  -- versão 3: Saída Lav. em branco (gravada como 0) passa a valer o Contado
  IF v_versao < 3 THEN
    UPDATE public.lav_talao_itens i
       SET saida_lav = i.guardado
      FROM public.lav_taloes t
     WHERE t.id = i.talao_id
       AND t.retorno_data IS NOT NULL
       AND i.saida_lav = 0
       AND coalesce(i.guardado, 0) > 0;
  END IF;

  -- versão 4: grupo e preço por unidade (Ipanema = catálogo atual; Botafogo = fatura de out/2026)
  IF v_versao < 4 THEN
    INSERT INTO public.lav_pecas_unidade (peca_id, unidade, grupo_fatura, preco)
    SELECT id, 'Ipanema', grupo_fatura, preco FROM public.lav_pecas
    ON CONFLICT (peca_id, unidade) DO NOTHING;

    INSERT INTO public.lav_pecas_unidade (peca_id, unidade, grupo_fatura, preco)
    SELECT p.id, 'Botafogo', b.grupo, b.preco
      FROM (VALUES
        ('Capa de Almofada',          'Capa almofada / blusa',             8.77),
        ('Pillow Top',                'Pillow top',                        55.00),
        ('Protetor Travesseiro',      'Prot. travesseiro',                 5.25),
        ('Cobertor / Manta',          'Cobertor',                          9.60),
        ('Edredom',                   'Edredom',                           9.60),
        ('Fronha',                    'Fronha',                            2.43),
        ('Lençol Casal',              'Lençol casal / king',               4.14),
        ('Lençol King',               'Lençol casal / king',               4.14),
        ('Lençol Solteiro',           'Lençol solteiro',                   4.10),
        ('Lençol Casal Elástico',     'Lençol casal elástico',             4.33),
        ('Lençol Solteiro Elástico',  'Lençol solteiro elástico',          4.30),
        ('Peseira',                   'Peseira / saia',                    8.85),
        ('Protetor Colchão Casal',    'Protetor colchão casal / solteiro', 5.70),
        ('Protetor Colchão Solteiro', 'Protetor colchão casal / solteiro', 5.70),
        ('Travesseiro',               'Travesseiro / cortinas',            21.68),
        ('Cortina (m²)',              'Travesseiro / cortinas',            21.68),
        ('Piso',                      'Piso',                              1.35),
        ('Toalha Banho',              'Toalha banho',                      3.17),
        ('Toalha Rosto',              'Toalha rosto',                      1.35),
        ('Pano de Copa',              'Pano copa / chão',                  1.26),
        ('Pano de Chão',              'Pano copa / chão',                  1.26),
        ('Tapete Pequeno',            'Tapete pequeno',                    6.96),
        ('Tapete 1,50 x 2,00',        'Tapete 1,5 x 2,0',                  145.47)
      ) AS b(nome, grupo, preco)
      JOIN public.lav_pecas p ON p.nome = b.nome
    ON CONFLICT (peca_id, unidade) DO NOTHING;

    -- peças fora da tabela de Botafogo: mesmo grupo/preço do catálogo
    INSERT INTO public.lav_pecas_unidade (peca_id, unidade, grupo_fatura, preco)
    SELECT id, 'Botafogo', grupo_fatura, preco FROM public.lav_pecas
    ON CONFLICT (peca_id, unidade) DO NOTHING;
  END IF;

  INSERT INTO public.lav_config (id, catalogo_versao) VALUES (1, c_versao)
  ON CONFLICT (id) DO UPDATE SET catalogo_versao = EXCLUDED.catalogo_versao, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.lav_preparar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lav_preparar() TO authenticated;
