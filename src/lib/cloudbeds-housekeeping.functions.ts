import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  acharQuarto,
  condicaoLimpa,
  corpoLimpo,
  lerHousekeeping,
  type QuartoHousekeeping,
} from "../../supabase/functions/_shared/cloudbeds-limpeza";

export type ResultadoQuartoLimpo = {
  confirmado: boolean;
  roomID: string | null;
  condicao: string | null;
  erro: string | null;
};

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Camareira finalizou o quarto no app → marca o quarto como LIMPO no Cloudbeds
 * (postHousekeepingStatus roomCondition=clean) e CONFERE lendo de volta.
 * Não lança erro para a tela: devolve se confirmou. O resultado fica em room_housekeeping
 * (cloudbeds_limpo_status) e, se não confirmou, a sincronização a cada 5 min tenta de novo.
 */
export const cloudbedsMarcarQuartoLimpo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ property: z.enum(["Ipanema", "Botafogo"]), roomNumber: z.string().trim().min(1) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<ResultadoQuartoLimpo> => {
    const { supabase, userId } = context;
    const { data: roles, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (error) throw new Error("Falha ao validar permissões");
    const ok = (roles ?? []).some((r) => ["gestor", "admin", "camareira", "funcionario", "recepcao"].includes(r.role));
    if (!ok) throw new Error("Sem permissão para alterar a limpeza no Cloudbeds");

    const { cloudbedsFetch } = await import("@/lib/cloudbeds/client.server");
    const property = data.property.toLowerCase() as "ipanema" | "botafogo";

    const listarQuartos = async (): Promise<QuartoHousekeeping[]> => {
      const todos: QuartoHousekeeping[] = [];
      for (let pagina = 1; pagina <= 5; pagina++) {
        const res = await cloudbedsFetch(property, `/getHousekeepingStatus?pageSize=100&pageNumber=${pagina}`);
        if (!res.ok) throw new Error(`Cloudbeds indisponível (${res.status}) ao ler a limpeza dos quartos`);
        const json = (await res.json()) as { success?: boolean; data?: unknown; message?: string };
        if (json.success === false) throw new Error(`Cloudbeds: ${json.message ?? "erro ao ler a limpeza dos quartos"}`);
        const lote = lerHousekeeping(json.data);
        todos.push(...lote);
        if (!Array.isArray(json.data) || json.data.length < 100) break;
      }
      return todos;
    };

    let roomID: string | null = null;
    let condicao: string | null = null;
    let erro: string | null = null;
    try {
      // roomID gravado pela sincronização (coluna da migração 0055; sem ela, segue pelo número).
      let roomIdSalvo: string | null = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- coluna nova, ainda fora do types.ts
      const { data: linha } = await (supabase as any)
        .from("room_housekeeping")
        .select("cloudbeds_room_id")
        .eq("property", data.property)
        .eq("room_number", data.roomNumber)
        .maybeSingle();
      roomIdSalvo = linha?.cloudbeds_room_id ?? null;

      const achado = acharQuarto(await listarQuartos(), data.roomNumber, roomIdSalvo);
      if ("erro" in achado) throw new Error(achado.erro);
      roomID = achado.quarto.roomID;
      condicao = achado.quarto.condicao;

      if (!condicaoLimpa(condicao)) {
        // POST não é repetido pelo cloudbedsFetch; tentamos de novo aqui só em falha de rede/5xx.
        let ultimo = "";
        let enviado = false;
        for (let tentativa = 1; tentativa <= 2 && !enviado; tentativa++) {
          try {
            const post = await cloudbedsFetch(property, "/postHousekeepingStatus", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: corpoLimpo(roomID),
            });
            const pj = (await post.json().catch(() => ({}))) as { success?: boolean; message?: string };
            if (post.ok && pj.success !== false) enviado = true;
            else {
              ultimo = pj.message ?? `Cloudbeds recusou marcar como limpo (${post.status})`;
              if (post.status < 500) break;
            }
          } catch (e) {
            ultimo = e instanceof Error ? e.message : String(e);
          }
          if (!enviado && tentativa < 2) await espera(800);
        }
        if (!enviado) throw new Error(ultimo || "Cloudbeds não respondeu");

        // Confere lendo de volta (o Cloudbeds às vezes demora um instante para refletir).
        for (let leitura = 1; leitura <= 3; leitura++) {
          await espera(leitura === 1 ? 700 : 1500);
          const achou = acharQuarto(await listarQuartos(), data.roomNumber, roomID);
          condicao = "quarto" in achou ? achou.quarto.condicao : null;
          if (condicaoLimpa(condicao)) break;
        }
        if (!condicaoLimpa(condicao)) erro = `Cloudbeds aceitou o envio, mas o quarto continua "${condicao ?? "?"}"`;
      }
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
    }

    const confirmado = !erro && condicaoLimpa(condicao);
    const rpc = supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    const { error: regErro } = await rpc("cloudbeds_limpeza_registrar", {
      _property: data.property,
      _room_number: data.roomNumber,
      _room_id: roomID,
      _confirmado: confirmado,
      _condicao: condicao,
      _erro: erro,
    });
    if (regErro) console.error("[cloudbeds-limpo] não registrou o resultado:", regErro.message);

    return { confirmado, roomID, condicao, erro };
  });
