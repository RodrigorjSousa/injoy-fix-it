import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { ArrowLeft, Building2, BedDouble, CheckCircle2, ClipboardCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useMe } from "@/lib/store";
import { Navigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/vistoria")({
  component: VistoriaPage,
});

type Unidade = "Botafogo" | "Ipanema";

const QUARTOS_POR_UNIDADE: Record<Unidade, string[]> = {
  Botafogo: [
    "001","002","003","005","006","107","108","109","110","111",
    "112","113","114","115","117","118","301","401","501",
  ],
  Ipanema: [
    "001","002","103","104","205","206","307","308","309","410","411","412",
  ],
};

const CHECKLIST = [
  { id: "limpeza", label: "Limpeza geral do quarto (piso, móveis, vidros)" },
  { id: "banheiro", label: "Banheiro higienizado (vaso, pia, box, espelho)" },
  { id: "enxoval", label: "Enxoval completo (lençóis, fronhas, toalhas)" },
  { id: "amenities", label: "Amenities reabastecidos (shampoo, sabonete, papel)" },
  { id: "frigobar", label: "Frigobar abastecido e funcionando" },
  { id: "ar", label: "Ar condicionado funcionando e em temperatura adequada" },
  { id: "tv", label: "TV funcionando e controle remoto com pilhas" },
  { id: "iluminacao", label: "Iluminação completa (todas as lâmpadas acesas)" },
  { id: "tomadas", label: "Tomadas e interruptores funcionando" },
  { id: "hidraulica", label: "Hidráulica em ordem (descarga, torneiras, chuveiro)" },
  { id: "fechadura", label: "Fechadura e chaves/cartões testados" },
  { id: "janelas", label: "Janelas e cortinas em bom estado" },
  { id: "odor", label: "Ambiente sem odores / aromatizado" },
];

type Registro = {
  id: string;
  unidade: Unidade;
  quarto: string;
  responsavel: string;
  data: string;
  itens: Record<string, boolean>;
  observacoes: string;
  liberado: boolean;
};

const STORAGE_KEY = "injoy:vistorias";

