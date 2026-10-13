import { describe, expect, it } from "vitest";
import {
  acharQuarto,
  chaveQuartoLimpeza,
  condicaoLimpa,
  corpoLimpo,
  decidirReenvio,
  JANELA_REENVIO_MS,
  lerHousekeeping,
  MAX_TENTATIVAS_LIMPO,
} from "../../../supabase/functions/_shared/cloudbeds-limpeza";
import { chaveQuarto } from "./quarto-numero";

const lista = lerHousekeeping([
  { roomID: "501", roomName: "107", roomCondition: "dirty" },
  { roomID: "502", roomName: "1", roomCondition: "Clean" },
  { roomID: "503", roomName: "APT 02", roomCondition: "inspected" },
  { roomName: "sem id" },
]);

describe("chaveQuartoLimpeza", () => {
  it("é igual à chave usada no resto do app", () => {
    for (const v of ["APT 107", "107", "Apto 01", "APT 001", "Quarto 2", "Suíte"]) {
      expect(chaveQuartoLimpeza(v)).toBe(chaveQuarto(v));
    }
  });
});

describe("lerHousekeeping", () => {
  it("normaliza a condição e descarta linha sem roomID", () => {
    expect(lista).toHaveLength(3);
    expect(lista[1].condicao).toBe("clean");
  });
});

describe("acharQuarto", () => {
  it("acha pelo número do app (APT xxx)", () => {
    expect(acharQuarto(lista, "APT 107")).toEqual({ quarto: lista[0] });
    expect(acharQuarto(lista, "APT 01")).toEqual({ quarto: lista[1] });
  });
  it("prefere o roomID gravado pela sincronização", () => {
    expect(acharQuarto(lista, "APT 999", "503")).toEqual({ quarto: lista[2] });
  });
  it("roomID antigo que sumiu cai para o número", () => {
    expect(acharQuarto(lista, "APT 107", "000")).toEqual({ quarto: lista[0] });
  });
  it("não arrisca quando há dois quartos com o mesmo número", () => {
    const dup = lerHousekeeping([
      { roomID: "1", roomName: "107" },
      { roomID: "2", roomName: "APT 107" },
    ]);
    expect(acharQuarto(dup, "APT 107")).toHaveProperty("erro");
  });
  it("erro claro quando não existe", () => {
    expect(acharQuarto(lista, "APT 401")).toEqual({ erro: "Quarto APT 401 não encontrado no Cloudbeds" });
  });
});

describe("condicaoLimpa e corpoLimpo", () => {
  it("clean e inspected contam como limpo", () => {
    expect(condicaoLimpa("clean")).toBe(true);
    expect(condicaoLimpa("INSPECTED")).toBe(true);
    expect(condicaoLimpa("dirty")).toBe(false);
    expect(condicaoLimpa(null)).toBe(false);
  });
  it("sempre manda roomCondition=clean (sem ele o Cloudbeds inverte)", () => {
    expect(corpoLimpo("501")).toBe("roomID=501&roomCondition=clean");
    expect(() => corpoLimpo("")).toThrow();
  });
});

describe("decidirReenvio", () => {
  const agora = Date.parse("2026-10-13T15:00:00Z");
  const app = {
    status: "clean",
    service_status: "done",
    service_ended_at: "2026-10-13T14:00:00Z",
    cloudbeds_limpo_tentativas: 1,
  };
  it("reenvia quando o Cloudbeds ainda está sujo", () => {
    expect(decidirReenvio(app, "dirty", agora)).toBe("reenviar");
  });
  it("confirma quando o Cloudbeds já está limpo", () => {
    expect(decidirReenvio(app, "clean", agora)).toBe("confirmar");
  });
  it("cancela se o quarto voltou a ser serviço no app", () => {
    expect(decidirReenvio({ ...app, service_status: "in_progress" }, "dirty", agora)).toBe("cancelar");
    expect(decidirReenvio({ ...app, status: "dirty" }, "dirty", agora)).toBe("cancelar");
    expect(decidirReenvio({ ...app, is_dnd: true }, "dirty", agora)).toBe("cancelar");
  });
  it("desiste depois do limite de tentativas ou de tempo", () => {
    expect(decidirReenvio({ ...app, cloudbeds_limpo_tentativas: MAX_TENTATIVAS_LIMPO }, "dirty", agora)).toBe("desistir");
    expect(decidirReenvio(app, "dirty", Date.parse(app.service_ended_at) + JANELA_REENVIO_MS + 1)).toBe("desistir");
    expect(decidirReenvio({ ...app, service_ended_at: null }, "dirty", agora)).toBe("desistir");
  });
});

// ---------------------------------------------------------------- reenvio pela sincronização
import { reenviarLimpezasPendentes } from "../../../supabase/functions/_shared/cloudbeds-limpeza";

