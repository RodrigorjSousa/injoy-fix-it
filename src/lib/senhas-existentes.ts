// Passar para os portões TTLock as senhas que os hóspedes já usam (criadas no app da
// Tuya). Uma linha por hóspede: "quarto senha saída [nome]", ex.: "113 482913 22/11 Maria".
// Puro (sem rede), com testes em senhas-existentes.test.ts.

export type LinhaSenha = {
  linha: number;
  quarto: string;
  senha: string;
  /** Data de saída AAAA-MM-DD. */
  saida: string;
  nome: string;
};

export type ErroLinha = { linha: number; texto: string; erro: string };

const pad = (n: number) => String(n).padStart(2, "0");

/** dd/mm, dd/mm/aa ou dd/mm/aaaa. Sem ano: o próximo dd/mm a partir de hoje. */
export function lerData(texto: string, hoje: string): string | null {
  const m = texto.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
  let ano = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : Number(hoje.slice(0, 4));
  let data = `${ano}-${pad(mes)}-${pad(dia)}`;
  if (!m[3] && data < hoje) {
    ano += 1;
    data = `${ano}-${pad(mes)}-${pad(dia)}`;
  }
  const d = new Date(`${data}T12:00:00Z`);
  if (d.getUTCDate() !== dia) return null;
  return data;
}

export function lerLinhas(texto: string, hoje: string): { ok: LinhaSenha[]; erros: ErroLinha[] } {
  const ok: LinhaSenha[] = [];
  const erros: ErroLinha[] = [];
  texto.split(/\r?\n/).forEach((bruta, i) => {
    const t = bruta.trim();
    if (!t) return;
    const partes = t.split(/[\s;,\t]+/);
    const [quarto, senhaBruta, dataBruta, ...resto] = partes;
    const senha = (senhaBruta ?? "").replace(/#$/, "");
    const erro = (msg: string) => erros.push({ linha: i + 1, texto: t, erro: msg });
    if (!quarto || !/^\d{1,4}$/.test(quarto)) return erro("quarto inválido");
    if (!/^\d{4,9}$/.test(senha)) return erro("senha deve ter de 4 a 9 números");
    const saida = lerData(dataBruta ?? "", hoje);
    if (!saida) return erro("data de saída inválida (use dd/mm)");
    if (saida < hoje) return erro("data de saída já passou");
    if (ok.some((o) => o.senha === senha)) return erro("senha repetida em outra linha");
    ok.push({ linha: i + 1, quarto: quarto.padStart(3, "0"), senha, saida, nome: resto.join(" ").trim() });
  });
  return { ok, erros };
}

/** Fim da validade: a hora do check-out no dia da saída (horário de SP). */
export const fimDaSenha = (saida: string, horaCheckout = "12:00") => new Date(`${saida}T${horaCheckout}:00-03:00`).getTime();
