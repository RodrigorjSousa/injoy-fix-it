// Detalhe de cada indicador do Saldo da Lavanderia (o que aparece ao tocar no card).
// Usa as mesmas regras de `calcularSaldo` / `difItem` / `faltasNaEntrega`, para o detalhe sempre bater
// com o número do card.
import {
  calcularSaldo,
  difItem,
  faltasNaEntrega,
  INICIO_SALDO,
  talaoAberto,
  type Peca,
  type Talao,
} from "./lavanderia";

export type IndicadorLav = "agora" | "coleta" | "relave" | "descontos" | "pagar";

export type LinhaPeca = { peca: string; qtd: number; valor?: number };
export type LinhaTalao = { numero: string; data: string; texto: string; qtd: number };

export type DetalheLav = {
  porPeca: LinhaPeca[];
  porTalao: LinhaTalao[];
  total: number;
  valorTotal?: number;
};

const r2 = (v: number) => Math.round(v * 100) / 100;

export function detalheIndicador(
  tipo: IndicadorLav,
  taloes: Talao[],
  pecas: Peca[],
  inicio = INICIO_SALDO,
): DetalheLav {
  const nome = new Map(pecas.map((p) => [p.id, p.nome]));
  const doPeriodo = taloes
    .filter((t) => t.data_coleta >= inicio)
    .sort((a, b) => a.data_coleta.localeCompare(b.data_coleta) || a.numero.localeCompare(b.numero));
  const saldo = calcularSaldo(taloes, pecas, inicio);
  const ordenar = (l: LinhaPeca[]) => l.filter((x) => x.qtd !== 0).sort((a, b) => b.qtd - a.qtd);

  if (tipo === "descontos") {
    // Mesma base do card "C · Descontos" (faltasNaEntrega sobre todos os talões carregados).
    const faltas = faltasNaEntrega(taloes, pecas);
    const porPeca = ordenar(faltas.map((f) => ({ peca: f.peca.nome, qtd: f.qtd, valor: f.valor })));
    const porTalao: LinhaTalao[] = [];
    const todos = [...taloes].sort((a, b) => a.data_coleta.localeCompare(b.data_coleta));
    for (const t of todos) {
      if (talaoAberto(t)) continue;
      const itens = t.itens.map((i) => ({ i, d: difItem(i) })).filter(({ d }) => d.desconto > 0);
      if (!itens.length) continue;
      porTalao.push({
        numero: t.numero,
        data: t.data_coleta,
        qtd: itens.reduce((s, { d }) => s + d.desconto, 0),
        texto: itens
          .map(
            ({ i, d }) =>
              `${d.desconto} ${nome.get(i.peca_id) ?? "peça"} (saiu ${d.saidaLav}, contado ${d.contado})`,
          )
          .join(", "),
      });
    }
    return {
      porPeca,
      porTalao,
      total: porPeca.reduce((s, l) => s + l.qtd, 0),
      valorTotal: r2(faltas.reduce((s, f) => s + f.valor, 0)),
    };
  }

  if (tipo === "pagar") {
    const porPeca = ordenar(
      saldo.map((l) => ({
        peca: l.peca.nome,
        qtd: l.aPagar,
        valor: r2(l.aPagar * (Number(l.peca.preco) || 0)),
      })),
    );
    return {
      porPeca,
      porTalao: [],
      total: porPeca.reduce((s, l) => s + l.qtd, 0),
      valorTotal: r2(porPeca.reduce((s, l) => s + (l.valor ?? 0), 0)),
    };
  }

  if (tipo === "agora") {
    const porPeca = ordenar(saldo.map((l) => ({ peca: l.peca.nome, qtd: l.saldo })));
    const porTalao = doPeriodo
      .filter((t) => talaoAberto(t))
      .map((t) => ({
        numero: t.numero,
        data: t.data_coleta,
        qtd: t.itens.reduce((s, i) => s + (Number(i.saida_hotel) || 0), 0),
        texto: t.itens
          .filter((i) => Number(i.saida_hotel) > 0)
          .map((i) => `${i.saida_hotel} ${nome.get(i.peca_id) ?? "peça"}`)
          .join(", "),
      }));
    return { porPeca, porTalao, total: porPeca.reduce((s, l) => s + l.qtd, 0) };
  }

  // coleta (A) e relave (B): itens de talões já devolvidos com diferença.
  const campo = tipo === "coleta" ? "difColeta" : "relave";
  const porPeca = ordenar(
    saldo.map((l) => ({
      peca: l.peca.nome,
      qtd: tipo === "coleta" ? Math.abs(l.difColeta) : Math.max(0, l.relavePendente),
    })),
  );
  const porTalao: LinhaTalao[] = [];
  for (const t of doPeriodo) {
    if (talaoAberto(t)) continue;
    const itens = t.itens.map((i) => ({ i, d: difItem(i) })).filter(({ d }) => d[campo] !== 0);
    if (!itens.length) continue;
    porTalao.push({
      numero: t.numero,
      data: t.data_coleta,
      qtd: itens.reduce(
        (s, { d }) => s + (tipo === "coleta" ? Math.abs(d.difColeta) : d.relave),
        0,
      ),
      texto: itens
        .map(({ i, d }) =>
          tipo === "coleta"
            ? `${nome.get(i.peca_id) ?? "peça"}: hotel ${d.saidaHotel}, lavanderia ${d.entLav}`
            : `${d.relave > 0 ? "ficou" : "voltou"} ${Math.abs(d.relave)} ${nome.get(i.peca_id) ?? "peça"}`,
        )
        .join(", "),
    });
  }
  return { porPeca, porTalao, total: porPeca.reduce((s, l) => s + l.qtd, 0) };
}