function bancoFalso(pendentes: Record<string, unknown>[], erroSelect?: string) {
  const updates: { filtro: Record<string, string>; campos: Record<string, unknown> }[] = [];
  const logs: Record<string, unknown>[] = [];
  const cliente = {
    from(tabela: string) {
      if (tabela === "cloudbeds_limpeza_logs") return { insert: async (l: Record<string, unknown>) => (logs.push(l), { error: null }) };
      return {
        select: () => ({ eq: () => ({ limit: async () => ({ data: erroSelect ? null : pendentes, error: erroSelect ? { message: erroSelect } : null }) }) }),
        update: (campos: Record<string, unknown>) => {
          const filtro: Record<string, string> = {};
          const enc = {
            eq(k: string, v: string) {
              filtro[k] = v;
              if (Object.keys(filtro).length === 2) {
                updates.push({ filtro, campos });
                return Promise.resolve({ error: null });
              }
              return enc;
            },
          };
          return enc;
        },
      };
    },
  };
  return { cliente, updates, logs };
}

describe("reenviarLimpezasPendentes", () => {
  const agora = Date.parse("2026-10-13T15:00:00Z");
  const base = {
    property: "Botafogo",
    status: "clean",
    service_status: "done",
    service_ended_at: "2026-10-13T14:50:00Z",
    is_dnd: false,
    cloudbeds_room_id: null,
    cloudbeds_limpo_tentativas: 1,
  };
  const hk = lerHousekeeping([
    { roomID: "501", roomName: "107", roomCondition: "dirty" },
    { roomID: "502", roomName: "108", roomCondition: "clean" },
  ]);

  it("reenvia o sujo, confirma o que já está limpo e manda roomCondition=clean", async () => {
    const { cliente, updates, logs } = bancoFalso([
      { ...base, room_number: "APT 107" },
      { ...base, room_number: "APT 108" },
    ]);
    const chamadas: { url: string; body: string }[] = [];
    const fetchFalso = (async (url: string, init: RequestInit) => {
      chamadas.push({ url, body: String(init.body) });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await reenviarLimpezasPendentes(cliente, [["Botafogo", { housekeeping: hk, apiKey: "k" }]], "https://cb", fetchFalso, agora);
    expect(r.map((x) => x.acao)).toEqual(["reenviar", "confirmar"]);
    expect(chamadas).toEqual([{ url: "https://cb/postHousekeepingStatus", body: "roomID=501&roomCondition=clean" }]);
    expect(updates[0].campos).toMatchObject({ cloudbeds_limpo_tentativas: 2, cloudbeds_limpo_erro: null, cloudbeds_room_id: "501" });
    expect(updates[1].campos).toMatchObject({ cloudbeds_limpo_status: "confirmado" });
    expect(logs.map((l) => l.resultado)).toEqual(["reenviado", "confirmado"]);
  });

  it("guarda o erro do Cloudbeds e continua pendente", async () => {
    const { cliente, updates, logs } = bancoFalso([{ ...base, room_number: "APT 107" }]);
    const fetchFalso = (async () => new Response(JSON.stringify({ success: false, message: "roomID inválido" }), { status: 200 })) as unknown as typeof fetch;
    await reenviarLimpezasPendentes(cliente, [["Botafogo", { housekeeping: hk, apiKey: "k" }]], "https://cb", fetchFalso, agora);
    expect(updates[0].campos).toMatchObject({ cloudbeds_limpo_erro: "roomID inválido", cloudbeds_limpo_tentativas: 2 });
    expect(logs[0].resultado).toBe("pendente");
  });

  it("desiste depois do limite e não envia nada", async () => {
    const { cliente, updates } = bancoFalso([{ ...base, room_number: "APT 107", cloudbeds_limpo_tentativas: MAX_TENTATIVAS_LIMPO }]);
    let chamou = false;
    const fetchFalso = (async () => ((chamou = true), new Response("{}"))) as unknown as typeof fetch;
    await reenviarLimpezasPendentes(cliente, [["Botafogo", { housekeeping: hk, apiKey: "k" }]], "https://cb", fetchFalso, agora);
    expect(chamou).toBe(false);
    expect(updates[0].campos).toMatchObject({ cloudbeds_limpo_status: "falhou" });
  });

  it("não mexe na unidade em que o Cloudbeds falhou nesta rodada", async () => {
    const { cliente, updates } = bancoFalso([{ ...base, room_number: "APT 107" }]);
    const r = await reenviarLimpezasPendentes(cliente, [["Botafogo", { falhou: true, housekeeping: [], apiKey: "k" }]], "https://cb", fetch, agora);
    expect(r).toEqual([]);
    expect(updates).toEqual([]);
  });

  it("sem a migração 0055 não faz nada", async () => {
    const { cliente } = bancoFalso([], 'column room_housekeeping.cloudbeds_limpo_status does not exist');
    expect(await reenviarLimpezasPendentes(cliente, [["Botafogo", { housekeeping: hk, apiKey: "k" }]], "https://cb", fetch, agora)).toEqual([]);
  });
});
