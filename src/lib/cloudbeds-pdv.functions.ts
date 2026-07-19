import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const propertySchema = z.enum(["Ipanema", "Botafogo"]);

// ============================================================
// 1) Sincronizar catálogo/preços a partir do Cloudbeds
// ============================================================
const syncSchema = z.object({ property: propertySchema });

export const syncCloudbedsItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => syncSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roleSet = new Set((roles ?? []).map((r) => r.role));
    if (!roleSet.has("gestor") && !roleSet.has("admin")) {
      throw new Error("Somente gestores podem sincronizar o catálogo");
    }

    const { cloudbedsFetch } = await import("@/lib/cloudbeds/client.server");
    const property = data.property.toLowerCase() as "ipanema" | "botafogo";

    // Cloudbeds /getItems – paginação simples
    const collected: Array<{ id: string; name: string; price: number }> = [];
    let pageNumber = 1;
    while (true) {
      const qs = new URLSearchParams({
        pageSize: "100",
        pageNumber: String(pageNumber),
      });
      const res = await cloudbedsFetch(property, `/getItems?${qs.toString()}`);
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Falha ao consultar itens no Cloudbeds: ${res.status} ${txt}`);
      }
      const json = (await res.json()) as {
        success?: boolean;
        data?: Array<Record<string, unknown>>;
        count?: number;
        total?: number;
      };
      if (json.success === false) throw new Error("Cloudbeds retornou erro em getItems");
      const rows = json.data ?? [];
      for (const it of rows) {
        const id = String(it.itemID ?? it.id ?? "").trim();
        const name = String(it.name ?? it.itemName ?? "").trim();
        const priceRaw = it.grossPrice ?? it.price ?? it.itemPrice ?? it.defaultPrice ?? 0;
        const price = Number(priceRaw);
        if (!id || !name) continue;
        collected.push({ id, name, price: Number.isFinite(price) ? price : 0 });
      }
      if (rows.length < 100) break;
      pageNumber += 1;
      if (pageNumber > 20) break; // proteção
    }

    // Catálogo atual da unidade
    const { data: catalog, error: catErr } = await supabase
      .from("beverage_catalog")
      .select("id, name, cloudbeds_item_id")
      .eq("property", data.property);
    if (catErr) throw new Error(catErr.message);

    const byCloudbedsId = new Map<string, { id: string; name: string }>();
    const byName = new Map<string, { id: string; name: string }>();
    for (const b of catalog ?? []) {
      if (b.cloudbeds_item_id) byCloudbedsId.set(b.cloudbeds_item_id, b);
      byName.set(b.name.trim().toLowerCase(), b);
    }

    let matched = 0;
    let created = 0;
    for (const item of collected) {
      const existing =
        byCloudbedsId.get(item.id) ?? byName.get(item.name.trim().toLowerCase());
      if (existing) {
        const { error } = await supabase
          .from("beverage_catalog")
          .update({
            price: item.price,
            cloudbeds_item_id: item.id,
          })
          .eq("id", existing.id);
        if (!error) matched += 1;
      } else {
        // Cria novo produto sem estoque; gestor ajusta manualmente depois
        const { error } = await supabase.from("beverage_catalog").insert({
          property: data.property,
          name: item.name,
          price: item.price,
          current_stock: 0,
          min_stock: 0,
          cloudbeds_item_id: item.id,
        });
        if (!error) created += 1;
      }
    }

    return {
      ok: true,
      totalCloudbeds: collected.length,
      updated: matched,
      created,
    };
  });

// ============================================================
// 2) Lançar débito de bebidas na conta do quarto (Folio)
// ============================================================
const chargeSchema = z.object({
  property: propertySchema,
  roomNumber: z.string().trim().min(1),
  items: z
    .array(
      z.object({
        beverage_id: z.string().uuid(),
        cloudbeds_item_id: z.string().trim().min(1),
        name: z.string().trim().min(1),
        quantity: z.number().int().positive(),
        unit_price: z.number().nonnegative(),
      }),
    )
    .min(1),
});

export const postCloudbedsCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => chargeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roleSet = new Set((roles ?? []).map((r) => r.role));
    const allowed =
      roleSet.has("gestor") ||
      roleSet.has("admin") ||
      roleSet.has("recepcao") ||
      roleSet.has("funcionario");
    if (!allowed) throw new Error("Sem permissão para lançar débitos");

    const { cloudbedsFetch } = await import("@/lib/cloudbeds/client.server");
    const property = data.property.toLowerCase() as "ipanema" | "botafogo";

    // Localiza reserva ativa (checked_in) no quarto
    const qs = new URLSearchParams({
      status: "checked_in",
      pageSize: "100",
    });
    const listRes = await cloudbedsFetch(property, `/getReservations?${qs.toString()}`);
    if (!listRes.ok) {
      throw new Error(`Falha ao consultar reservas no Cloudbeds: ${listRes.status}`);
    }
    const listJson = (await listRes.json()) as {
      success?: boolean;
      data?: Array<{
        reservationID?: string;
        rooms?: Array<{ roomName?: string; roomNumber?: string }>;
      }>;
    };
    if (listJson.success === false) throw new Error("Cloudbeds retornou erro ao listar reservas");

    const target = data.roomNumber.trim();
    const match = (listJson.data ?? []).find((r) =>
      (r.rooms ?? []).some((rm) => {
        const n = String(rm.roomName ?? rm.roomNumber ?? "").trim();
        return n === target;
      }),
    );

    if (!match?.reservationID) {
      throw new Error(
        `Nenhuma reserva ativa encontrada no quarto ${target}. Verifique se o hóspede ainda está hospedado.`,
      );
    }

    const posted: Array<{ cloudbeds_item_id: string; name: string; quantity: number }> = [];
    for (const item of data.items) {
      const body = new URLSearchParams({
        reservationID: match.reservationID,
        itemID: item.cloudbeds_item_id,
        quantity: String(item.quantity),
        subtotal: (item.unit_price * item.quantity).toFixed(2),
      });
      const res = await cloudbedsFetch(property, `/postItem`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
      };
      if (!res.ok || json.success === false) {
        throw new Error(
          json.message ??
            `Cloudbeds recusou o lançamento do item "${item.name}" (${res.status}).`,
        );
      }
      posted.push({
        cloudbeds_item_id: item.cloudbeds_item_id,
        name: item.name,
        quantity: item.quantity,
      });
    }

    return {
      ok: true,
      reservationID: match.reservationID,
      posted,
    };
  });
