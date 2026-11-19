import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const inputSchema = z.object({
  unidade: z.enum(["Ipanema", "Botafogo"]),
  reservationId: z.string().trim().min(1),
});

export type PortaBalcao = { label: string; tipo: string; senha: string | null; mesma: boolean };

export type SenhaBalcao = {
  hospede: string;
  quartos: string[];
  senha: string;
  portas: PortaBalcao[];
  validaAte: string;
  /** true = a reserva já tinha senha da estadia válida (do totem ou do balcão): só reexibe. */
  reaproveitada: boolean;
  /** Falha ao gravar a senha no campo da reserva do Cloudbeds (a senha vale mesmo assim). */
  avisoCloudbeds: string | null;
};

/**
 * Senha da estadia gerada no balcão, para quando o hóspede não consegue fazer o
 * check-in no totem. Faz o mesmo que o totem: uma senha para o(s) quarto(s) da
 * reserva + portões, válida até o check-out; apaga a senha provisória dos portões
 * e grava a senha no campo "Código dos portões" da reserva no Cloudbeds.
 * Não faz o check-in no Cloudbeds (a recepção faz pelo botão de check-in).
 * Se a reserva já tem senha da estadia válida, devolve a mesma (para reenviar).
 * Recepção, gestor e admin.
 */
export const gerarSenhaBalcao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<SenhaBalcao> => {
    const { supabase, userId } = context;

    const { data: roles, error: rErr } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (rErr) throw new Error("Falha ao validar permissões");
    const roleSet = new Set((roles ?? []).map((r) => r.role));
    let permitido = roleSet.has("gestor") || roleSet.has("admin") || roleSet.has("recepcao");
    let nome = "Recepção";
    {
      const { data: func } = await supabase
        .from("funcionarios")
        .select("nome, telas_permitidas")
        .eq("user_id", userId)
        .order("nome")
        .limit(1)
        .maybeSingle();
      if (func?.nome) nome = func.nome;
      if (Array.isArray(func?.telas_permitidas) && func.telas_permitidas.includes("recepcao")) permitido = true;
      if (!func?.nome) {
        const { data: prof } = await supabase.from("profiles").select("nome").eq("id", userId).maybeSingle();
        if (prof?.nome) nome = prof.nome;
      }
    }
    if (!permitido) throw new Error("Sem permissão para gerar a senha da estadia");

    const S = await import("@/lib/totem/totem.server");
    const R = await import("@/lib/totem/regras");
    const P = await import("@/lib/totem/senha-portoes.server");

    const totem = await S.totemDaUnidade(data.unidade);
    const reservationID = data.reservationId;
    const rec = await S.buscarReservaPorId(S.propriedade(totem), reservationID);
    if (!rec) throw new Error("Reserva não encontrada no Cloudbeds.");

    const status = R.statusDe(rec);
    if (/cancel|no_show|noshow/.test(status)) throw new Error("Reserva cancelada ou no-show: não dá para gerar senha.");
    if (/checked_out|checkout/.test(status)) throw new Error("Reserva com check-out feito: não dá para gerar senha.");

    const quartos = R.extrairQuartos(rec).filter((q) => q.nome);
    if (!quartos.length) throw new Error("Reserva sem quarto designado no Cloudbeds. Designe o quarto e tente de novo.");
    const nomes = quartos.map((q) => q.nome);
    const hospedes = R.extrairHospedes(rec);
    const hospede = (hospedes.find((h) => h.principal) ?? hospedes[0])?.nomeCompleto ?? "Hóspede";

    let senha = await S.senhaExistente(totem, reservationID, nomes);
    const reaproveitada = !!senha;
    if (!senha) {
      try {
        senha = await S.gerarSenhaTuya(totem, {
          reservationID,
          hospede,
          quartos,
          origem: { nome: `Recepção (balcão) · ${nome}`, userId },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await S.registrarEvento(totem, "senha_balcao_erro", { reservation_id: reservationID, quarto: nomes.join(", "), hospede, detalhe: `${nome}: ${msg}` });
        throw new Error(msg);
      }
      await S.revogarSenhaProvisoria(totem, reservationID);
    }

    const avisoCloudbeds = await P.gravarSenhaDaEstadia(totem, reservationID, senha);
    await S.registrarEvento(totem, reaproveitada ? "senha_balcao_reexibida" : "senha_balcao", {
      reservation_id: reservationID,
      quarto: nomes.join(", "),
      hospede,
      detalhe: [nome, avisoCloudbeds ? `Cloudbeds: ${avisoCloudbeds}` : null].filter(Boolean).join(" · "),
    });

    return { hospede, quartos: nomes, ...senha, reaproveitada, avisoCloudbeds };
  });
