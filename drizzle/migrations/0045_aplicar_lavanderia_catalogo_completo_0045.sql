-- 0045 — Lavanderia: catálogo completo de peças (todas as linhas do talão Clean Soft).
--
-- A 0043 criava só as 21 peças da planilha de cobrança. Agora public.lav_preparar()
-- completa o catálogo com as demais peças do talão (sem apagar nem alterar nada que o
-- gestor já editou). Peças sem preço na tabela da Clean Soft entram com R$ 0,00 no grupo
-- "Outros (sem preço na tabela)" — o gestor ajusta em Lavanderia › Peças e preços.
--
-- Sem INSERT no nível do arquivo (o Lovable recusa): os dados entram pela função,
-- que o app chama. Uma única vez por versão do catálogo (tabela lav_config).
-- Depende da 0043. Pode ser aplicada mais de uma vez sem problema.

CREATE TABLE IF NOT EXISTS public.lav_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  catalogo_versao integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lav_config TO authenticated;
GRANT ALL ON public.lav_config TO service_role;
ALTER TABLE public.lav_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lav_config_ler" ON public.lav_config;
CREATE POLICY "lav_config_ler" ON public.lav_config FOR SELECT TO authenticated
  USING (private.lav_pode_lancar(auth.uid()));

CREATE OR REPLACE FUNCTION public.lav_preparar()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_versao integer;
  c_versao constant integer := 2;
BEGIN
  IF NOT private.lav_pode_lancar(auth.uid()) THEN
    RAISE EXCEPTION 'Seu login não tem acesso à lavanderia.';
  END IF;
  SELECT catalogo_versao INTO v_versao FROM public.lav_config WHERE id = 1;
  IF coalesce(v_versao, 0) >= c_versao THEN
    RETURN;
  END IF;

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

  INSERT INTO public.lav_config (id, catalogo_versao) VALUES (1, c_versao)
  ON CONFLICT (id) DO UPDATE SET catalogo_versao = EXCLUDED.catalogo_versao, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.lav_preparar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lav_preparar() TO authenticated;
