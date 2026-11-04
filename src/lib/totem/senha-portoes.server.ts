// Senha provisória dos portões (portão gradeado + porta de vidro), mandada
// depois do check-in online no Cloudbeds.
//
// O totem fica dentro do hotel: o hóspede precisa passar pelos dois portões
// antes de chegar nele. A cada 15 minutos (/api/public/senha-portoes), para as
// reservas que chegam hoje ou amanhã e cujo titular já tem documento na reserva:
//   1. gera uma senha só para os portões, válida da hora do check-in no dia da
//      chegada até 12h do dia seguinte;
//   2. grava a senha num campo personalizado da reserva no Cloudbeds (o modelo
//      de e-mail "Códigos de acesso" do Cloudbeds mostra esse campo);
//   3. confere relendo a reserva.
// No check-in do totem essa senha é apagada e entra a senha da estadia
// (quarto + portões). Se a senha for criada depois do horário do e-mail
// automático da véspera, a recepção recebe recado para mandar o e-mail à mão.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { cloudbedsFetch, type CloudbedsProperty } from "@/lib/cloudbeds/client.server";
import { extrairHospedes, extrairQuartos, relogioSP, statusDe, type Raw } from "./regras";
import {
  aguardandoChegada,
  amanhaDe,
  cadastroPrevioFeito,
  emailAutomaticoJaSaiu,
  integradas,
  janelaProvisoria,
} from "./portas";
import {
  avisarRecepcao,
  buscarReservaPorId,
  chamarTuya,
  fechadurasDaUnidade,
  listarReservas,
  normalizarTotem,
  propriedade,
  registrarEvento,
  type Totem,
} from "./totem.server";

const db = () => supabaseAdmin as unknown as SupabaseClient;
const ORIGEM = "Senha provisória (check-in online)";

export type ResultadoReserva = {
  unidade: string;
  reservationID: string;
  hospede: string;
  acao: "criada" | "campo_regravado" | "erro";
  detalhe?: string;
};

/** Um totem por unidade com a função ligada (a configuração de horários vem dele). */
async function totensLigados(): Promise<Totem[]> {
  const { data, error } = await db().from("totem_dispositivos").select("*").eq("ativo", true);
  if (error) throw new Error(`Falha ao ler os totens: ${error.message}`);
  const porUnidade = new Map<string, Totem>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const t = normalizarTotem(row);
    if (t.senha_portoes_auto && !porUnidade.has(t.unidade)) porUnidade.set(t.unidade, t);
  }
  return [...porUnidade.values()];
}

