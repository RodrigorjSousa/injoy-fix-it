UPDATE public.funcionarios
SET categorias = ARRAY['Ar condicionado','Elétrica','Automação']::text[],
    telas_permitidas = ARRAY['painel','servicos','manutencao','preventiva','chat']::text[]
WHERE id = '80d696e7-dd4a-4072-aa4f-68d73729c3b8';