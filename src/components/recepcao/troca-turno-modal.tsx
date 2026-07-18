import { useEffect, useState } from "react";
import { X, Loader2, Send, Check, AlertTriangle } from "lucide-react";
import { TrocaTurnoIcon } from "@/components/recepcao/troca-turno-icon";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/store";
import { cn } from "@/lib/utils";

type StatusKey = "batendo" | "divergente";

interface Props {
  open: boolean;
  onClose: () => void;
  unidade: "Botafogo" | "Ipanema";
}

const STATUS: { key: StatusKey; label: string; cls: string; icon: typeof Check }[] = [
  { key: "batendo", label: "Batendo", cls: "from-emerald-500 to-emerald-600", icon: Check },
  { key: "divergente", label: "Divergente", cls: "from-red-500 to-red-600", icon: AlertTriangle },
];

export function TrocaTurnoModal({ open, onClose, unidade }: Props) {
  const { data: me } = useMe();
  const nomeSaida = me?.funcionario?.nome || me?.email || "";

  const [funcEntrada, setFuncEntrada] = useState("");
  const [caixaStatus, setCaixaStatus] = useState<StatusKey>("batendo");
  const [caixaObs, setCaixaObs] = useState("");
  const [estoqueStatus, setEstoqueStatus] = useState<StatusKey>("batendo");
  const [estoqueObs, setEstoqueObs] = useState("");
  const [gastos, setGastos] = useState("");
  const [bebidas, setBebidas] = useState("");
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFuncEntrada("");
    setCaixaStatus("batendo");
    setCaixaObs("");
    setEstoqueStatus("batendo");
    setEstoqueObs("");
    setGastos("");
    setBebidas("");
    setObs("");
  }, [open]);

  if (!open) return null;

  const canSubmit = !!nomeSaida && funcEntrada.trim().length > 0 && !enviando;

  const enviar = async () => {
    if (!canSubmit) return;
    setEnviando(true);
    try {
      const { error } = await supabase.from("trocas_turno" as never).insert({
        unidade,
        funcionario_saida: nomeSaida,
        funcionario_saida_user_id: me?.userId ?? null,
        funcionario_entrada: funcEntrada.trim().slice(0, 120),
        caixa_status: caixaStatus,
        caixa_obs: caixaObs.trim().slice(0, 500) || null,
        estoque_status: estoqueStatus,
        estoque_obs: estoqueObs.trim().slice(0, 500) || null,
        gastos_detalhes: gastos.trim().slice(0, 1000) || null,
        maquina_bebidas: bebidas.trim().slice(0, 500) || null,
        observacoes: obs.trim().slice(0, 4000) || null,
      } as never);
      if (error) throw error;
      toast.success("Passagem de turno registrada!");
      onClose();
    } catch (err) {
      console.error("[troca-turno] erro:", err);
      toast.error(err instanceof Error ? err.message : "Falha ao registrar troca de turno");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 w-full sm:max-w-xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-orange-500 grid place-items-center text-white shadow-md shadow-indigo-500/30">
              <TrocaTurnoIcon size={22} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">
                🔄 Passagem de Serviço
              </p>
              <h3 className="text-base font-black text-white">Troca de Turno</h3>
              <p className="text-xs text-slate-400">INJOY {unidade}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Saindo do turno">
              <div className="mt-1 w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-300">
                {nomeSaida || "—"}
              </div>
            </Campo>
            <Campo label="Assumindo o turno *">
              <input
                value={funcEntrada}
                onChange={(e) => setFuncEntrada(e.target.value)}
                placeholder="Nome de quem entra"
                maxLength={120}
                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500"
              />
            </Campo>
          </div>

          <SecaoStatus
            titulo="💰 Status do Caixa"
            status={caixaStatus}
            onChange={setCaixaStatus}
            obs={caixaObs}
            onObs={setCaixaObs}
            placeholder="Observações do caixa (opcional)"
          />

          <SecaoStatus
            titulo="📦 Status do Estoque"
            status={estoqueStatus}
            onChange={setEstoqueStatus}
            obs={estoqueObs}
            onObs={setEstoqueObs}
            placeholder="Observações do estoque (opcional)"
          />

          <Campo label="💸 Gastos do Turno">
            <textarea
              value={gastos}
              onChange={(e) => setGastos(e.target.value)}
              placeholder='Ex: "R$ 16,60 · Uber para Ipanema"'
              rows={2}
              maxLength={1000}
              className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500 resize-none"
            />
          </Campo>

          <Campo label="🥤 Máquina de Bebidas">
            <input
              value={bebidas}
              onChange={(e) => setBebidas(e.target.value)}
              placeholder='Ex: "Sem vendas" ou "3× refrigerante, 2× água"'
              maxLength={500}
              className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500"
            />
          </Campo>

          <Campo label="📝 Atividades realizadas / Observações">
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Códigos criados/excluídos, entregas, incidentes, pendências…"
              rows={5}
              maxLength={4000}
              className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500 resize-none"
            />
          </Campo>
        </div>

        <div className="p-4 border-t border-slate-800">
          <button
            onClick={enviar}
            disabled={!canSubmit}
            className={cn(
              "w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-colors flex items-center justify-center gap-2",
              canSubmit
                ? "bg-indigo-500 hover:bg-indigo-600 text-white"
                : "bg-slate-800 text-slate-500 cursor-not-allowed",
            )}
          >
            {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Registrar Passagem de Turno
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
        {label}
      </label>
      {children}
    </div>
  );
}

function SecaoStatus({
  titulo,
  status,
  onChange,
  obs,
  onObs,
  placeholder,
}: {
  titulo: string;
  status: StatusKey;
  onChange: (s: StatusKey) => void;
  obs: string;
  onObs: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-800/30 p-3 space-y-2">
      <p className="text-xs font-black text-slate-200">{titulo}</p>
      <div className="grid grid-cols-2 gap-2">
        {STATUS.map((s) => {
          const active = status === s.key;
          const Icon = s.icon;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onChange(s.key)}
              className={cn(
                "py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all border flex items-center justify-center gap-1.5",
                active
                  ? `bg-gradient-to-br ${s.cls} text-white border-transparent shadow`
                  : "bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600",
              )}
            >
              <Icon size={14} />
              {s.label}
            </button>
          );
        })}
      </div>
      <textarea
        value={obs}
        onChange={(e) => onObs(e.target.value)}
        placeholder={placeholder}
        rows={2}
        maxLength={500}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500 resize-none"
      />
    </div>
  );
}
