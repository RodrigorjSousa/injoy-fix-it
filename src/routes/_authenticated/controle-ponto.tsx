import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, RefreshCw, Clock, Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { syncPontomais } from "@/lib/pontomais.functions";
import type { Unidade } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/controle-ponto")({
  component: ControlePontoPage,
});

type Funcionario = {
  id: string;
  nome: string;
  email: string;
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

function unidadeMatchesCategoria(unidade: Unidade, categorias: string[]): boolean {
  const u = unidade.toLowerCase();
  return categorias.some((c) => c.toLowerCase().includes(u));
}

function formatTime(t: string | null): string {
  if (!t) return "—";
  return t.substring(0, 5);
}

function ControlePontoPage() {
  const [unidade, setUnidade] = useState<Unidade>("Botafogo");
  const [dataSelecionada, setDataSelecionada] = useState<string>(
    () => new Date().toISOString().split("T")[0],
  );
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [registros, setRegistros] = useState<RegistroPonto[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const syncFn = useServerFn(syncPontomais);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: fs, error: fErr }, { data: rs, error: rErr }] = await Promise.all([
        supabase.from("funcionarios").select("id, nome, email, categorias").order("nome"),
        supabase
          .from("registro_ponto_pontomais")
          .select("*")
          .eq("data", dataSelecionada),
      ]);
      if (fErr) throw fErr;
      if (rErr) throw rErr;
      setFuncionarios((fs ?? []) as Funcionario[]);
      setRegistros((rs ?? []) as RegistroPonto[]);
    } catch (err) {
      console.error("[controle-ponto] erro", err);
      toast.error(err instanceof Error ? err.message : "Falha ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, [dataSelecionada]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const funcionariosUnidade = useMemo(
    () =>
      funcionarios.filter(
        (f) =>
          f.categorias.length === 0 || unidadeMatchesCategoria(unidade, f.categorias),
      ),
    [funcionarios, unidade],
  );

  const registrosPorFunc = useMemo(() => {
    const m: Record<string, RegistroPonto> = {};
    for (const r of registros) m[r.funcionario_id] = r;
    return m;
  }, [registros]);

  const sincronizar = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    const t = toast.loading("Sincronizando com Pontomais...");
    try {
      const res = await syncFn({
        data: {
          funcionarioIds: funcionariosUnidade.map((f) => f.id),
          startDate: dataSelecionada,
          endDate: dataSelecionada,
        },
      });
      const errored = (res.results ?? []).filter((r) => r.error);
      if (errored.length > 0) {
        toast.warning(
          `${errored.length} funcionário(s) com erro. Verifique cadastro (CPF/e-mail).`,
          { id: t },
        );
      } else {
        toast.success("Ponto atualizado com sucesso", { id: t });
      }
      await carregar();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Falha ao sincronizar", { id: t });
    } finally {
      setSyncing(false);
    }
  }, [syncing, syncFn, funcionariosUnidade, dataSelecionada, carregar]);

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 min-h-[calc(100vh-4rem)] bg-slate-50 pb-12">
      <div className="bg-blue-950 text-white p-5 shadow-md sticky top-0 z-10 flex items-center gap-3">
        <Link
          to="/gestao"
          className="p-2 bg-blue-900/60 rounded-lg active:bg-blue-900 text-blue-100"
          aria-label="Voltar"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
            <Clock size={18} /> Controle de Ponto
          </h1>
          <p className="text-xs text-blue-300">
            Registros da Pontomais · INJOY {unidade}
          </p>
        </div>
        <button
          onClick={sincronizar}
          disabled={syncing || funcionariosUnidade.length === 0}
          className="inline-flex items-center gap-2 px-3 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-60 rounded-lg text-sm font-semibold"
        >
          <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
          Sincronizar
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-2">
            {(["Botafogo", "Ipanema"] as Unidade[]).map((u) => {
              const active = unidade === u;
              return (
                <button
                  key={u}
                  onClick={() => setUnidade(u)}
                  className={cn(
                    "rounded-xl border px-4 py-2 text-sm font-semibold transition-all",
                    active
                      ? "border-blue-700 bg-blue-50 text-blue-800"
                      : "border-slate-200 bg-white text-slate-500 hover:border-blue-300",
                  )}
                >
                  INJOY {u}
                </button>
              );
            })}
          </div>

          <label className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm">
            <CalendarIcon size={16} className="text-slate-500" />
            <input
              type="date"
              value={dataSelecionada}
              onChange={(e) => setDataSelecionada(e.target.value)}
              className="bg-transparent outline-none text-slate-800"
            />
          </label>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h2 className="font-black text-slate-900">
              Batidas do dia {new Date(dataSelecionada + "T12:00").toLocaleDateString("pt-BR")}
            </h2>
            <p className="text-xs text-slate-500">
              {funcionariosUnidade.length} funcionário(s) · {registros.length} registro(s)
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold">
                <tr>
                  <th className="text-left px-4 py-3">Funcionário</th>
                  <th className="text-center px-3 py-3">Entrada</th>
                  <th className="text-center px-3 py-3">Almoço ida</th>
                  <th className="text-center px-3 py-3">Almoço volta</th>
                  <th className="text-center px-3 py-3">Saída</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-slate-400">
                      Carregando...
                    </td>
                  </tr>
                )}
                {!loading && funcionariosUnidade.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-slate-400">
                      Nenhum funcionário nesta unidade
                    </td>
                  </tr>
                )}
                {!loading &&
                  funcionariosUnidade.map((f) => {
                    const r = registrosPorFunc[f.id];
                    return (
                      <tr key={f.id} className="border-t border-slate-100">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{f.nome}</div>
                          <div className="text-[11px] text-slate-400">{f.email}</div>
                        </td>
                        <td className="text-center font-mono">{formatTime(r?.entrada ?? null)}</td>
                        <td className="text-center font-mono">{formatTime(r?.almoco_saida ?? null)}</td>
                        <td className="text-center font-mono">{formatTime(r?.almoco_retorno ?? null)}</td>
                        <td className="text-center font-mono">{formatTime(r?.saida ?? null)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-slate-400">
          Fonte: API Pontomais. Toque em <b>Sincronizar</b> para forçar a atualização.
          O vínculo de funcionário é feito por CPF (se preenchido) ou pelo e-mail cadastrado.
        </p>
      </div>
    </div>
  );
}
