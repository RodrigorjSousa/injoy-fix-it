import { useEffect, useState } from "react";
import { FileText, Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type TuyaLog = {
  id: string;
  room_number: string;
  guest_name: string;
  password: string;
  entrada: string;
  saida: string;
  unidade: string | null;
  generated_by_name: string | null;
  created_at: string;
};

function fmt(dt: string) {
  return new Date(dt).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TuyaLogsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full py-2.5 rounded-xl font-bold text-sm border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-2 transition-all"
      >
        <FileText size={16} /> Ver Relatório de Senhas Geradas
      </button>
      {open && <TuyaLogsModal open={open} onOpenChange={setOpen} />}
    </>
  );
}

function TuyaLogsModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [logs, setLogs] = useState<TuyaLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("tuya_password_logs")
        .select(
          "id, room_number, guest_name, password, entrada, saida, unidade, generated_by_name, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) {
        toast.error("Erro ao carregar histórico: " + error.message);
      } else {
        setLogs((data ?? []) as TuyaLog[]);
      }
      setLoading(false);
    })();
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-teal-600" />
            Relatório de Senhas Geradas
          </DialogTitle>
          <DialogDescription>
            Histórico completo de senhas de acesso criadas nas fechaduras Tuya.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto -mx-1 px-1">
          {loading ? (
            <div className="py-12 grid place-items-center text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Nenhuma senha registrada ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-3 py-2 font-bold">Quarto</th>
                    <th className="text-left px-3 py-2 font-bold">Hóspede</th>
                    <th className="text-left px-3 py-2 font-bold">Senha</th>
                    <th className="text-left px-3 py-2 font-bold">Entrada</th>
                    <th className="text-left px-3 py-2 font-bold">Saída</th>
                    <th className="text-left px-3 py-2 font-bold">Gerado por</th>
                    <th className="text-left px-3 py-2 font-bold">Criado em</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-bold text-slate-800">
                        {l.room_number}
                      </td>
                      <td className="px-3 py-2 text-slate-700">{l.guest_name}</td>
                      <td className="px-3 py-2">
                        <span className="font-mono font-bold tracking-widest text-teal-700">
                          {l.password}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{fmt(l.entrada)}</td>
                      <td className="px-3 py-2 text-slate-600">{fmt(l.saida)}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {l.generated_by_name ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {fmt(l.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full py-2.5 rounded-xl font-semibold text-sm border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-2"
          >
            <X size={16} /> Fechar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
