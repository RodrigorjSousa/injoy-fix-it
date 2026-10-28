// Ferramentas que a Joy pode chamar. Cada uma decide no SERVIDOR o que pode ou não ser dito:
// o prompt orienta, a ferramenta garante (ex.: Wi-Fi só para hóspede identificado e elegível).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { UNIDADES_JOY, type Conhecimento, type UnidadeJoy, type WifiConfig } from "./conhecimento";
import {
  consultarDisponibilidade,
  dadosParaCancelamento,
  dadosParaWifi,
  identificarReserva,
  recarregarReserva,
  reservaPorTelefone,
  resumoReserva,
  type ReservaJoy,
} from "./cloudbeds-joy.server";
import { agoraNoHotel } from "./prompt";
import {
  avaliarCancelamento,
  statusReserva,
  type IdiomaLink,
  linkMapsBusca,
  linkMapsRota,
  linkReserva,
  reais,
  unidadeDe,
  validarDatas,
  wifiLiberado,
} from "./regras";

export type ConversaRow = {
  id: string;
  canal: "simulador" | "whatsapp";
  contato_nome: string | null;
  telefone: string | null;
  unidade: UnidadeJoy | null;
  reserva_id: string | null;
  reserva_unidade: UnidadeJoy | null;
  modo: "ia" | "humano" | "pausada";
  etapa: string;
};

export type ContextoFerramenta = {
  conversa: ConversaRow;
  conhecimento: Conhecimento;
  wifi: WifiConfig;
  hoje: string;
  /** Unidades cujo Wi-Fi foi liberado nesta conversa (para o filtro de saída). */
  wifiLiberadoPara: Set<UnidadeJoy>;
  /** Números que podem aparecer junto da palavra "código" (código da reserva). */
  numerosPermitidos: Set<string>;
  /** Nomes de tipos de acomodação que vieram do Cloudbeds. */
  nomesPermitidos: Set<string>;
  /** Reserva carregada nesta resposta (evita buscar de novo). */
  reserva?: ReservaJoy | null;
  /** A conversa foi passada para a equipe nesta resposta. */
  transferida?: boolean;
};

type Resultado = Record<string, unknown>;

// ------------------------------------------------------------ definições

