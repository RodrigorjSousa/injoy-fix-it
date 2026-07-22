import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  RefreshCw,
  LogIn,
  Coffee,
  Utensils,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Search,
  Users,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { syncPontomais } from "@/lib/pontomais.functions";
import type { Unidade } from "@/lib/store";
import { cn } from "@/lib/utils";

type Funcionario = {
  id: string;
  nome: string;
  email: string;
  cpf: string | null;
  pontomais_employee_id: string | null;
  categorias: string[];
};

type RegistroPonto = {
  funcionario_id: string;
  data: string;
  entrada: string | null;
  almoco_saida: string | null;
  almoco_retorno: string | null;
  saida: string | null;
  ultima_atualizacao: string;
};

function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function unidadeMatchesCategoria(unidade: Unidade, categorias: string[]): boolean {
  const u = unidade.toLowerCase();
  return categorias.some((c) => c.toLowerCase().includes(u));
}

const EXCLUIDOS = new Set<string>(
  ["rodrigo sousa", "rita", "mathaus", "cristina", "luciene", "lucivaldo", "walter"].map(
    normalizarNome,
  ),
);

function fmt(t: string | null): string {
  if (!t) return "—";
  return t.substring(0, 5);
}

function initials(nome: string): string {
  const parts = nome.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function PontoFuncionariosPainel({ unidade }: { unidade: Unidade }) {
  const [data, setData] = useState<string>(() => todaySP());
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [registros, setRegistros] = useState<RegistroPonto[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [busca, setBusca] = useState("");

  const syncFn = useServerFn(syncPontomais);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: fs, error: fErr }, { data: rs, error: rErr }] = await Promise.all([
        supabase
          .from("funcionarios")
          .select("id, nome, email, cpf, pontomais_employee_id, categorias")
          .order("nome"),
        supabase.from("registro_ponto_pontomais").select("*").eq("data", data),
      ]);
      if (fErr) throw fErr;
      if (rErr) throw rErr;
      setFuncionarios((fs ?? []) as Funcionario[]);
      setRegistros((rs ?? []) as RegistroPonto[]);
    } catch (err) {
      console.error("[ponto-painel]", err);
      toast.error(err instanceof Error ? err.message : "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }, [data]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const funcionariosUnidade = useMemo(
    () =>
      funcionarios.filter((f) => {
        const n = normalizarNome(f.nome);
        for (const ex of EXCLUIDOS) {
          if (n === ex || n.startsWith(ex + " ") || n.includes(" " + ex)) return false;
        }
        return f.categorias.length === 0 || unidadeMatchesCategoria(unidade, f.categorias);
      }),
    [funcionarios, unidade],
  );

  const registroPorFunc = useMemo(() => {
    const m: Record<string, RegistroPonto> = {};
    for (const r of registros) m[r.funcionario_id] = r;
    return m;
  }, [registros]);

  const filtrados = useMemo(() => {
    const q = normalizarNome(busca);
    if (!q) return funcionariosUnidade;
    return funcionariosUnidade.filter((f) => normalizarNome(f.nome).includes(q));
  }, [funcionariosUnidade, busca]);

  const stats = useMemo(() => {
    let presentes = 0;
    let almocando = 0;
    let finalizados = 0;
    let ausentes = 0;
    for (const f of funcionariosUnidade) {
      const r = registroPorFunc[f.id];
      if (!r || !r.entrada) ausentes++;
      else if (r.saida) finalizados++;
      else if (r.almoco_saida && !r.almoco_retorno) almocando++;
      else presentes++;
    }
    return { presentes, almocando, finalizados, ausentes, total: funcionariosUnidade.length };
  }, [funcionariosUnidade, registroPorFunc]);

  const sincronizar = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    const t = toast.loading("Sincronizando com Pontomais...");
    try {
      const res = await syncFn({
        data: {
          funcionarioIds: funcionariosUnidade.map((f) => f.id),
          startDate: data,
          endDate: data,
        },
      });
      const errored = (res.results ?? []).filter((r) => r.error);
      if (errored.length > 0) {
        toast.error(`${errored.length} funcionário(s) com erro`, { id: t });
      } else {
        toast.success("Ponto atualizado", { id: t });
      }
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao sincronizar", { id: t });
    } finally {
      setSyncing(false);
    }
  }, [syncing, syncFn, funcionariosUnidade, data, carregar]);

  return (
    <section className="mt-8 rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 text-slate-100">
      <header className="px-6 pt-6 pb-4 border-b border-slate-800 bg-gradient-to-br from-blue-950 to-slate-950">
        <h2 className="text-xl font-black text-white flex items-center gap-2">
          <Clock className="h-5 w-5 text-blue-400" />
          Ponto dos Funcionários · INJOY {unidade}
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Batidas registradas na Pontomais em{" "}
          <b className="text-slate-200">
            {new Date(data + "T12:00").toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "2-digit",
              month: "long",
            })}
          </b>
        </p>
      </header>

      <div className="px-6 py-4 border-b border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
          />
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar funcionário..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 placeholder:text-slate-500"
            />
          </div>
          <button
            onClick={sincronizar}
            disabled={syncing || funcionariosUnidade.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 rounded-lg text-sm font-bold text-white"
          >
            <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
            Sincronizar
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <StatChip label="Total" value={stats.total} color="slate" icon={Users} />
          <StatChip label="Trabalhando" value={stats.presentes} color="emerald" icon={CheckCircle2} />
          <StatChip label="No almoço" value={stats.almocando} color="amber" icon={Utensils} />
          <StatChip label="Finalizados" value={stats.finalizados} color="blue" icon={LogOut} />
          <StatChip label="Sem batida" value={stats.ausentes} color="red" icon={AlertCircle} />
        </div>
      </div>

      <div className="max-h-[70vh] overflow-y-auto p-4 space-y-2">
        {loading && (
          <div className="text-center py-10 text-slate-500 text-sm">Carregando batidas...</div>
        )}
        {!loading && filtrados.length === 0 && (
          <div className="text-center py-10 text-slate-500 text-sm">
            Nenhum funcionário encontrado
          </div>
        )}
        {!loading &&
          filtrados.map((f) => {
            const r = registroPorFunc[f.id];
            const temEntrada = !!r?.entrada;
            const finalizou = !!r?.saida;
            const almocando = !!r?.almoco_saida && !r?.almoco_retorno;

            let statusLabel = "Sem batida";
            let statusColor = "bg-red-500/20 text-red-300 border-red-500/40";
            if (finalizou) {
              statusLabel = "Jornada finalizada";
              statusColor = "bg-blue-500/20 text-blue-300 border-blue-500/40";
            } else if (almocando) {
              statusLabel = "No almoço";
              statusColor = "bg-amber-500/20 text-amber-300 border-amber-500/40";
            } else if (temEntrada) {
              statusLabel = "Trabalhando";
              statusColor = "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
            }

            return (
              <div
                key={f.id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 grid place-items-center text-white font-black text-sm shrink-0">
                    {initials(f.nome)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white truncate">{f.nome}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {f.categorias.join(" · ") || "Sem categoria"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border whitespace-nowrap",
                      statusColor,
                    )}
                  >
                    {statusLabel}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <PunchCell
                    icon={LogIn}
                    label="Entrada"
                    time={fmt(r?.entrada ?? null)}
                    active={!!r?.entrada}
                    color="emerald"
                  />
                  <PunchCell
                    icon={Coffee}
                    label="Saiu almoço"
                    time={fmt(r?.almoco_saida ?? null)}
                    active={!!r?.almoco_saida}
                    color="amber"
                  />
                  <PunchCell
                    icon={Utensils}
                    label="Voltou almoço"
                    time={fmt(r?.almoco_retorno ?? null)}
                    active={!!r?.almoco_retorno}
                    color="amber"
                  />
                  <PunchCell
                    icon={LogOut}
                    label="Saída"
                    time={fmt(r?.saida ?? null)}
                    active={!!r?.saida}
                    color="blue"
                  />
                </div>
              </div>
            );
          })}
      </div>
    </section>
  );
}

