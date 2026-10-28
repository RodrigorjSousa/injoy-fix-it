// E3 — leitura do webhook da Meta (WhatsApp Cloud API) e regras de envio. Funções puras (meta.test.ts).
// Formato: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples

export type TipoMsg =
  | "texto"
  | "audio"
  | "imagem"
  | "video"
  | "documento"
  | "figurinha"
  | "localizacao"
  | "contato"
  | "reacao"
  | "outro";

export type MsgRecebida = {
  wamid: string;
  /** Número do contato, só dígitos (wa_id). */
  waId: string;
  nome: string | null;
  quando: string; // ISO
  tipo: TipoMsg;
  /** Texto para o histórico e para a IA ("[áudio]" enquanto não transcreve). */
  texto: string;
  midiaId: string | null;
  mime: string | null;
  phoneNumberId: string | null;
};

export type EcoEquipe = {
  wamid: string;
  /** Para quem a equipe mandou (wa_id do hóspede). */
  waId: string;
  quando: string;
  tipo: TipoMsg;
  texto: string;
  phoneNumberId: string | null;
};

export type StatusEnvio = {
  wamid: string;
  envio: "enviada" | "entregue" | "lida" | "falhou";
  erro: string | null;
};

export type Webhook = { mensagens: MsgRecebida[]; ecos: EcoEquipe[]; status: StatusEnvio[] };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.map(obj) : []);
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

export function soDigitos(v: unknown): string {
  return str(v).replace(/\D/g, "");
}

function quandoISO(ts: unknown): string {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date().toISOString();
}

/** Converte o conteúdo de uma mensagem (recebida ou eco) em tipo + texto. */
export function conteudo(m: Obj): {
  tipo: TipoMsg;
  texto: string;
  midiaId: string | null;
  mime: string | null;
} {
  const t = str(m.type);
  const corpo = obj(m[t]);
  const legenda = str(corpo.caption).trim();
  const comLegenda = (rotulo: string) => (legenda ? `${rotulo} ${legenda}` : rotulo);
  switch (t) {
    case "text":
      return { tipo: "texto", texto: str(corpo.body), midiaId: null, mime: null };
    case "button":
      return { tipo: "texto", texto: str(obj(m.button).text), midiaId: null, mime: null };
    case "interactive": {
      const i = obj(m.interactive);
      const r = obj(i.button_reply ?? i.list_reply);
      return { tipo: "texto", texto: str(r.title), midiaId: null, mime: null };
    }
    case "audio":
      return {
        tipo: "audio",
        texto: "[áudio]",
        midiaId: str(corpo.id) || null,
        mime: str(corpo.mime_type) || null,
      };
    case "image":
      return {
        tipo: "imagem",
        texto: comLegenda("[imagem]"),
        midiaId: str(corpo.id) || null,
        mime: str(corpo.mime_type) || null,
      };
    case "video":
      return { tipo: "video", texto: comLegenda("[vídeo]"), midiaId: null, mime: null };
    case "document":
      return {
        tipo: "documento",
        texto: comLegenda(`[documento${corpo.filename ? `: ${str(corpo.filename)}` : ""}]`),
        midiaId: null,
        mime: null,
      };
    case "sticker":
      return { tipo: "figurinha", texto: "[figurinha]", midiaId: null, mime: null };
    case "location": {
      const l = obj(m.location);
      const nome = [str(l.name), str(l.address)].filter(Boolean).join(", ");
      return {
        tipo: "localizacao",
        texto: `[localização${nome ? `: ${nome}` : ""} (${str(l.latitude)}, ${str(l.longitude)})]`,
        midiaId: null,
        mime: null,
      };
    }
    case "contacts":
      return { tipo: "contato", texto: "[contato compartilhado]", midiaId: null, mime: null };
    case "reaction":
      return { tipo: "reacao", texto: str(obj(m.reaction).emoji), midiaId: null, mime: null };
    default:
      return {
        tipo: "outro",
        texto: `[mensagem do tipo ${t || "desconhecido"}]`,
        midiaId: null,
        mime: null,
      };
  }
}

const STATUS: Record<string, StatusEnvio["envio"]> = {
  sent: "enviada",
  delivered: "entregue",
  read: "lida",
  failed: "falhou",
};

