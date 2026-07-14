import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RefreshCw,
  Search,
  X,
  ImageIcon,
  Building2,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Camera,
  Ban,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useMe } from "@/lib/store";
import { EmptyState, ErrorState, LoadingState, friendlyError } from "@/components/ui/data-state";

export const Route = createFileRoute("/_authenticated/historico-vistorias")({
  component: HistoricoVistoriasPage,
});

type Inspection = {
  id: string;
  property: string;
  room_number: string;
  inspector_name: string;
  inspector_id: string | null;
  checklist: Record<string, boolean> | null;
  photo_url: string | null;
  created_at: string;
};

type DndPhoto = {
  id: string;
  property: string;
  room_number: string;
  photo_url: string;
  camareira_name: string;
  created_at: string;
};

type Unidade = "Todas" | "Botafogo" | "Ipanema";

type LightboxState = {
  images: { url: string; caption?: string }[];
  index: number;
} | null;

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function keyOf(property: string, room: string) {
  return `${property}::${room}`;
}

const PAGE_SIZE = 20;

function HistoricoVistoriasPage() {
  const { data: me } = useMe();
  const isFull = !!me && (me.isGestor || me.isAdmin);

  const [rows, setRows] = useState<Inspection[]>([]);
  const [dndByRoom, setDndByRoom] = useState<Record<string, DndPhoto[]>>({});
  const [inspByRoom, setInspByRoom] = useState<Record<string, Inspection[]>>({});
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingExtras, setLoadingExtras] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [unidade, setUnidade] = useState<Unidade>("Todas");
  const [nome, setNome] = useState("");
  const [data, setData] = useState("");
  const [lightbox, setLightbox] = useState<LightboxState>(null);

  const applyFilters = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: query builder do supabase
    (q: any) => {
      if (unidade !== "Todas") q = q.eq("property", unidade);
      if (data) {
        const [y, m, d] = data.split("-").map(Number);
        const start = new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
        const end = new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
        q = q.gte("created_at", start).lte("created_at", end);
      }
      return q;
    },
    [unidade, data],
  );

  const fetchExtras = useCallback(async () => {
    setLoadingExtras(true);
    try {
      let dq = supabase
        .from("room_housekeeping_history")
        .select("id, property, room_number, photo_url, camareira_name, created_at")
        .eq("action_type", "NÃO PERTURBE")
        .not("photo_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (unidade !== "Todas") dq = dq.eq("property", unidade);
      const { data: dd, error: derr } = await dq;
      if (derr) throw derr;
      const dndGroup: Record<string, DndPhoto[]> = {};
      for (const r of (dd ?? []) as DndPhoto[]) {
        const k = keyOf(r.property, r.room_number);
        (dndGroup[k] ||= []).push(r);
      }
      setDndByRoom(dndGroup);
    } catch (e) {
      console.error("[historico-vistorias] falha ao carregar DND", e);
    } finally {
      setLoadingExtras(false);
    }
  }, [unidade]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const q = applyFilters(
        supabase
          .from("room_inspections")
          .select("*")
          .order("created_at", { ascending: false })
          .range(0, PAGE_SIZE - 1),
      );
      const { data: d, error } = await q;
      if (error) throw error;
      const list = (d ?? []) as Inspection[];
      setRows(list);
      setHasMore(list.length === PAGE_SIZE);

      const inspGroup: Record<string, Inspection[]> = {};
      for (const r of list) {
        const k = keyOf(r.property, r.room_number);
        (inspGroup[k] ||= []).push(r);
      }
      setInspByRoom(inspGroup);

      fetchExtras();
    } catch (e) {
      setErro(friendlyError(e));
      toast.error("Não foi possível carregar as vistorias");
    } finally {
      setLoading(false);
    }
  }, [applyFilters, fetchExtras]);

  const carregarMais = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const from = rows.length;
      const to = from + PAGE_SIZE - 1;
      const q = applyFilters(
        supabase
          .from("room_inspections")
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, to),
      );
      const { data: d, error } = await q;
      if (error) throw error;
      const list = (d ?? []) as Inspection[];
      setRows((prev) => {
        const merged = [...prev, ...list];
        const inspGroup: Record<string, Inspection[]> = {};
        for (const r of merged) {
          const k = keyOf(r.property, r.room_number);
          (inspGroup[k] ||= []).push(r);
        }
        setInspByRoom(inspGroup);
        return merged;
      });
      setHasMore(list.length === PAGE_SIZE);
    } catch (e) {
      toast.error(friendlyError(e, "Falha ao carregar mais"));
    } finally {
      setLoadingMore(false);
    }
  }, [applyFilters, hasMore, loading, loadingMore, rows.length]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) carregarMais();
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [carregarMais]);

  // Teclado no lightbox
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowRight")
        setLightbox((s) => (s ? { ...s, index: (s.index + 1) % s.images.length } : s));
      if (e.key === "ArrowLeft")
        setLightbox((s) =>
          s ? { ...s, index: (s.index - 1 + s.images.length) % s.images.length } : s,
        );
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (nome && !r.inspector_name.toLowerCase().includes(nome.toLowerCase())) return false;
      if (data) {
        const d = new Date(r.created_at);
        const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (s !== data) return false;
      }
      return true;
    });
  }, [rows, nome, data]);

  if (!isFull) {
    return (
      <div className="p-6">
        <ErrorState
          title="Acesso restrito"
          description="Apenas gestores podem visualizar o histórico de vistorias."
        />
      </div>
    );
  }

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 min-h-[calc(100vh-4rem)] bg-slate-50 pb-12">
      <div className="bg-blue-950 text-white p-5 shadow-md sticky top-0 z-10 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Histórico de Vistorias</h1>
          <p className="text-xs text-blue-300">Vistorias preventivas realizadas pela recepção</p>
        </div>
        <button
          onClick={fetchRows}
          className="p-2 bg-blue-900/60 rounded-lg text-blue-100"
          aria-label="Atualizar"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Unidade
            </label>
            <div className="flex gap-2 mt-1">
              {(["Todas", "Botafogo", "Ipanema"] as Unidade[]).map((u) => (
                <button
                  key={u}
                  onClick={() => setUnidade(u)}
                  className={cn(
                    "flex-1 inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold",
                    unidade === u
                      ? "border-blue-700 bg-blue-50 text-blue-800"
                      : "border-slate-200 bg-white text-slate-500",
                  )}
                >
                  <Building2 size={12} /> {u}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Recepcionista
            </label>
            <div className="relative mt-1">
              <Search
                size={14}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Buscar nome…"
                className="w-full pl-7 pr-2 py-1.5 rounded-lg border border-slate-200 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Data
            </label>
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="w-full mt-1 px-2 py-1.5 rounded-lg border border-slate-200 text-sm"
            />
          </div>
        </div>

        {loading ? (
          <LoadingState label="Carregando vistorias…" />
        ) : erro ? (
          <ErrorState title="Erro" description={erro} onRetry={fetchRows} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Nenhuma vistoria encontrada"
            description="Ajuste os filtros para ver resultados."
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => {
              const items = r.checklist ? Object.entries(r.checklist) : [];
              const ok = items.filter(([, v]) => v).length;
              const roomKey = keyOf(r.property, r.room_number);

              // Fotos da recepção: a própria vistoria + demais vistorias do mesmo quarto
              const recepcaoFotos: { url: string; caption?: string }[] = [];
              if (r.photo_url)
                recepcaoFotos.push({
                  url: r.photo_url,
                  caption: `${r.inspector_name} · ${fmtDateTime(r.created_at)}`,
                });
              for (const other of inspByRoom[roomKey] ?? []) {
                if (other.id === r.id || !other.photo_url) continue;
                recepcaoFotos.push({
                  url: other.photo_url,
                  caption: `${other.inspector_name} · ${fmtDateTime(other.created_at)}`,
                });
              }

              const dndFotos = (dndByRoom[roomKey] ?? []).map((d) => ({
                url: d.photo_url,
                caption: `${d.camareira_name} · ${fmtDateTime(d.created_at)}`,
              }));

              return (
                <div
                  key={r.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        INJOY {r.property}
                      </p>
                      <h3 className="text-base font-black text-slate-900">
                        Quarto {r.room_number}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Vistoriado por{" "}
                        <span className="font-semibold text-slate-700">{r.inspector_name}</span> ·{" "}
                        {fmtDateTime(r.created_at)}
                      </p>
                    </div>
                    {r.photo_url && (
                      <button
                        onClick={() => setLightbox({ images: recepcaoFotos, index: 0 })}
                        className="shrink-0"
                      >
                        <img
                          src={r.photo_url}
                          alt="Vistoria"
                          className="h-16 w-16 rounded-lg object-cover border border-slate-200"
                        />
                      </button>
                    )}
                  </div>

                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Checklist ({ok}/{items.length})
                    </p>
                    <ul className="space-y-1">
                      {items.map(([k, v]) => (
                        <li key={k} className="flex items-center gap-2 text-xs">
                          {v ? (
                            <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                          ) : (
                            <XCircle size={14} className="text-rose-500 shrink-0" />
                          )}
                          <span className={v ? "text-slate-700" : "text-rose-600"}>{k}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Galeria: Fotos da Recepção */}
                  <PhotoGroup
                    title="Fotos da Recepção"
                    icon={<Camera size={13} className="text-emerald-600" />}
                    photos={recepcaoFotos}
                    loading={false}
                    emptyLabel="Nenhuma imagem da recepção disponível"
                    onOpen={(idx) => setLightbox({ images: recepcaoFotos, index: idx })}
                  />

                  {/* Galeria: Não Perturbe */}
                  <PhotoGroup
                    title='Status "Não Perturbe"'
                    icon={<Ban size={13} className="text-rose-600" />}
                    photos={dndFotos}
                    loading={loadingExtras}
                    emptyLabel="Nenhuma imagem de 'Não Perturbe' disponível"
                    onOpen={(idx) => setLightbox({ images: dndFotos, index: idx })}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {lightbox && <Lightbox state={lightbox} onChange={setLightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

function PhotoGroup({
  title,
  icon,
  photos,
  loading,
  emptyLabel,
  onOpen,
}: {
  title: string;
  icon: React.ReactNode;
  photos: { url: string; caption?: string }[];
  loading: boolean;
  emptyLabel: string;
  onOpen: (idx: number) => void;
}) {
  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          {title}
          {photos.length > 0 && (
            <span className="ml-1 text-slate-400 normal-case font-semibold">({photos.length})</span>
          )}
        </p>
      </div>
      {loading ? (
        <div className="flex gap-2 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 w-20 rounded-lg bg-slate-100 animate-pulse shrink-0" />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-lg px-3 py-2">
          <ImageIcon size={14} />
          <span>{emptyLabel}</span>
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
          {photos.map((p, idx) => (
            <button
              key={`${p.url}-${idx}`}
              onClick={() => onOpen(idx)}
              className="relative shrink-0 snap-start group"
              aria-label="Abrir imagem"
            >
              <img
                src={p.url}
                alt={p.caption ?? title}
                loading="lazy"
                className="h-20 w-20 rounded-lg object-cover border border-slate-200 group-hover:border-blue-500 transition-colors"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Lightbox({
  state,
  onChange,
  onClose,
}: {
  state: NonNullable<LightboxState>;
  onChange: (s: LightboxState) => void;
  onClose: () => void;
}) {
  const { images, index } = state;
  const current = images[index];
  if (!current) return null;

  const prev = () =>
    onChange({ ...state, index: (index - 1 + images.length) % images.length });
  const next = () => onChange({ ...state, index: (index + 1) % images.length });

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 bg-white/90 rounded-full p-2 shadow"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Fechar"
      >
        <X size={20} />
      </button>

      {images.length > 1 && (
        <>
          <button
            className="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 bg-white/90 rounded-full p-2 shadow"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            aria-label="Anterior"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 bg-white/90 rounded-full p-2 shadow"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            aria-label="Próxima"
          >
            <ChevronRight size={22} />
          </button>
        </>
      )}

      <div
        className="flex flex-col items-center gap-3 max-w-full max-h-full"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={current.url}
          alt={current.caption ?? "Imagem"}
          className="max-h-[80vh] max-w-full rounded-xl shadow-2xl object-contain"
        />
        <div className="text-center text-white/90 text-xs">
          {current.caption && <p className="font-medium">{current.caption}</p>}
          {images.length > 1 && (
            <p className="text-white/60 mt-0.5">
              {index + 1} / {images.length}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