function StatChip({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string;
  value: number;
  color: "slate" | "emerald" | "amber" | "blue" | "red";
  icon: typeof Users;
}) {
  const colors: Record<typeof color, string> = {
    slate: "bg-slate-800/60 border-slate-700 text-slate-300",
    emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
    amber: "bg-amber-500/10 border-amber-500/30 text-amber-300",
    blue: "bg-blue-500/10 border-blue-500/30 text-blue-300",
    red: "bg-red-500/10 border-red-500/30 text-red-300",
  };
  return (
    <div className={cn("rounded-xl border px-3 py-2 flex items-center gap-2.5", colors[color])}>
      <Icon className="h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <div className="text-lg font-black leading-none">{value}</div>
        <div className="text-[10px] font-bold uppercase tracking-wide opacity-80">{label}</div>
      </div>
    </div>
  );
}

function PunchCell({
  icon: Icon,
  label,
  time,
  active,
  color,
}: {
  icon: typeof LogIn;
  label: string;
  time: string;
  active: boolean;
  color: "emerald" | "amber" | "blue";
}) {
  const activeColors: Record<typeof color, string> = {
    emerald: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300",
    amber: "bg-amber-500/15 border-amber-500/40 text-amber-300",
    blue: "bg-blue-500/15 border-blue-500/40 text-blue-300",
  };
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2 flex items-center gap-2 transition-colors",
        active ? activeColors[color] : "bg-slate-950/60 border-slate-800 text-slate-500",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wide opacity-80">{label}</div>
        <div className="text-base font-black font-mono leading-none mt-0.5">{time}</div>
      </div>
    </div>
  );
}