/** Lê o corpo do webhook. Ignora o que não for WhatsApp. */
export function lerWebhook(payload: unknown): Webhook {
  const out: Webhook = { mensagens: [], ecos: [], status: [] };
  const p = obj(payload);
  if (p.object !== "whatsapp_business_account") return out;
  for (const entry of arr(p.entry)) {
    for (const change of arr(entry.changes)) {
      const field = str(change.field);
      const v = obj(change.value);
      const phoneNumberId = str(obj(v.metadata).phone_number_id) || null;
      if (field === "messages") {
        const nomes = new Map<string, string>();
        for (const c of arr(v.contacts)) {
          const nome = str(obj(c.profile).name).trim();
          if (nome) nomes.set(soDigitos(c.wa_id), nome);
        }
        for (const m of arr(v.messages)) {
          const wamid = str(m.id);
          const waId = soDigitos(m.from);
          if (!wamid || !waId) continue;
          // Reação a mensagem não vira conversa (não pede resposta).
          if (str(m.type) === "reaction") continue;
          const c = conteudo(m);
          out.mensagens.push({
            wamid,
            waId,
            nome: nomes.get(waId) ?? null,
            quando: quandoISO(m.timestamp),
            ...c,
            phoneNumberId,
          });
        }
        for (const s of arr(v.statuses)) {
          const envio = STATUS[str(s.status)];
          const wamid = str(s.id);
          if (!envio || !wamid) continue;
          const erros = arr(s.errors);
          const erro = erros.length
            ? erros
                .map((e) =>
                  `${str(e.code)} ${str(e.title)} ${str(obj(e.error_data).details)}`.trim(),
                )
                .join("; ")
            : null;
          out.status.push({ wamid, envio, erro });
        }
      } else if (field === "smb_message_echoes") {
        for (const m of arr(v.message_echoes)) {
          const wamid = str(m.id);
          const waId = soDigitos(m.to);
          if (!wamid || !waId || str(m.type) === "reaction") continue;
          const c = conteudo(m);
          out.ecos.push({
            wamid,
            waId,
            quando: quandoISO(m.timestamp),
            tipo: c.tipo,
            texto: c.texto,
            phoneNumberId,
          });
        }
      }
    }
  }
  return out;
}

// ------------------------------------------------------------- envio

/** Janela de atendimento da Meta: 24 h depois da última mensagem do hóspede. Sem template, fora dela não dá. */
export function dentroDaJanela(
  ultimaMsgCliente: string | null | undefined,
  agora = new Date(),
): boolean {
  if (!ultimaMsgCliente) return false;
  const t = Date.parse(ultimaMsgCliente);
  return Number.isFinite(t) && agora.getTime() - t < 24 * 3600 * 1000;
}

export type ConfigEnvio = { envio_liberado: boolean; numeros_teste: string[] };

/**
 * Celular do Brasil: a Meta às vezes manda o wa_id sem o 9 da frente (55 21 9xxxx-xxxx → 55 21 xxxx-xxxx).
 * Para conferir a lista de teste, os dois jeitos valem.
 */
export function variantesNumero(n: string): string[] {
  const d = soDigitos(n);
  if (d.startsWith("55") && d.length === 13 && d[4] === "9") return [d, d.slice(0, 4) + d.slice(5)];
  if (d.startsWith("55") && d.length === 12 && /[6-9]/.test(d[4]))
    return [d, `${d.slice(0, 4)}9${d.slice(4)}`];
  return [d];
}

export function mesmoNumero(a: string, b: string): boolean {
  const va = variantesNumero(a);
  return variantesNumero(b).some((x) => x.length >= 10 && va.includes(x));
}

/** Só envia para número de teste, a não ser que o Rodrigo tenha liberado o envio. */
export function podeEnviarPara(c: ConfigEnvio, waId: string): boolean {
  if (c.envio_liberado) return true;
  return c.numeros_teste.some((n) => mesmoNumero(n, waId));
}

/** No modo "rascunho_teste", a Joy só faz rascunho para os números de teste. */
export function joyAtende(
  c: { whatsapp_modo: string; numeros_teste: string[] },
  waId: string,
): boolean {
  if (c.whatsapp_modo === "rascunho") return true;
  if (c.whatsapp_modo !== "rascunho_teste") return false;
  return podeEnviarPara({ envio_liberado: false, numeros_teste: c.numeros_teste }, waId);
}

/** Normaliza a lista de números digitada na tela (um por linha, com ou sem +, espaço, traço). */
export function lerNumeros(texto: string): string[] {
  const out = new Set<string>();
  for (const parte of texto.split(/[\n,;]+/)) {
    const d = soDigitos(parte);
    if (d.length >= 10 && d.length <= 15) out.add(d);
  }
  return [...out];
}
