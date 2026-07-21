import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, Eye, EyeOff, GripVertical, Save, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/store";
import {
  AUDIENCE_LABEL,
  BOAS_VINDAS_BLOCKS,
  defaultConfig,
  reconcileConfig,
  type BoasVindasAudience,
  type BoasVindasBlockId,
  type BoasVindasConfigEntry,
} from "@/lib/boas-vindas-blocks";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/gestao-boas-vindas")({
  component: GestaoBoasVindas,
  head: () => ({
    meta: [
      { title: "Boas-Vindas | Gestão de Blocos - INJOY Hotéis" },
      {
        name: "description",
        content:
          "Configure quais blocos aparecem na tela de boas-vindas de camareiras, recepção e manutenção, e reordene com arrastar e soltar.",
      },
      { property: "og:title", content: "Gestão de Boas-Vindas — INJOY Hotéis" },
      {
        property: "og:description",
        content: "Personalize a tela de boas-vindas dos funcionários da INJOY Hotéis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const AUDIENCES: BoasVindasAudience[] = ["camareira", "recepcao", "manutencao"];

const BLOCK_META = new Map(BOAS_VINDAS_BLOCKS.map((b) => [b.id, b] as const));

function SortableBlock({
  entry,
  onToggle,
}: {
  entry: BoasVindasConfigEntry;
  onToggle: () => void;
}) {
  const meta = BLOCK_META.get(entry.id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entry.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-2xl border bg-white p-3 shadow-sm transition",
        isDragging && "ring-2 ring-teal-400 shadow-lg",
        !entry.visible && "opacity-60",
      )}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-700 shrink-0"
        aria-label="Arrastar"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={20} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-900">{meta?.label ?? entry.id}</p>
        <p className="text-xs text-slate-500">{meta?.description}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition shrink-0",
          entry.visible
            ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
            : "bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200",
        )}
      >
        {entry.visible ? <Eye size={14} /> : <EyeOff size={14} />}
        {entry.visible ? "Visível" : "Oculto"}
      </button>
    </div>
  );
}

function AudienceEditor({ audience }: { audience: BoasVindasAudience }) {
  const [blocks, setBlocks] = useState<BoasVindasConfigEntry[]>(() => defaultConfig());
  const [initial, setInitial] = useState<BoasVindasConfigEntry[]>(() => defaultConfig());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("boas_vindas_config")
        .select("blocks")
        .eq("audience", audience)
        .maybeSingle();
      if (cancelled) return;
      const rec = reconcileConfig((data as { blocks?: unknown } | null)?.blocks);
      setBlocks(rec);
      setInitial(rec);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [audience]);

  const dirty = useMemo(
    () => JSON.stringify(blocks) !== JSON.stringify(initial),
    [blocks, initial],
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setBlocks((items) => {
      const oldIndex = items.findIndex((it) => it.id === active.id);
      const newIndex = items.findIndex((it) => it.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return items;
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  const toggleBlock = (id: BoasVindasBlockId) => {
    setBlocks((items) =>
      items.map((it) => (it.id === id ? { ...it, visible: !it.visible } : it)),
    );
  };

  const resetToDefaults = () => {
    setBlocks(defaultConfig());
  };

  const save = async () => {
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const payload = {
      audience,
      blocks: blocks as unknown as object,
      updated_by: userRes.user?.id ?? null,
    };
    const { error } = await supabase
      .from("boas_vindas_config")
      .upsert(payload, { onConflict: "audience" });
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar", { description: error.message });
      return;
    }
    setInitial(blocks);
    toast.success(`Configuração de ${AUDIENCE_LABEL[audience]} salva!`);
  };

  if (loading) {
    return (
      <div className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">
        Carregando configuração...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Arraste para reordenar. Toque em <b>Visível/Oculto</b> para mostrar ou esconder o bloco.
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={resetToDefaults}>
            <RotateCcw size={14} className="mr-1" /> Padrão
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={save}
            disabled={!dirty || saving}
            className="bg-teal-600 hover:bg-teal-700 text-white"
          >
            <Save size={14} className="mr-1" />
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {blocks.map((entry) => (
              <SortableBlock key={entry.id} entry={entry} onToggle={() => toggleBlock(entry.id)} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function GestaoBoasVindas() {
  const { data: me } = useMe();
  const [audience, setAudience] = useState<BoasVindasAudience>("camareira");

  if (!me?.isAdmin && !me?.isGestor) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border bg-white p-6 text-center">
          <h1 className="text-lg font-bold text-slate-900">Acesso restrito</h1>
          <p className="text-sm text-slate-500 mt-1">
            Apenas administradores e gestores podem configurar a tela de Boas-Vindas.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Link
          to="/boas-vindas"
          className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft size={14} /> Voltar
        </Link>
      </div>

      <div>
        <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900">
          Boas-Vindas dos Funcionários
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Escolha, por público, quais blocos aparecem e em que ordem na tela inicial.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {AUDIENCES.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAudience(a)}
            className={cn(
              "px-4 py-2 rounded-xl border text-xs font-bold uppercase tracking-wider transition",
              audience === a
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
            )}
          >
            {AUDIENCE_LABEL[a]}
          </button>
        ))}
      </div>

      <AudienceEditor key={audience} audience={audience} />

      <div className="rounded-2xl border bg-slate-50 p-4 text-xs text-slate-500">
        <b className="text-slate-700">Dica:</b> a visão de Gestor/Administrador permanece com o layout
        completo por padrão e não é afetada por estas configurações.
      </div>
    </div>
  );
}
