import { describe, expect, it } from "vitest";
import {
  dentroDaJanela,
  joyAtende,
  lerNumeros,
  lerWebhook,
  mesmoNumero,
  podeEnviarPara,
  variantesNumero,
} from "./meta";

const base = (field: string, value: Record<string, unknown>) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA",
      changes: [
        {
          field,
          value: { messaging_product: "whatsapp", metadata: { phone_number_id: "PN1" }, ...value },
        },
      ],
    },
  ],
});

describe("lerWebhook", () => {
  it("lê texto, nome do contato, áudio, imagem com legenda, botão e localização", () => {
    const w = lerWebhook(
      base("messages", {
        contacts: [{ wa_id: "5521999990000", profile: { name: "Ana" } }],
        messages: [
          {
            id: "w1",
            from: "5521999990000",
            timestamp: "1761600000",
            type: "text",
            text: { body: "oi" },
          },
          {
            id: "w2",
            from: "5521999990000",
            timestamp: "1761600001",
            type: "audio",
            audio: { id: "M1", mime_type: "audio/ogg; codecs=opus" },
          },
          {
            id: "w3",
            from: "5521999990000",
            timestamp: "1761600002",
            type: "image",
            image: { id: "M2", mime_type: "image/jpeg", caption: "comprovante" },
          },
          {
            id: "w4",
            from: "5521999990000",
            timestamp: "1761600003",
            type: "interactive",
            interactive: { button_reply: { title: "Sim" } },
          },
          {
            id: "w5",
            from: "5521999990000",
            timestamp: "1761600004",
            type: "location",
            location: { latitude: -22.9, longitude: -43.2, name: "Galeão" },
          },
          {
            id: "w6",
            from: "5521999990000",
            timestamp: "1761600005",
            type: "reaction",
            reaction: { emoji: "👍" },
          },
        ],
      }),
    );
    expect(w.mensagens.map((m) => [m.wamid, m.tipo, m.texto])).toEqual([
      ["w1", "texto", "oi"],
      ["w2", "audio", "[áudio]"],
      ["w3", "imagem", "[imagem] comprovante"],
      ["w4", "texto", "Sim"],
      ["w5", "localizacao", "[localização: Galeão (-22.9, -43.2)]"],
    ]);
    expect(w.mensagens[0]).toMatchObject({
      nome: "Ana",
      waId: "5521999990000",
      phoneNumberId: "PN1",
    });
    expect(w.mensagens[0].quando).toBe(new Date(1761600000 * 1000).toISOString());
    expect(w.mensagens[1]).toMatchObject({ midiaId: "M1", mime: "audio/ogg; codecs=opus" });
  });
  it("lê status com erro", () => {
    const w = lerWebhook(
      base("messages", {
        statuses: [
          { id: "s1", status: "delivered" },
          {
            id: "s2",
            status: "failed",
            errors: [{ code: 131047, title: "Re-engagement message" }],
          },
          { id: "s3", status: "deleted" },
        ],
      }),
    );
    expect(w.status).toEqual([
      { wamid: "s1", envio: "entregue", erro: null },
      { wamid: "s2", envio: "falhou", erro: "131047 Re-engagement message" },
    ]);
  });
  it("lê os ecos da coexistência (o que a recepção mandou pelo celular)", () => {
    const w = lerWebhook(
      base("smb_message_echoes", {
        message_echoes: [
          {
            id: "e1",
            from: "552197484343",
            to: "5521999990000",
            timestamp: "1761600010",
            type: "text",
            text: { body: "Oi, aqui é a Júlia" },
          },
        ],
      }),
    );
    expect(w.ecos).toEqual([
      {
        wamid: "e1",
        waId: "5521999990000",
        quando: new Date(1761600010 * 1000).toISOString(),
        tipo: "texto",
        texto: "Oi, aqui é a Júlia",
        phoneNumberId: "PN1",
      },
    ]);
  });
  it("ignora o que não é WhatsApp", () => {
    expect(lerWebhook({ object: "page" })).toEqual({ mensagens: [], ecos: [], status: [] });
    expect(lerWebhook(null)).toEqual({ mensagens: [], ecos: [], status: [] });
  });
});

describe("números e envio", () => {
  it("celular do Brasil com e sem o 9", () => {
    expect(variantesNumero("+55 21 99999-0000")).toEqual(["5521999990000", "552199990000"]);
    expect(mesmoNumero("552199990000", "+55 (21) 99999-0000")).toBe(true);
    expect(mesmoNumero("5521999990000", "5521999990001")).toBe(false);
    expect(variantesNumero("552133334444")).toEqual(["552133334444"]); // fixo
  });
  it("lê a lista digitada", () => {
    expect(lerNumeros("+55 21 99999-0000\n123\n5521999990000, +1 (415) 555-0100")).toEqual([
      "5521999990000",
      "14155550100",
    ]);
  });
  it("envio só para teste até liberar", () => {
    const c = { envio_liberado: false, numeros_teste: ["5521999990000"] };
    expect(podeEnviarPara(c, "552199990000")).toBe(true);
    expect(podeEnviarPara(c, "5511988887777")).toBe(false);
    expect(podeEnviarPara({ ...c, envio_liberado: true }, "5511988887777")).toBe(true);
  });
  it("modo da Joy", () => {
    const n = ["5521999990000"];
    expect(joyAtende({ whatsapp_modo: "desligado", numeros_teste: n }, "5521999990000")).toBe(
      false,
    );
    expect(joyAtende({ whatsapp_modo: "rascunho_teste", numeros_teste: n }, "5521999990000")).toBe(
      true,
    );
    expect(joyAtende({ whatsapp_modo: "rascunho_teste", numeros_teste: n }, "5511988887777")).toBe(
      false,
    );
    expect(joyAtende({ whatsapp_modo: "rascunho", numeros_teste: [] }, "5511988887777")).toBe(true);
  });
  it("janela de 24 h", () => {
    const agora = new Date("2026-10-28T12:00:00Z");
    expect(dentroDaJanela("2026-10-27T12:30:00Z", agora)).toBe(true);
    expect(dentroDaJanela("2026-10-27T11:59:00Z", agora)).toBe(false);
    expect(dentroDaJanela(null, agora)).toBe(false);
  });
});
