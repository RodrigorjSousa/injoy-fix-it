// Quartos de cada unidade e filtro "Quartos" do Painel de chamados.
// O chamado guarda o local no começo da descrição: "[URGENTE] [Quarto 104] ..." ou "[Área comum] ...".

export type UnidadeChamado = "Botafogo" | "Ipanema";

export const AREA_COMUM = "Área comum";

/** Quartos que aparecem para escolher ao abrir chamado e no filtro do Painel. */
export const QUARTOS_POR_UNIDADE: Record<UnidadeChamado, string[]> = {
  Botafogo: [
    "01",
    "02",
    "03",
    "05",
    "06",
    "107",
    "108",
    "109",
    "110",
    "111",
    "112",
    "113",
    "114",
    "115",
    "117",
    "118",
    "301",
    "401",
    "501",
    AREA_COMUM,
  ],
  Ipanema: [
    "01",
    "02",
    "103",
    "104",
    "205",
    "206",
    "307",
    "308",
    "309",
    "410",
    "411",
    "412",
    AREA_COMUM,
  ],
};

/** "APT 001", "1", "01" → "1"; textos sem número ficam em maiúsculas. */
export function chaveQuarto(v: string | null | undefined): string {
  const s = String(v ?? "").trim();
  const digitos = s.replace(/\D+/g, "");
  if (digitos) return digitos.replace(/^0+/, "") || "0";
  return s.toUpperCase();
}

/** Local do chamado: número do quarto, "Área comum" ou null (chamado sem local). */
export function localDoChamado(descricao: string): string | null {
  const texto = String(descricao ?? "");
  if (/\[\s*[áa]rea\s+comum\s*\]/i.test(texto)) return AREA_COMUM;
  const m = texto.match(/\[\s*(?:Quarto|APT)\s+([^\]]+)\]/i);
  return m ? m[1].trim() : null;
}

export function chamadoDoQuarto(descricao: string, quarto: string): boolean {
  const local = localDoChamado(descricao);
  if (!local) return false;
  if (quarto === AREA_COMUM || local === AREA_COMUM) return local === quarto;
  return chaveQuarto(local) === chaveQuarto(quarto);
}

export type FiltroPainel = {
  unidade: UnidadeChamado | "todas";
  categoria: string | "todas";
  /** Quarto escolhido (só vale com unidade escolhida). Com quarto, mostra só os chamados abertos. */
  quarto: string | null;
  soUrgentes?: boolean;
};

type ChamadoFiltravel = { unidade: string; categoria: string; descricao: string; status: string };

export function filtrarChamadosPainel<T extends ChamadoFiltravel>(
  chamados: T[],
  f: FiltroPainel,
  ehUrgente: (c: T) => boolean = () => true,
): T[] {
  const quarto = f.unidade !== "todas" ? f.quarto : null;
  return chamados.filter(
    (c) =>
      (f.unidade === "todas" || c.unidade === f.unidade) &&
      (f.categoria === "todas" || c.categoria === f.categoria) &&
      (!f.soUrgentes || ehUrgente(c)) &&
      (!quarto || (c.status !== "Concluído" && chamadoDoQuarto(c.descricao, quarto))),
  );
}
