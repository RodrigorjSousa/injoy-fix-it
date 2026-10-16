-- Botão "Reservas" pisca até ser clicado quando entra reserva nova na lista de cobrança.
-- Guarda, por pessoa, quando ela abriu a tela Reservas pela última vez (vale em qualquer aparelho).
-- Pisca na cor da modalidade (NR check-in próximo, NR 8º dia, Standard) das reservas que entraram depois disso.
-- Idempotente. Sem FK para auth.users e sem INSERT de dados (o Lovable recusa).

CREATE TABLE IF NOT EXISTS public.reservas_vistas (
  user_id uuid PRIMARY KEY,
  visto_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.reservas_vistas TO authenticated;
GRANT ALL ON public.reservas_vistas TO service_role;
ALTER TABLE public.reservas_vistas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Cada um consulta quando viu as Reservas" ON public.reservas_vistas;
CREATE POLICY "Cada um consulta quando viu as Reservas" ON public.reservas_vistas
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Quantas reservas entraram na lista (das duas unidades) desde a última vez que a pessoa abriu a tela,
-- por modalidade. Quem não vê as Reservas recebe tudo zero.
CREATE OR REPLACE FUNCTION public.reservas_novidades()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT jsonb_build_object(
    'nr_checkin_proximo', count(*) FILTER (WHERE c.motivo = 'nr_checkin_proximo'),
    'nr_8o_dia', count(*) FILTER (WHERE c.motivo = 'nr_8o_dia'),
    'standard', count(*) FILTER (WHERE c.motivo = 'standard')
  )
  FROM public.reservas_cobranca c
  WHERE private.pode_ver_reservas(auth.uid())
    AND c.ativa
    AND c.motivo IS NOT NULL
    AND c.entrou_em > coalesce(
      (SELECT v.visto_em FROM public.reservas_vistas v WHERE v.user_id = auth.uid()),
      '-infinity'::timestamptz
    );
$$;
REVOKE ALL ON FUNCTION public.reservas_novidades() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservas_novidades() TO authenticated;

-- Chamado quando a pessoa abre a tela Reservas: o botão para de piscar.
CREATE OR REPLACE FUNCTION public.reservas_marcar_vistas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.pode_ver_reservas(auth.uid()) THEN
    RETURN;
  END IF;
  INSERT INTO public.reservas_vistas (user_id, visto_em) VALUES (auth.uid(), now())
  ON CONFLICT (user_id) DO UPDATE SET visto_em = now();
END;
$$;
REVOKE ALL ON FUNCTION public.reservas_marcar_vistas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservas_marcar_vistas() TO authenticated;