function loadRegistros(): Registro[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveRegistros(list: Registro[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function VistoriaPage() {
  const { data: me } = useMe();
  const podeAcessar = !!me && (me.isGestor || me.isAdmin || me.isRecepcao);

  const [unidade, setUnidade] = useState<Unidade | null>(null);
  const [quarto, setQuarto] = useState<string | null>(null);
  const [itens, setItens] = useState<Record<string, boolean>>({});
  const [obs, setObs] = useState("");
  const [registros, setRegistros] = useState<Registro[]>([]);

  useEffect(() => {
    setRegistros(loadRegistros());
  }, []);

  const quartos = unidade ? QUARTOS_POR_UNIDADE[unidade] : [];
  const total = CHECKLIST.length;
  const concluidos = Object.values(itens).filter(Boolean).length;
  const todosOk = concluidos === total;
  const ultima = useMemo(
    () => (unidade && quarto ? registros.find((r) => r.unidade === unidade && r.quarto === quarto) : null),
    [registros, unidade, quarto],
  );

  if (me && !podeAcessar) return <Navigate to="/painel" replace />;

  const reset = () => {
    setQuarto(null);
    setItens({});
    setObs("");
  };

  const liberar = () => {
    if (!unidade || !quarto) return;
    if (!todosOk) {
      toast.error("Marque todos os itens do checklist antes de liberar.");
      return;
    }
    const novo: Registro = {
      id: crypto.randomUUID(),
      unidade,
      quarto,
      responsavel: me?.funcionario?.nome || me?.email || "Recepção",
      data: new Date().toISOString(),
      itens,
      observacoes: obs,
      liberado: true,
    };
    const updated = [novo, ...registros.filter((r) => !(r.unidade === unidade && r.quarto === quarto))];
    saveRegistros(updated);
    setRegistros(updated);
    toast.success(`Quarto ${quarto} (${unidade}) liberado para check-in.`);
    reset();
  };

  const bloquear = () => {
    if (!unidade || !quarto) return;
    if (!obs.trim()) {
      toast.error("Descreva o motivo do bloqueio nas observações.");
      return;
    }
    const novo: Registro = {
      id: crypto.randomUUID(),
      unidade,
      quarto,
      responsavel: me?.profile?.nome || me?.email || "Recepção",
      data: new Date().toISOString(),
      itens,
      observacoes: obs,
      liberado: false,
    };
    const updated = [novo, ...registros.filter((r) => !(r.unidade === unidade && r.quarto === quarto))];
    saveRegistros(updated);
    setRegistros(updated);
    toast.warning(`Quarto ${quarto} (${unidade}) marcado como NÃO liberado.`);
    reset();
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Link
          to="/recepcao"
          className="h-9 w-9 grid place-items-center rounded-lg border border-border hover:bg-muted"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vistoria para Check-in</h1>
          <p className="text-sm text-muted-foreground">
            Verifique o quarto antes da entrada do hóspede e libere para check-in.
          </p>
        </div>
      </header>

      {/* Etapa 1: Unidade */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="h-4 w-4 text-primary" />
          <h2 className="font-medium">1. Selecione a unidade</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(["Botafogo", "Ipanema"] as Unidade[]).map((u) => (
            <button
              key={u}
              onClick={() => { setUnidade(u); setQuarto(null); setItens({}); setObs(""); }}
              className={cn(
                "rounded-lg border p-4 text-left transition-all",
                unidade === u
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                  : "border-border hover:border-primary/40",
              )}
            >
              <div className="font-semibold">{u}</div>
              <div className="text-xs text-muted-foreground">
                {QUARTOS_POR_UNIDADE[u].length} quartos
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Etapa 2: Quarto */}
      {unidade && (
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <BedDouble className="h-4 w-4 text-primary" />
            <h2 className="font-medium">2. Selecione o quarto ({unidade})</h2>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2">
            {quartos.map((q) => {
              const r = registros.find((x) => x.unidade === unidade && x.quarto === q);
              const liberado = r?.liberado;
              return (
                <button
                  key={q}
                  onClick={() => { setQuarto(q); setItens({}); setObs(""); }}
                  className={cn(
                    "relative rounded-lg border py-3 text-sm font-medium transition-all",
                    quarto === q
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-border hover:border-primary/40",
                  )}
                >
                  {q}
                  {r && (
                    <span
                      className={cn(
                        "absolute top-1 right-1 h-2 w-2 rounded-full",
                        liberado ? "bg-emerald-500" : "bg-red-500",
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Etapa 3: Checklist */}
      {unidade && quarto && (
        <section className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              <h2 className="font-medium">3. Checklist — Quarto {quarto} / {unidade}</h2>
            </div>
            <div className="text-xs font-medium px-2 py-1 rounded-full bg-muted">
              {concluidos}/{total} itens
            </div>
          </div>

          {ultima && (
            <div className={cn(
              "rounded-lg border p-3 text-xs",
              ultima.liberado ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900",
            )}>
              Última vistoria: {new Date(ultima.data).toLocaleString("pt-BR")} por {ultima.responsavel} —{" "}
              {ultima.liberado ? "Liberado" : "NÃO liberado"}
              {ultima.observacoes && <div className="mt-1 opacity-80">Obs: {ultima.observacoes}</div>}
            </div>
          )}

          <ul className="space-y-2">
            {CHECKLIST.map((item) => {
              const checked = !!itens[item.id];
              return (
                <li key={item.id}>
                  <label
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                      checked ? "border-emerald-300 bg-emerald-50/50" : "border-border hover:bg-muted/40",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-emerald-600"
                      checked={checked}
                      onChange={(e) => setItens((p) => ({ ...p, [item.id]: e.target.checked }))}
                    />
                    <span className="text-sm">{item.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>

          <div>
            <label className="text-sm font-medium block mb-1">Observações</label>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={3}
              placeholder="Registre pendências, avarias ou informações relevantes…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <button
              onClick={bloquear}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-red-300 bg-red-50 text-red-700 px-4 py-2.5 text-sm font-medium hover:bg-red-100"
            >
              <AlertTriangle className="h-4 w-4" /> Não liberar (com pendências)
            </button>
            <button
              onClick={liberar}
              disabled={!todosOk}
              className={cn(
                "w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white",
                todosOk ? "bg-emerald-600 hover:bg-emerald-700" : "bg-muted text-muted-foreground cursor-not-allowed",
              )}
            >
              <CheckCircle2 className="h-4 w-4" /> Liberar para check-in
            </button>
          </div>
        </section>
      )}

      {/* Histórico recente */}
      {registros.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-medium mb-3">Vistorias recentes</h2>
          <ul className="divide-y divide-border">
            {registros.slice(0, 8).map((r) => (
              <li key={r.id} className="py-2 flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">{r.unidade} · Quarto {r.quarto}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.data).toLocaleString("pt-BR")} · {r.responsavel}
                  </div>
                </div>
                <span
                  className={cn(
                    "text-xs font-semibold px-2 py-1 rounded-full",
                    r.liberado ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700",
                  )}
                >
                  {r.liberado ? "Liberado" : "Bloqueado"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
