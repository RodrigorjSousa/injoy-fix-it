import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, RefreshCw, Clock, Calendar as CalendarIcon, Pencil, X, Save, Plus, Trash2 } from "lucide-react";
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
  cpf: string | null;
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
  const [editando, setEditando] = useState<Funcionario | null>(null);
  const [adicionando, setAdicionando] = useState(false);

  const syncFn = useServerFn(syncPontomais);

  const excluir = useCallback(async (f: Funcionario) => {
    if (!confirm(`Excluir o funcionário "${f.nome}"? Esta ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from("funcionarios").delete().eq("id", f.id);
    if (error) return toast.error(error.message);
    toast.success("Funcionário excluído");
    setFuncionarios((prev) => prev.filter((x) => x.id !== f.id));
  }, []);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: fs, error: fErr }, { data: rs, error: rErr }] = await Promise.all([
        supabase.from("funcionarios").select("id, nome, email, cpf, categorias").order("nome"),
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
        const first = errored[0];
        toast.error(
          `${errored.length} funcionário(s) com erro. Ex.: ${first.nome} — ${first.error}`,
          { id: t, duration: 8000 },
        );
        console.error("[controle-ponto] erros de sync", errored);
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
          onClick={() => setAdicionando(true)}
          className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-semibold"
        >
          <Plus size={16} /> Adicionar
        </button>
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
                  <th className="text-left px-3 py-3">CPF</th>
                  <th className="text-center px-3 py-3">Entrada</th>
                  <th className="text-center px-3 py-3">Almoço ida</th>
                  <th className="text-center px-3 py-3">Almoço volta</th>
                  <th className="text-center px-3 py-3">Saída</th>
                  <th className="text-center px-3 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400">
                      Carregando...
                    </td>
                  </tr>
                )}
                {!loading && funcionariosUnidade.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400">
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
                        <td className="px-3 py-3 font-mono text-xs text-slate-600">
                          {f.cpf ?? <span className="text-amber-600">não cadastrado</span>}
                        </td>
                        <td className="text-center font-mono">{formatTime(r?.entrada ?? null)}</td>
                        <td className="text-center font-mono">{formatTime(r?.almoco_saida ?? null)}</td>
                        <td className="text-center font-mono">{formatTime(r?.almoco_retorno ?? null)}</td>
                        <td className="text-center font-mono">{formatTime(r?.saida ?? null)}</td>
                        <td className="text-center">
                          <button
                            onClick={() => setEditando(f)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            <Pencil size={12} /> Editar
                          </button>
                        </td>
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

      {editando && (
        <EditarFuncionarioModal
          funcionario={editando}
          onClose={() => setEditando(null)}
          onSaved={() => {
            setEditando(null);
            carregar();
          }}
        />
      )}
    </div>
  );
}

function EditarFuncionarioModal({
  funcionario,
  onClose,
  onSaved,
}: {
  funcionario: Funcionario;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState(funcionario.nome);
  const [email, setEmail] = useState(funcionario.email);
  const [cpf, setCpf] = useState(funcionario.cpf ?? "");
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    const nomeT = nome.trim();
    const emailT = email.trim().toLowerCase();
    const cpfT = cpf.replace(/\D/g, "").trim();
    if (!nomeT) return toast.error("Nome obrigatório");
    if (!/^\S+@\S+\.\S+$/.test(emailT)) return toast.error("E-mail inválido");
    if (cpfT && cpfT.length !== 11) return toast.error("CPF deve ter 11 dígitos");

    setSaving(true);
    try {
      const { error } = await supabase
        .from("funcionarios")
        .update({ nome: nomeT, email: emailT, cpf: cpfT || null })
        .eq("id", funcionario.id);
      if (error) throw error;
      toast.success("Funcionário atualizado");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h3 className="font-black text-slate-900">Editar funcionário</h3>
          <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-800">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <label className="block">
            <span className="text-xs font-bold uppercase text-slate-500">Nome</span>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase text-slate-500">E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase text-slate-500">
              CPF <span className="text-slate-400 font-normal">(somente números)</span>
            </span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={14}
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              placeholder="00000000000"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono outline-none focus:border-blue-500"
            />
            <span className="text-[11px] text-slate-400">
              Usado para vincular ao Pontomais. Preencha para garantir a sincronização.
            </span>
          </label>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-slate-100">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-700 text-white hover:bg-blue-600 disabled:opacity-60"
          >
            <Save size={14} /> Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