/** Grava a senha no campo personalizado da reserva e confere relendo a reserva. */
export async function gravarCampoCloudbeds(
  property: CloudbedsProperty,
  reservationID: string,
  campo: string,
  valor: string,
): Promise<void> {
  const body = new URLSearchParams({ reservationID });
  body.set("customFields[0][customFieldName]", campo);
  body.set("customFields[0][customFieldValue]", valor);
  const res = await cloudbedsFetch(property, "/putReservation", {
    method: "PUT",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
  if (!res.ok || json.success === false)
    throw new Error(`Cloudbeds recusou o campo "${campo}": ${json.message ?? res.status}`);
  const det = await buscarReservaPorId(property, reservationID);
  const campos = (det?.customFields ?? []) as Array<{ customFieldName?: string; customFieldValue?: string }>;
  const lista = Array.isArray(campos) ? campos : Object.values(campos as Record<string, { customFieldValue?: string }>);
  if (!lista.some((c) => String(c?.customFieldValue ?? "").trim() === valor))
    throw new Error(
      `O Cloudbeds aceitou, mas o campo "${campo}" não aparece na reserva. Confira se o código interno do campo personalizado é "${campo}".`,
    );
}

function chegadaDe(rec: Raw): string {
  const datas = extrairQuartos(rec)
    .map((q) => q.checkIn)
    .filter(Boolean)
    .sort();
  return datas[0] ?? String(rec.startDate ?? rec.reservationCheckIn ?? "").slice(0, 10);
}

const titularDe = (rec: Raw) => {
  const hs = extrairHospedes(rec);
  return (hs.find((h) => h.principal) ?? hs[0])?.nomeCompleto ?? "Hóspede";
};

async function processarUnidade(totem: Totem, out: ResultadoReserva[]) {
  const fechaduras = await fechadurasDaUnidade(totem);
  const portoes = integradas(fechaduras.filter((f) => f.tipo !== "quarto"));
  if (!portoes.length) return; // nenhum portão integrado ativo: nada a mandar
  const property = propriedade(totem);
  const { hoje } = relogioSP();
  const amanha = amanhaDe(hoje);
  const lista = await listarReservas(property, { checkInFrom: hoje, checkInTo: amanha });

  const ids = lista.map((r) => String(r.reservationID ?? "")).filter(Boolean);
  const { data: logs } = await db()
    .from("tuya_password_logs")
    .select("id,reservation_id,provisoria,password,cloudbeds_campo_em,revoked_at")
    .in("reservation_id", ids.length ? ids : ["-"])
    .eq("unidade", totem.unidade);
  type Log = { id: string; reservation_id: string; provisoria: boolean; password: string; cloudbeds_campo_em: string | null; revoked_at: string | null };
  const logsDe = (id: string) => ((logs ?? []) as Log[]).filter((l) => l.reservation_id === id);
  // Erro recente (ex.: gateway desligado): tenta de novo a cada rodada, mas avisa a recepção uma vez só.
  const { data: errosRecentes } = await db()
    .from("totem_eventos")
    .select("reservation_id")
    .eq("unidade", totem.unidade)
    .eq("tipo", "senha_portoes_erro")
    .gte("criado_em", new Date(Date.now() - 6 * 3600_000).toISOString());
  const jaAvisado = new Set(((errosRecentes ?? []) as Array<{ reservation_id: string | null }>).map((e) => e.reservation_id));

  for (const rec0 of lista) {
    const reservationID = String(rec0.reservationID ?? "");
    if (!reservationID || !aguardandoChegada(statusDe(rec0))) continue;
    const chegada = chegadaDe(rec0);
    if (chegada !== hoje && chegada !== amanha) continue;
    const jaTem = logsDe(reservationID);
    // Já recebeu a senha da estadia (totem ou recepção): não manda a provisória.
    if (jaTem.some((l) => !l.provisoria && !l.revoked_at)) continue;
    const provisoria = jaTem.find((l) => l.provisoria);
    const hospede = titularDe(rec0);

    if (provisoria) {
      // Já criada: só tenta de novo o campo do Cloudbeds se da outra vez falhou.
      if (provisoria.cloudbeds_campo_em || provisoria.revoked_at) continue;
      const senha = provisoria.password.split("|")[0]?.split(":")[1]?.trim() ?? "";
      if (!senha) continue;
      try {
        await gravarCampoCloudbeds(property, reservationID, totem.campo_cloudbeds_senha, senha);
        await db().from("tuya_password_logs").update({ cloudbeds_campo_em: new Date().toISOString() }).eq("id", provisoria.id);
        out.push({ unidade: totem.unidade, reservationID, hospede, acao: "campo_regravado" });
      } catch (e) {
        out.push({ unidade: totem.unidade, reservationID, hospede, acao: "erro", detalhe: String((e as Error).message ?? e) });
      }
      continue;
    }

    let rec = rec0;
    if (!cadastroPrevioFeito(extrairHospedes(rec))) {
      // A lista às vezes vem sem documento: confere no detalhe da reserva.
      const det = await buscarReservaPorId(property, reservationID);
      if (!det) continue;
      rec = { ...rec0, ...det };
      if (!cadastroPrevioFeito(extrairHospedes(rec))) continue;
    }

    const { inicio, fim } = janelaProvisoria(chegada, totem.hora_checkin, totem.hora_checkout);
    if (fim <= Date.now()) continue;
    const quartos = extrairQuartos(rec)
      .map((q) => q.nome)
      .filter(Boolean);
    try {
      const resp = await chamarTuya({
        deviceIds: portoes.map((f) => f.device_id),
        guestName: hospede,
        startTime: inicio,
        endTime: fim,
        roomNumber: quartos.join(",") || "PORTOES",
        unidade: totem.unidade,
      });
      const senhas = (resp.senhas ?? {}) as Record<string, string>;
      const senhaIds = (resp.senhaIds ?? {}) as Record<string, string | number>;
      const senha = Object.values(senhas)[0];
      if (!senha) throw new Error("Os portões não aceitaram a senha (gateway desligado?).");
      const faltou = portoes.filter((f) => !senhas[f.device_id]).map((f) => f.label);
      const { data: ins, error } = await db()
        .from("tuya_password_logs")
        .insert({
          room_number: quartos.join(", ") || "PORTÕES",
          guest_name: hospede,
          password: Object.entries(senhas)
            .map(([id, p]) => `${id}:${p}`)
            .join(" | "),
          entrada: new Date(inicio).toISOString(),
          saida: new Date(fim).toISOString(),
          device_ids: portoes.map((f) => f.device_id),
          senha_ids: senhaIds,
          unidade: totem.unidade,
          generated_by_user_id: null,
          generated_by_name: ORIGEM,
          reservation_id: reservationID,
          provisoria: true,
        })
        .select("id")
        .single();
      if (error) throw new Error(`Senha criada (${Object.keys(senhas).length} portas), mas não registrada: ${error.message}`);

      let avisoCampo: string | null = null;
      try {
        await gravarCampoCloudbeds(property, reservationID, totem.campo_cloudbeds_senha, senha);
        await db().from("tuya_password_logs").update({ cloudbeds_campo_em: new Date().toISOString() }).eq("id", (ins as { id: string }).id);
      } catch (e) {
        avisoCampo = String((e as Error).message ?? e);
      }

      const recado: string[] = [];
      if (avisoCampo)
        recado.push(`a senha não entrou na reserva do Cloudbeds (${avisoCampo}). Informe ao hóspede pelo e-mail da reserva.`);
      else if (emailAutomaticoJaSaiu(chegada, totem.hora_email_codigos, Date.now()))
        recado.push(`a senha foi criada depois do e-mail automático das ${totem.hora_email_codigos}. Mande o modelo "Códigos de acesso" pela reserva no Cloudbeds.`);
      if (faltou.length) recado.push(`${faltou.join(", ")} não aceitou a senha; verificar o gateway.`);
      if (recado.length)
        await avisarRecepcao(totem, quartos[0] ?? null, `Senha provisória dos portões de ${hospede} (chegada ${chegada}): ${recado.join(" ")}`);

      await registrarEvento(totem, "senha_portoes_criada", {
        reservation_id: reservationID,
        quarto: quartos.join(", ") || null,
        hospede,
        detalhe: [`chegada ${chegada}`, avisoCampo ? `Cloudbeds: ${avisoCampo}` : "campo do Cloudbeds gravado", faltou.length ? `sem senha: ${faltou.join(", ")}` : null]
          .filter(Boolean)
          .join(" · "),
      });
      out.push({ unidade: totem.unidade, reservationID, hospede, acao: "criada", detalhe: avisoCampo ?? undefined });
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      if (!jaAvisado.has(reservationID)) {
        await registrarEvento(totem, "senha_portoes_erro", { reservation_id: reservationID, hospede, detalhe: msg });
        await avisarRecepcao(totem, null, `Senha provisória dos portões de ${hospede} (chegada ${chegada}) não foi criada: ${msg}`);
      }
      out.push({ unidade: totem.unidade, reservationID, hospede, acao: "erro", detalhe: msg });
    }
  }
}

export async function rodarSenhasPortoes(): Promise<{ ok: true; resultados: ResultadoReserva[]; erros: string[] }> {
  const resultados: ResultadoReserva[] = [];
  const erros: string[] = [];
  for (const totem of await totensLigados()) {
    try {
      await processarUnidade(totem, resultados);
    } catch (e) {
      erros.push(`${totem.unidade}: ${String((e as Error).message ?? e)}`);
    }
  }
  return { ok: true, resultados, erros };
}
