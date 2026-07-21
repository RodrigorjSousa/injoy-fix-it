import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/store";
import {
  reconcileConfig,
  defaultConfig,
  type BoasVindasAudience,
  type BoasVindasBlockId,
  type BoasVindasConfigEntry,
} from "@/lib/boas-vindas-blocks";

function detectAudience(me: ReturnType<typeof useMe>["data"]): BoasVindasAudience | null {
  if (!me) return null;
  if (me.isAdmin || me.isGestor) return null; // gestor mantém layout clássico
  if (me.isRecepcao) return "recepcao";
  if (me.isCamareira) return "camareira";
  // técnicos de manutenção
  const cats = me.funcionario?.categorias ?? [];
  if (cats.length > 0) return "manutencao";
  return "camareira";
}

export function useBoasVindasConfig(): {
  audience: BoasVindasAudience | null;
  blocks: BoasVindasConfigEntry[];
  loading: boolean;
} {
  const { data: me } = useMe();
  const audience = useMemo(() => detectAudience(me), [me]);
  const [blocks, setBlocks] = useState<BoasVindasConfigEntry[]>(() => defaultConfig());
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!audience) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("boas_vindas_config")
        .select("blocks")
        .eq("audience", audience)
        .maybeSingle();
      if (cancelled) return;
      setBlocks(reconcileConfig((data as { blocks?: unknown } | null)?.blocks));
      setLoading(false);
    })();

    const channel = supabase
      .channel(`boas_vindas_config_${audience}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "boas_vindas_config", filter: `audience=eq.${audience}` },
        (payload) => {
          const next = (payload.new as { blocks?: unknown } | null)?.blocks;
          if (next) setBlocks(reconcileConfig(next));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [audience]);

  const visibleSet = useMemo(
    () => new Set<BoasVindasBlockId>(blocks.filter((b) => b.visible).map((b) => b.id)),
    [blocks],
  );

  return {
    audience,
    blocks,
    loading,
    isVisible: (id: BoasVindasBlockId) => (audience ? visibleSet.has(id) : true),
    orderedVisibleIds: audience ? blocks.filter((b) => b.visible).map((b) => b.id) : [],
  } as unknown as {
    audience: BoasVindasAudience | null;
    blocks: BoasVindasConfigEntry[];
    loading: boolean;
  };
}

// Versão mais completa exposta separadamente para o consumo em componentes.
export function useBoasVindasView() {
  const { data: me } = useMe();
  const audience = useMemo(() => detectAudience(me), [me]);
  const [blocks, setBlocks] = useState<BoasVindasConfigEntry[]>(() => defaultConfig());
  const [loading, setLoading] = useState<boolean>(audience !== null);

  useEffect(() => {
    if (!audience) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("boas_vindas_config")
        .select("blocks")
        .eq("audience", audience)
        .maybeSingle();
      if (cancelled) return;
      setBlocks(reconcileConfig((data as { blocks?: unknown } | null)?.blocks));
      setLoading(false);
    })();

    const channel = supabase
      .channel(`boas_vindas_config_${audience}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "boas_vindas_config", filter: `audience=eq.${audience}` },
        (payload) => {
          const next = (payload.new as { blocks?: unknown } | null)?.blocks;
          if (next) setBlocks(reconcileConfig(next));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [audience]);

  const isVisible = (id: BoasVindasBlockId) => {
    if (!audience) return true; // gestor/admin vê tudo (layout clássico)
    return blocks.some((b) => b.id === id && b.visible);
  };
  const orderedVisibleIds = audience
    ? blocks.filter((b) => b.visible).map((b) => b.id)
    : [];

  return { audience, blocks, loading, isVisible, orderedVisibleIds };
}
