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
    const collected: Array<{
      id: string;
      name: string;
      price: number;
      stockInventory: boolean;
      itemQuantity: number | null;
      reorderThreshold: number | null;
    }> = [];
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
        const priceRaw = it.grossPrice ?? it.price ?? it.itemPrice ?? it.defaultPrice;
        const price = Number(priceRaw);
        if (!id || !name) continue;
        if (priceRaw === null || priceRaw === undefined || !Number.isFinite(price) || price <= 0) continue;
        const lower = name.toLowerCase();
        const isService =
          /troca\s+(de\s+)?(cama|banho|roupa|toalha)/.test(lower) ||
          /chave\s+do\s+quarto/.test(lower) ||
          /di[aá]ria\s+pet/.test(lower) ||
          /cama\s+extra/.test(lower) ||
          /day\s+use/.test(lower) ||
          /late\s+check/.test(lower) ||
          /early\s+check/.test(lower) ||
          /troco\s+h[oó]spede/.test(lower);
        if (isService) continue;
        const stockInventory = Boolean(it.stockInventory);
        const qtyRaw = it.itemQuantity;
        const itemQuantity =
          stockInventory && qtyRaw !== null && qtyRaw !== undefined && Number.isFinite(Number(qtyRaw))
            ? Number(qtyRaw)
            : null;
        const reorderRaw = it.reorderThreshold;
        const reorderThreshold =
          reorderRaw !== null && reorderRaw !== undefined && Number.isFinite(Number(reorderRaw))
            ? Number(reorderRaw)
            : null;
        collected.push({ id, name, price, stockInventory, itemQuantity, reorderThreshold });
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
    const seenCatalogIds = new Set<string>();
    for (const item of collected) {
      const existing =
        byCloudbedsId.get(item.id) ?? byName.get(item.name.trim().toLowerCase());
      const patch: {
        name: string;
        price: number;
        cloudbeds_item_id: string;
        current_stock?: number;
        min_stock?: number;
      } = {
        name: item.name,
        price: item.price,
        cloudbeds_item_id: item.id,
      };

      if (existing) {
        seenCatalogIds.add(existing.id);
        const { error } = await supabase
          .from("beverage_catalog")
          .update(patch)
          .eq("id", existing.id);
        if (!error) matched += 1;
      } else {
        const { data: inserted, error } = await supabase
          .from("beverage_catalog")
          .insert({
            property: data.property,
            name: item.name,
            price: item.price,
            current_stock: item.stockInventory && item.itemQuantity !== null ? item.itemQuantity : 0,
            min_stock: item.reorderThreshold ?? 0,
            cloudbeds_item_id: item.id,
          })
          .select("id")
          .single();
        if (!error) {
          created += 1;
          if (inserted?.id) seenCatalogIds.add(inserted.id);
        }
      }
    }


    // Cloudbeds é a fonte da verdade: itens antigos que sobraram no catálogo
    // e não correspondem a nenhum item vindo do Cloudbeds são removidos.
    const stale = (catalog ?? []).filter((b) => !seenCatalogIds.has(b.id));
    let removed = 0;
    for (const b of stale) {
      const { error } = await supabase
        .from("beverage_catalog")
        .delete()
        .eq("id", b.id);
      if (!error) removed += 1;
    }

    return {
      ok: true,
      totalCloudbeds: collected.length,
      updated: matched,
      created,
      removed,
    };
  });

// ============================================================
// 2) Lançar débito de bebidas na conta do quarto (Folio)
// ============================================================
const chargeSchema = z.object({
  property: propertySchema,
  // Quando presente: lança na folio do quarto (fiado).
  // Quando ausente: venda de balcão -> lança na "House Account" da unidade
  // configurada em app_settings (cloudbeds_house_account_<property>).
  roomNumber: z.string().trim().min(1).optional(),
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

    let reservationID: string | null = null;
    let target: string | null = null;

    if (data.roomNumber) {
      // Folio do quarto: localiza reserva ativa (checked_in) no quarto
      target = data.roomNumber.trim();
      const qs = new URLSearchParams({ status: "checked_in", pageSize: "100" });
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
      reservationID = match.reservationID;
    } else {
      // Venda de balcão: usa a "House Account" configurada pela gestão.
      // app_settings tem RLS restrita a gestor/admin, então lemos com admin.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const settingKey = `cloudbeds_house_account_${property}`;
      const { data: setting } = await supabaseAdmin
        .from("app_settings")
        .select("value")
        .eq("key", settingKey)
        .maybeSingle();
      const houseAccountId = (setting?.value ?? "").trim();
      if (!houseAccountId) {
        throw new Error(
          `Conta-balcão do Cloudbeds não configurada para ${data.property}. Peça ao gestor para configurar em Frigobar > Catálogo.`,
        );
      }
      reservationID = houseAccountId;
    }

    const posted: Array<{ cloudbeds_item_id: string; name: string; quantity: number }> = [];
    for (const item of data.items) {
      const body = new URLSearchParams({
        reservationID: reservationID!,
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
      reservationID,
      counter: !data.roomNumber,
      posted,
    };
  });

// ============================================================
// 3) House Account (conta-balcão) do Cloudbeds — leitura/gravação
// ============================================================
const houseAccountSchema = z.object({
  property: propertySchema,
  reservationID: z.string().trim().max(64),
});

export const getCloudbedsHouseAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roleSet = new Set((roles ?? []).map((r) => r.role));
    if (!roleSet.has("gestor") && !roleSet.has("admin")) {
      throw new Error("Somente gestores podem consultar essas configurações");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("key, value")
      .in("key", ["cloudbeds_house_account_ipanema", "cloudbeds_house_account_botafogo"]);
    const map: Record<string, string> = {};
    for (const row of data ?? []) map[row.key] = row.value ?? "";
    return {
      ipanema: map["cloudbeds_house_account_ipanema"] ?? "",
      botafogo: map["cloudbeds_house_account_botafogo"] ?? "",
    };
  });

export const setCloudbedsHouseAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => houseAccountSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roleSet = new Set((roles ?? []).map((r) => r.role));
    if (!roleSet.has("gestor") && !roleSet.has("admin")) {
      throw new Error("Somente gestores podem alterar essa configuração");
    }
    const key = `cloudbeds_house_account_${data.property.toLowerCase()}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert({ key, value: data.reservationID.trim() }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