export const DEFINICOES_FERRAMENTAS = [
  {
    type: "function",
    function: {
      name: "consultar_disponibilidade",
      description:
        "Consulta no Cloudbeds as acomodações livres e o preço real para as datas. Use SEMPRE antes de falar de preço ou disponibilidade. Devolve as opções e o link de reserva direta.",
      parameters: {
        type: "object",
        properties: {
          checkin: { type: "string", description: "Data de entrada AAAA-MM-DD" },
          checkout: { type: "string", description: "Data de saída AAAA-MM-DD" },
          adultos: { type: "integer", minimum: 1, maximum: 8 },
          criancas: { type: "integer", minimum: 0, maximum: 6 },
          unidade: {
            type: "string",
            enum: ["Botafogo", "Ipanema"],
            description: "Omita para consultar as duas",
          },
          idioma: {
            type: "string",
            enum: ["pt", "en", "es"],
            description: "Idioma da conversa, para o link de reserva abrir no idioma certo",
          },
        },
        required: ["checkin", "checkout", "adultos"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "identificar_reserva",
      description:
        "Identifica a reserva do hóspede pelo código da reserva (Cloudbeds, Booking, Airbnb...) e o sobrenome do titular. Necessário antes de falar de dados da reserva ou liberar o Wi-Fi.",
      parameters: {
        type: "object",
        properties: {
          codigo: { type: "string" },
          sobrenome: { type: "string" },
        },
        required: ["codigo", "sobrenome"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "minha_reserva",
      description:
        "Busca a reserva desta conversa: a já identificada ou a do telefone do contato. Se não achar, peça o código da reserva e o sobrenome.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_wifi",
      description:
        "Devolve a rede e a senha do Wi-Fi da unidade do hóspede, SOMENTE se a reserva estiver identificada e ele estiver hospedado ou com check-in hoje/amanhã.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_arredores",
      description:
        "Sugestões de lugares perto da unidade (restaurantes, padarias, farmácias, mercados, estacionamentos, praia...).",
      parameters: {
        type: "object",
        properties: {
          o_que: { type: "string", description: "O que procurar, ex.: 'pizzaria', 'farmácia 24h'" },
          unidade: { type: "string", enum: ["Botafogo", "Ipanema"] },
        },
        required: ["o_que"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "como_chegar",
      description:
        "Endereço da unidade e link de rota no Google Maps (opcionalmente a partir de uma origem).",
      parameters: {
        type: "object",
        properties: {
          unidade: { type: "string", enum: ["Botafogo", "Ipanema"] },
          origem: {
            type: "string",
            description: "Ex.: 'Aeroporto Santos Dumont', 'Rodoviária Novo Rio'",
          },
        },
        required: ["unidade"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "link_checkin_online",
      description:
        "Link do check-in online (o hóspede preenche os dados e envia os documentos de todos).",
      parameters: {
        type: "object",
        properties: { unidade: { type: "string", enum: ["Botafogo", "Ipanema"] } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "avaliar_cancelamento",
      description:
        "Quando o hóspede quer cancelar: verifica pela reserva identificada (canal, data da reserva, chegada, tarifa, CDC e datas especiais) se há reembolso. O SISTEMA decide; você só explica com cuidado. Se houver direito a reembolso ou cancelamento grátis, a própria ferramenta passa a conversa para a equipe. Não use se o hóspede falar de saúde, carta de crédito ou exceção: nesses casos use transferir_para_humano.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "transferir_para_humano",
      description:
        "Passa a conversa para a equipe (a Joy para de responder nesta conversa). Use em reclamação, pedido de exceção/desconto/reembolso, problema não resolvido, emergência ou quando o hóspede pedir uma pessoa.",
      parameters: {
        type: "object",
        properties: {
          motivo: { type: "string", description: "Resumo curto para a equipe" },
          urgente: {
            type: "boolean",
            description: "true em emergência ou hóspede sem conseguir entrar",
          },
        },
        required: ["motivo"],
      },
    },
  },
] as const;

// ------------------------------------------------------------- auxiliares

function lembrarReserva(ctx: ContextoFerramenta, r: ReservaJoy) {
  ctx.reserva = r;
  ctx.numerosPermitidos.add(r.reservationID);
  for (const t of resumoReserva(r).tipos_de_acomodacao) ctx.nomesPermitidos.add(t);
}

async function salvarReservaNaConversa(ctx: ContextoFerramenta, r: ReservaJoy) {
  lembrarReserva(ctx, r);
  ctx.conversa.reserva_id = r.reservationID;
  ctx.conversa.reserva_unidade = r.unidade;
  ctx.conversa.unidade = r.unidade;
  ctx.conversa.etapa =
    ctx.conversa.etapa === "contato" || ctx.conversa.etapa === "cotou"
      ? "reservou"
      : ctx.conversa.etapa;
  await supabaseAdmin
    .from("wa_conversas" as never)
    .update({
      reserva_id: r.reservationID,
      reserva_unidade: r.unidade,
      unidade: r.unidade,
      etapa: ctx.conversa.etapa,
    } as never)
    .eq("id", ctx.conversa.id);
}

/** Reserva da conversa: a da memória desta resposta, a já gravada, ou a do telefone. */
async function reservaDaConversa(ctx: ContextoFerramenta): Promise<ReservaJoy | null> {
  if (ctx.reserva) return ctx.reserva;
  if (ctx.conversa.reserva_id && ctx.conversa.reserva_unidade) {
    const r = await recarregarReserva(ctx.conversa.reserva_unidade, ctx.conversa.reserva_id);
    if (r) {
      lembrarReserva(ctx, r);
      return r;
    }
  }
  if (ctx.conversa.telefone) {
    const r = await reservaPorTelefone(ctx.conversa.telefone, ctx.hoje);
    if (r) {
      await salvarReservaNaConversa(ctx, r);
      return r;
    }
  }
  return null;
}

function unidadeDoContexto(ctx: ContextoFerramenta, pedida?: unknown): UnidadeJoy | null {
  return unidadeDe(pedida) ?? ctx.conversa.reserva_unidade ?? ctx.conversa.unidade ?? null;
}

function unidadesAtivas(c: Conhecimento): UnidadeJoy[] {
  return UNIDADES_JOY.filter((u) => c.unidades[u]?.ativa !== false);
}

// ------------------------------------------------------------- execução

export async function executarFerramenta(
  nome: string,
  args: Resultado,
  ctx: ContextoFerramenta,
): Promise<Resultado> {
  switch (nome) {
    case "consultar_disponibilidade": {
      const checkin = String(args.checkin ?? "");
      const checkout = String(args.checkout ?? "");
      const adultos = Math.max(1, Math.min(8, Math.round(Number(args.adultos ?? 1)) || 1));
      const criancas = Math.max(0, Math.min(6, Math.round(Number(args.criancas ?? 0)) || 0));
      const erro = validarDatas(checkin, checkout, ctx.hoje);
      if (erro) {
        const msg = {
          formato: "Datas inválidas: use AAAA-MM-DD.",
          passado: "A data de entrada já passou.",
          ordem: "A saída precisa ser depois da entrada.",
          longa: "Estadia acima de 60 noites: passe para a equipe.",
        }[erro];
        return { ok: false, erro: msg };
      }
      const pedida = unidadeDe(args.unidade);
      const unidades = pedida ? [pedida] : unidadesAtivas(ctx.conhecimento);
      const resultado: Resultado[] = [];
      for (const unidade of unidades) {
        if (ctx.conhecimento.unidades[unidade]?.ativa === false) {
          resultado.push({ unidade, erro: "Unidade não disponível no momento." });
          continue;
        }
        try {
          const opcoes = await consultarDisponibilidade(unidade, {
            checkin,
            checkout,
            adultos,
            criancas,
          });
          for (const o of opcoes) ctx.nomesPermitidos.add(o.tipo);
          resultado.push({
            unidade,
            opcoes: opcoes.slice(0, 6).map((o) => ({
              tipo: o.tipo,
              disponiveis: o.disponiveis,
              max_hospedes: o.maxHospedes,
              total_estadia: reais(o.totalEstadia),
              media_por_noite: reais(o.mediaNoite),
            })),
            sem_disponibilidade: opcoes.length === 0,
            link_reserva: linkReserva(ctx.conhecimento, unidade, {
              checkin,
              checkout,
              adultos,
              idioma: (["pt", "en", "es"].includes(String(args.idioma))
                ? args.idioma
                : "pt") as IdiomaLink,
            }),
          });
        } catch (e) {
          resultado.push({ unidade, erro: e instanceof Error ? e.message : String(e) });
        }
      }
      if (ctx.conversa.etapa === "contato") {
        ctx.conversa.etapa = "cotou";
        await supabaseAdmin
          .from("wa_conversas" as never)
          .update({ etapa: "cotou" } as never)
          .eq("id", ctx.conversa.id);
      }
      return {
        ok: true,
        checkin,
        checkout,
        adultos,
        criancas,
        resultado,
        observacao:
          "Valores do Cloudbeds agora; o valor final aparece no link. Se houver criança, avise que ela é informada na página de reserva. Se der erro, diga que vai confirmar com a equipe — não invente.",
      };
    }

    case "identificar_reserva": {
      const codigo = String(args.codigo ?? "").trim();
      const sobrenome = String(args.sobrenome ?? "").trim();
      if (codigo.length < 4 || sobrenome.length < 2)
        return { ok: false, erro: "Preciso do código da reserva e do sobrenome do titular." };
      const r = await identificarReserva(codigo, sobrenome, ctx.hoje);
      if (!r) {
        return {
          ok: false,
          erro: "Não encontrei reserva com esse código e sobrenome juntos. Peça para conferir no e-mail de confirmação (Booking, Airbnb ou site).",
        };
      }
      await salvarReservaNaConversa(ctx, r);
      return { ok: true, reserva: resumoReserva(r) };
    }

    case "minha_reserva": {
      const r = await reservaDaConversa(ctx);
      if (!r)
        return {
          ok: false,
          erro: "Não achei reserva ligada a este telefone. Peça o código da reserva e o sobrenome do titular.",
        };
      return { ok: true, reserva: resumoReserva(r) };
    }

    case "consultar_wifi": {
      const r = await reservaDaConversa(ctx);
      if (!r)
        return {
          ok: false,
          erro: "Reserva não identificada. Peça o código da reserva e o sobrenome antes.",
        };
      if (!wifiLiberado(dadosParaWifi(r), ctx.hoje)) {
        return {
          ok: false,
          erro: "O Wi-Fi só é informado para quem está hospedado ou faz check-in hoje ou amanhã. Explique com gentileza.",
        };
      }
      const w = ctx.wifi[r.unidade];
      if (!w?.rede || !w?.senha)
        return {
          ok: false,
          erro: "O Wi-Fi desta unidade não está cadastrado. Transfira para a equipe.",
        };
      ctx.wifiLiberadoPara.add(r.unidade);
      return { ok: true, unidade: r.unidade, rede: w.rede, senha: w.senha };
    }

    case "buscar_arredores": {
      const unidade = unidadeDoContexto(ctx, args.unidade);
      if (!unidade)
        return {
          ok: false,
          erro: "Pergunte em qual unidade a pessoa está ou vai ficar (Botafogo ou Ipanema).",
        };
      const oQue =
        String(args.o_que ?? "")
          .trim()
          .slice(0, 80) || "restaurantes";
      const endereco = ctx.conhecimento.unidades[unidade].endereco;
      const consulta = `${oQue} perto de ${endereco}`;
      const chave = process.env.GOOGLE_MAPS_API_KEY;
      if (!chave) {
        return {
          ok: true,
          fonte: "link",
          unidade,
          link_google_maps: linkMapsBusca(consulta),
          observacao:
            "Sem consulta automática ao Google Maps por enquanto: envie este link com a busca já pronta. Não invente nomes de lugares.",
        };
      }
      try {
        const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": chave,
            "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.googleMapsUri",
          },
          body: JSON.stringify({
            textQuery: consulta,
            languageCode: "pt-BR",
            regionCode: "BR",
            pageSize: 5,
          }),
        });
        const json = (await res.json().catch(() => null)) as {
          places?: Array<{
            displayName?: { text?: string };
            formattedAddress?: string;
            googleMapsUri?: string;
          }>;
          error?: { message?: string };
        } | null;
        if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
        return {
          ok: true,
          fonte: "Google Maps",
          unidade,
          lugares: (json?.places ?? []).slice(0, 5).map((p) => ({
            nome: p.displayName?.text ?? "",
            endereco: p.formattedAddress ?? "",
            link: p.googleMapsUri ?? "",
          })),
          link_busca: linkMapsBusca(consulta),
          observacao: "Sugira 2 ou 3 lugares, cite que a fonte é o Google Maps e mande o link.",
        };
      } catch (e) {
        return {
          ok: true,
          fonte: "link",
          unidade,
          link_google_maps: linkMapsBusca(consulta),
          aviso: `Busca automática falhou (${e instanceof Error ? e.message : String(e)}). Envie o link.`,
        };
      }
    }

    case "como_chegar": {
      const unidade = unidadeDoContexto(ctx, args.unidade);
      if (!unidade) return { ok: false, erro: "Pergunte qual unidade (Botafogo ou Ipanema)." };
      const d = ctx.conhecimento.unidades[unidade];
      return {
        ok: true,
        unidade,
        endereco: d.endereco,
        referencia: d.descricao,
        link_rota: linkMapsRota(
          d.endereco,
          typeof args.origem === "string" ? args.origem : undefined,
        ),
      };
    }

    case "link_checkin_online": {
      const unidade = unidadeDoContexto(ctx, args.unidade);
      if (!unidade) {
        return {
          ok: true,
          links: Object.fromEntries(
            unidadesAtivas(ctx.conhecimento).map((u) => [
              u,
              ctx.conhecimento.unidades[u].checkinOnline,
            ]),
          ),
          observacao: "Pergunte a unidade ou mande o link certo de cada uma.",
        };
      }
      return { ok: true, unidade, link: ctx.conhecimento.unidades[unidade].checkinOnline };
    }

    case "avaliar_cancelamento": {
      const r = await reservaDaConversa(ctx);
      if (!r)
        return {
          ok: false,
          erro: "Reserva não identificada. Peça o código da reserva e o sobrenome do titular antes.",
        };
      const dados = dadosParaCancelamento(r);
      const st = statusReserva(dados.status);
      if (st === "cancelada")
        return {
          ok: true,
          resultado: "ja_cancelada",
          orientacao:
            "A reserva já consta como cancelada. Se o hóspede tiver dúvida sobre valores, passe para a equipe.",
        };
      if (st === "saiu" || st === "hospedado" || st === "no_show") {
        return executarFerramenta(
          "transferir_para_humano",
          {
            motivo: `Pedido de cancelamento com a reserva ${r.reservationID} já em andamento ou encerrada (${dados.status}).`,
          },
          ctx,
        );
      }
      const { hora } = agoraNoHotel();
      const av = avaliarCancelamento({
        ...dados,
        hoje: ctx.hoje,
        hora,
        datasEspeciais: ctx.conhecimento.datasEspeciais ?? [],
      });
      const base = {
        ok: true,
        resultado: av.resultado,
        motivo_interno: av.motivo,
        tarifa: dados.tarifa,
      };
      if (av.resultado === "canal")
        return {
          ...base,
          canal: dados.canalNome,
          orientacao:
            "Explique com gentileza que, como a reserva foi feita por esse site, o cancelamento é feito por lá, seguindo a política de lá. Não fale em reembolso.",
        };
      if (av.resultado === "sem_reembolso")
        return {
          ...base,
          orientacao:
            "Acolha (ex.: 'Entendo, e sinto muito pelo imprevisto') e explique, sem rodeios e sem culpar o hóspede, que pela política da tarifa esse cancelamento não tem reembolso. Cite o motivo em palavras simples (tarifa Não reembolsável, prazo de 3 dias encerrado ou data especial). Não prometa nada. Se ele insistir, pedir exceção, carta de crédito ou falar de saúde, use transferir_para_humano.",
        };
      const motivo = {
        reembolso_cdc: `Cancelamento com direito a reembolso pelo CDC (7 dias). Reserva ${r.reservationID}. ${av.motivo}`,
        gratis: `Cancelamento grátis dentro do prazo da tarifa. Reserva ${r.reservationID}. ${av.motivo}`,
        equipe: `Pedido de cancelamento para analisar. Reserva ${r.reservationID}. ${av.motivo}`,
      }[av.resultado];
      const passagem = await executarFerramenta("transferir_para_humano", { motivo }, ctx);
      return {
        ...base,
        ...passagem,
        orientacao:
          av.resultado === "equipe"
            ? "Diga que a equipe vai verificar o cancelamento e continuar o atendimento por aqui. Não diga se haverá reembolso."
            : "Diga que o cancelamento está dentro do prazo e que a equipe vai finalizar e confirmar por aqui. Não cite valores nem prazos de estorno.",
      };
    }

    case "transferir_para_humano": {
      const motivo =
        String(args.motivo ?? "")
          .trim()
          .slice(0, 500) || "Sem motivo informado";
      const urgente = args.urgente === true;
      await supabaseAdmin.from("wa_passagens" as never).insert({
        conversa_id: ctx.conversa.id,
        motivo,
        urgencia: urgente ? "urgente" : "normal",
      } as never);
      await supabaseAdmin
        .from("wa_conversas" as never)
        .update({ modo: "humano" } as never)
        .eq("id", ctx.conversa.id);
      ctx.conversa.modo = "humano";
      ctx.transferida = true;
      return {
        ok: true,
        aviso_equipe:
          ctx.conversa.canal === "simulador"
            ? "Simulador: a equipe NÃO foi avisada de verdade (nenhum push enviado)."
            : "Registrado no painel da equipe (WhatsApp).",
        horario_equipe: ctx.conhecimento.equipe.horario,
        contato_emergencia: ctx.conhecimento.equipe.contatoEmergencia || null,
        orientacao:
          "Avise com empatia que a equipe vai continuar o atendimento por aqui e informe o horário da equipe.",
      };
    }

    default:
      return { ok: false, erro: `Ferramenta desconhecida: ${nome}` };
  }
}
