// Fotos de documentos tiradas no totem: bucket privado + anexo na reserva do Cloudbeds.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { cloudbedsFetch, type CloudbedsProperty } from "@/lib/cloudbeds/client.server";
import type { Totem } from "./totem.server";
import type { Ticket } from "./ticket.server";

const db = () => supabaseAdmin as unknown as SupabaseClient;
export const BUCKET_DOCUMENTOS = "documentos-hospedes";
const MAX_BYTES = 4 * 1024 * 1024;

export type TipoDocumento = "cpf" | "rg" | "cnh" | "passaporte" | "outro";

export async function documentosEnviados(reservationID: string): Promise<Array<{ hospede_ordem: number; lado: string }>> {
  const { data, error } = await db()
    .from("totem_documentos")
    .select("hospede_ordem,lado")
    .eq("reservation_id", reservationID);
  if (error) {
    // Migração 0045 ainda não aplicada: não trava o check-in por isso.
    if (/does not exist|schema cache/i.test(error.message)) return [];
    throw new Error(`Falha ao consultar documentos: ${error.message}`);
  }
  return (data ?? []) as Array<{ hospede_ordem: number; lado: string }>;
}

function base64ParaBytes(b64: string): Uint8Array {
  const limpo = b64.replace(/^data:image\/\w+;base64,/, "");
  const bin = atob(limpo);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function salvarDocumento(
  totem: Totem,
  ticket: Ticket,
  doc: { ordem: number; nome: string; tipo: TipoDocumento; numero: string; lado: "frente" | "verso"; jpegBase64: string },
): Promise<{ id: string; cloudbedsErro: string | null }> {
  const bytes = base64ParaBytes(doc.jpegBase64);
  if (bytes.length < 10_000) throw new Error("A foto ficou muito pequena. Tente de novo.");
  if (bytes.length > MAX_BYTES) throw new Error("A foto ficou grande demais. Tente de novo.");
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) throw new Error("Formato de foto inválido.");

  const caminho = `${totem.unidade}/${ticket.reservationID}/${doc.ordem}-${doc.lado}-${crypto.randomUUID()}.jpg`;
  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET_DOCUMENTOS)
    .upload(caminho, bytes, { contentType: "image/jpeg", upsert: false });
  if (upErr) {
    throw new Error(
      /not found|bucket/i.test(upErr.message)
        ? `O local de armazenamento "${BUCKET_DOCUMENTOS}" ainda não existe. Avise a equipe.`
        : `Falha ao guardar a foto: ${upErr.message}`,
    );
  }

  const { data: linha, error } = await db()
    .from("totem_documentos")
    .insert({
      totem_id: totem.id,
      unidade: totem.unidade,
      reservation_id: ticket.reservationID,
      hospede_nome: doc.nome.slice(0, 120),
      hospede_ordem: doc.ordem,
      tipo_documento: doc.tipo,
      numero_documento: doc.numero.slice(0, 40) || null,
      lado: doc.lado,
      arquivo_path: caminho,
    })
    .select("id")
    .single();
  if (error || !linha) throw new Error(`Falha ao registrar o documento: ${error?.message ?? "sem retorno"}`);
  const id = String((linha as { id: string }).id);

  // Anexa na reserva do Cloudbeds. Se falhar, a foto continua guardada e a recepção é avisada.
  let cloudbedsErro: string | null = null;
  try {
    const form = new FormData();
    form.set("reservationID", ticket.reservationID);
    const nomeArquivo = `Documento ${doc.ordem} ${doc.tipo.toUpperCase()} ${doc.lado} - ${doc.nome}`.replace(/[^\p{L}\p{N} .-]/gu, "").slice(0, 80);
    form.set("file", new Blob([bytes.slice().buffer as ArrayBuffer], { type: "image/jpeg" }), `${nomeArquivo}.jpg`);
    const res = await cloudbedsFetch(totem.unidade.toLowerCase() as CloudbedsProperty, "/postReservationDocument", {
      method: "POST",
      body: form,
    });
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; data?: { fileID?: string } };
    if (!res.ok || json.success === false) throw new Error(json.message ?? `Cloudbeds ${res.status}`);
    await db().from("totem_documentos").update({ cloudbeds_file_id: json.data?.fileID ?? null }).eq("id", id);
  } catch (e) {
    cloudbedsErro = e instanceof Error ? e.message : String(e);
    await db().from("totem_documentos").update({ cloudbeds_erro: cloudbedsErro }).eq("id", id);
  }
  return { id, cloudbedsErro };
}
