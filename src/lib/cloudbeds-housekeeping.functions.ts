import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { chaveQuarto } from "@/lib/cloudbeds/quarto-numero";

/**
 * Camareira liberou o quarto no app → marca o quarto como LIMPO no Cloudbeds
 * (postHousekeepingStatus roomCondition=clean).
 */
export const cloudbedsMarcarQuartoLimpo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ property: z.enum(["Ipanema", "Botafogo"]), roomNumber: z.string().trim().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: roles, error } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (error) throw new Error("Falha ao validar permissões");
    const ok = (roles ?? []).some((r) => ["gestor", "admin", "camareira", "funcionario", "recepcao"].includes(r.role));
    if (!ok) throw new Error("Sem permissão para alterar a limpeza no Cloudbeds");

    const { cloudbedsFetch } = await import("@/lib/cloudbeds/client.server");
    const property = data.property.toLowerCase() as "ipanema" | "botafogo";
    const alvo = chaveQuarto(data.roomNumber);

    // Descobre o roomID do quarto pelo nome (getHousekeepingStatus lista todos os quartos).
    let roomID: string | null = null;
    for (let pagina = 1; pagina <= 5 && !roomID; pagina++) {
      const res = await cloudbedsFetch(property, `/getHousekeepingStatus?pageSize=100&pageNumber=${pagina}`);
      if (!res.ok) throw new Error(`Cloudbeds indisponível (${res.status}) ao buscar o quarto`);
      const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
      const lista = Array.isArray(json.data) ? json.data : [];
      const achou = lista.find((q) => chaveQuarto(q.roomName ?? q.roomNumber) === alvo);
      if (achou) roomID = String(achou.roomID ?? "");
      if (lista.length < 100) break;
    }
    if (!roomID) throw new Error(`Quarto ${data.roomNumber} não encontrado no Cloudbeds`);

    const body = new URLSearchParams({ roomID, roomCondition: "clean" });
    const post = await cloudbedsFetch(property, "/postHousekeepingStatus", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const pj = (await post.json().catch(() => ({}))) as { success?: boolean; message?: string };
    if (!post.ok || pj.success === false) {
      throw new Error(pj.message ?? `Cloudbeds recusou marcar como limpo (${post.status})`);
    }
    return { ok: true, roomID };
  });
