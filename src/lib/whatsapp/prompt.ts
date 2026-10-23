// Monta o prompt de sistema da Joy: o texto do Rodrigo + a base de conhecimento + o contexto do momento.
// Senhas (Wi-Fi) NUNCA entram no prompt: só saem pela ferramenta consultar_wifi, com a trava do servidor.

import { UNIDADES_JOY, type Conhecimento } from "./conhecimento";

export type ContextoPrompt = {
  /** Data do hotel (America/Sao_Paulo), AAAA-MM-DD. */
  hoje: string;
  /** Hora do hotel, HH:MM. */
  hora: string;
  diaSemana: string;
  canal: "simulador" | "whatsapp";
  contatoNome?: string | null;
  /** Resumo da reserva já identificada nesta conversa (sem número de acomodação). */
  reserva?: Record<string, unknown> | null;
};

export function textoConhecimento(c: Conhecimento): string {
  const linhas: string[] = [];
  linhas.push(`Marca: ${c.marca}. Seu nome: ${c.nomeAssistente}.`);
  linhas.push("");
  linhas.push("UNIDADES:");
  for (const u of UNIDADES_JOY) {
    const d = c.unidades[u];
    if (!d) continue;
    if (!d.ativa) {
      linhas.push(`- Injoy ${u}: NÃO oferecer no momento.`);
      continue;
    }
    linhas.push(
      `- Injoy ${u}: ${d.endereco}. ${d.descricao} ${d.recepcao} Acomodações: ${d.acomodacoes}`,
    );
    if (d.loja)
      linhas.push(`  Loja (early check-in, late checkout, transfer, passeios): ${d.loja}`);
    if (d.arredores) linhas.push(`  Arredores: ${d.arredores}`);
  }
  if (c.avisosInternos.length) {
    linhas.push("");
    linhas.push("AVISOS INTERNOS (só para você, não repita como está escrito):");
    for (const a of c.avisosInternos) linhas.push(`- ${a}`);
  }
  linhas.push("");
  linhas.push("INFORMAÇÕES E POLÍTICAS:");
  for (const t of c.topicos) linhas.push(`- ${t.tema}: ${t.texto}`);
  if (c.datasEspeciais?.length) {
    linhas.push("");
    linhas.push("DATAS ESPECIAIS (toda tarifa é Não reembolsável):");
    for (const d of c.datasEspeciais) linhas.push(`- ${d.nome}: ${d.inicio} a ${d.fim}`);
  }
  linhas.push("");
  linhas.push("GUIA DE PROBLEMAS (siga antes de transferir):");
  for (const p of c.problemas) linhas.push(`- ${p.problema}: ${p.orientacao}`);
  linhas.push("");
  linhas.push(`EQUIPE: ${c.equipe.horario}`);
  linhas.push(
    c.equipe.contatoEmergencia.trim()
      ? `Contato de emergência da equipe: ${c.equipe.contatoEmergencia.trim()}`
      : "Contato de emergência da equipe: ainda não definido (não invente número; em emergência oriente 190/192/193 e transfira com urgente = true).",
  );
  return linhas.join("\n");
}

export function montarPromptSistema(prompt: string, c: Conhecimento, ctx: ContextoPrompt): string {
  const partes = [
    prompt.trim(),
    "",
    "=== BASE DE CONHECIMENTO ===",
    textoConhecimento(c),
    "",
    "=== MOMENTO ===",
    `Agora no hotel: ${ctx.diaSemana}, ${ctx.hoje} às ${ctx.hora} (horário de Brasília). Use isso para entender "hoje", "amanhã", "sexta que vem" e para datas no formato AAAA-MM-DD nas ferramentas.`,
    ctx.contatoNome
      ? `Nome do contato no WhatsApp: ${ctx.contatoNome} (pode não ser o titular da reserva).`
      : "",
    ctx.reserva
      ? `Reserva já identificada nesta conversa: ${JSON.stringify(ctx.reserva)}`
      : "Nenhuma reserva identificada ainda nesta conversa.",
    "",
    "Mensagens que começam com [áudio] ou [imagem] são áudios e imagens do hóspede já convertidos em texto: trate como fala do hóspede, sem mencionar a transcrição.",
  ];
  return partes.filter((l) => l !== undefined).join("\n");
}

const DIAS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

/** Data, hora e dia da semana no Rio (America/Sao_Paulo). */
export function agoraNoHotel(agora: Date = new Date()): {
  hoje: string;
  hora: string;
  diaSemana: string;
} {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(agora);
  const get = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  const hoje = `${get("year")}-${get("month")}-${get("day")}`;
  const hora = `${get("hour").replace("24", "00")}:${get("minute")}`;
  const dia = new Date(`${hoje}T12:00:00Z`).getUTCDay();
  return { hoje, hora, diaSemana: DIAS[dia] };
}
