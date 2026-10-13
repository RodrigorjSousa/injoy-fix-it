-- Dashboard do gestor: rendimento por unidade.
-- Guarda as reservas do Cloudbeds como "noites vendidas" (uma linha por quarto por noite), para
-- calcular receita, ocupação, diária média, quartos mais/menos alugados e dias de alta/baixa.
-- Sem nome de hóspede. Leitura só gestor/admin; escrita só pela função dash_gravar_noites.
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.dash_reserva_noites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade text NOT NULL CHECK (unidade IN ('Botafogo', 'Ipanema')),
  data date NOT NULL,
  quarto text NOT NULL,
  tipo_quarto text,
  reservation_id text NOT NULL,
  valor numeric(12,2) NOT NULL DEFAULT 0,
  status text,
  origem text,
  checkin date,
  checkout date,
  reservado_em date,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dash_reserva_noites_key UNIQUE (unidade, data, quarto, reservation_id)
);
CREATE INDEX IF NOT EXISTS idx_dash_reserva_noites_unidade_data ON public.dash_reserva_noites (unidade, data);

CREATE TABLE IF NOT EXISTS public.dash_sincronizacoes (
  unidade text NOT NULL CHECK (unidade IN ('Botafogo', 'Ipanema')),
  mes date NOT NULL,
  noites integer NOT NULL DEFAULT 0,
  reservas integer NOT NULL DEFAULT 0,
  fonte text,
  avisos text,
  sincronizado_em timestamptz NOT NULL DEFAULT now(),
  sincronizado_por uuid,
  PRIMARY KEY (unidade, mes)
);

ALTER TABLE public.dash_reserva_noites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dash_sincronizacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gestor ve noites vendidas" ON public.dash_reserva_noites;
CREATE POLICY "Gestor ve noites vendidas" ON public.dash_reserva_noites
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Gestor ve sincronizacoes" ON public.dash_sincronizacoes;
CREATE POLICY "Gestor ve sincronizacoes" ON public.dash_sincronizacoes
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role));

-- Substitui as noites de uma unidade num mês pelo que veio do Cloudbeds (tudo ou nada).
CREATE OR REPLACE FUNCTION public.dash_gravar_noites(
  _unidade text,
  _mes date,
  _noites jsonb,
  _reservas integer DEFAULT 0,
  _fonte text DEFAULT NULL,
  _avisos text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_de date := date_trunc('month', _mes)::date;
  v_ate date := (date_trunc('month', _mes) + interval '1 month - 1 day')::date;
  v_qtd integer;
BEGIN
  IF NOT (private.has_role(v_uid, 'gestor'::public.app_role) OR private.has_role(v_uid, 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Somente o gestor atualiza o rendimento.';
  END IF;
  IF _unidade NOT IN ('Botafogo', 'Ipanema') THEN
    RAISE EXCEPTION 'Unidade inválida: %', _unidade;
  END IF;
  IF jsonb_typeof(coalesce(_noites, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Lista de noites inválida.';
  END IF;

  DELETE FROM public.dash_reserva_noites WHERE unidade = _unidade AND data BETWEEN v_de AND v_ate;

  INSERT INTO public.dash_reserva_noites
    (unidade, data, quarto, tipo_quarto, reservation_id, valor, status, origem, checkin, checkout, reservado_em, atualizado_em)
  SELECT DISTINCT ON (n.data, left(n.quarto, 60), left(n.reservation_id, 60))
         _unidade, n.data, left(n.quarto, 60), left(n.tipo_quarto, 80), left(n.reservation_id, 60),
         round(greatest(coalesce(n.valor, 0), 0), 2), left(n.status, 40), left(n.origem, 80),
         n.checkin, n.checkout, n.reservado_em, now()
  FROM jsonb_array_elements(coalesce(_noites, '[]'::jsonb)) WITH ORDINALITY AS e(item, ord)
  CROSS JOIN LATERAL jsonb_to_record(e.item) AS n(
    data date, quarto text, tipo_quarto text, reservation_id text, valor numeric,
    status text, origem text, checkin date, checkout date, reservado_em date)
  WHERE n.data BETWEEN v_de AND v_ate
    AND coalesce(n.quarto, '') <> ''
    AND coalesce(n.reservation_id, '') <> ''
  ORDER BY n.data, left(n.quarto, 60), left(n.reservation_id, 60), e.ord DESC -- repetida: vale a última
  ON CONFLICT (unidade, data, quarto, reservation_id) DO UPDATE
    SET valor = EXCLUDED.valor, tipo_quarto = EXCLUDED.tipo_quarto, status = EXCLUDED.status,
        origem = EXCLUDED.origem, checkin = EXCLUDED.checkin, checkout = EXCLUDED.checkout,
        reservado_em = EXCLUDED.reservado_em, atualizado_em = now();
  GET DIAGNOSTICS v_qtd = ROW_COUNT;

  INSERT INTO public.dash_sincronizacoes (unidade, mes, noites, reservas, fonte, avisos, sincronizado_em, sincronizado_por)
  VALUES (_unidade, v_de, v_qtd, coalesce(_reservas, 0), _fonte, _avisos, now(), v_uid)
  ON CONFLICT (unidade, mes) DO UPDATE
    SET noites = EXCLUDED.noites, reservas = EXCLUDED.reservas, fonte = EXCLUDED.fonte,
        avisos = EXCLUDED.avisos, sincronizado_em = EXCLUDED.sincronizado_em, sincronizado_por = EXCLUDED.sincronizado_por;

  RETURN v_qtd;
END;
$$;
REVOKE ALL ON FUNCTION public.dash_gravar_noites(text, date, jsonb, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dash_gravar_noites(text, date, jsonb, integer, text, text) TO authenticated;
