import { useEffect, useState } from "react";
import { Plus, Trash2, KeyRound, Loader2, Save, X, Wifi, FileDown } from "lucide-react";
import jsPDF from "jspdf";

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  invalidateTuyaDevicesCache,
  type TuyaDevice,
  type TuyaDeviceTipo,
} from "@/lib/tuya-devices";

const TIPO_LABEL: Record<TuyaDeviceTipo, string> = {
  quarto: "Quarto",
  portao: "Portão (compartilhado)",
  vidro: "Porta de vidro (compartilhada)",
  outro: "Outro (compartilhado)",
};

const UNIDADES = ["Botafogo", "Ipanema"];

export function TuyaDevicesManager() {
  const [devices, setDevices] = useState<TuyaDevice[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    unidade: "Botafogo",
    tipo: "quarto" as TuyaDeviceTipo,
    room_number: "",
    device_id: "",
    label: "",
  });
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, { online: boolean; success: boolean; msg?: string }>>({});


  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tuya_devices")
      .select("id,unidade,tipo,room_number,device_id,label,ativo")
      .order("unidade")
      .order("tipo")
      .order("room_number");
    if (error) toast.error("Erro ao carregar fechaduras: " + error.message);
    setDevices((data ?? []) as TuyaDevice[]);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const salvar = async () => {
    if (!form.device_id.trim() || !form.label.trim()) {
      toast.error("Informe o Device ID e um rótulo.");
      return;
    }
    if (form.tipo === "quarto" && !form.room_number.trim()) {
      toast.error("Informe o número do quarto.");
      return;
    }
    setSaving(true);
    const payload = {
      unidade: form.unidade,
      tipo: form.tipo,
      room_number: form.tipo === "quarto" ? form.room_number.trim() : null,
      device_id: form.device_id.trim(),
      label: form.label.trim(),
      ativo: true,
    };
    const { error } = await supabase.from("tuya_devices").insert(payload);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    toast.success("Fechadura cadastrada!");
    invalidateTuyaDevicesCache();
    setForm((f) => ({ ...f, room_number: "", device_id: "", label: "" }));
    refresh();
  };

  const toggleAtivo = async (d: TuyaDevice) => {
    const { error } = await supabase
      .from("tuya_devices")
      .update({ ativo: !d.ativo })
      .eq("id", d.id);
    if (error) return toast.error(error.message);
    invalidateTuyaDevicesCache();
    refresh();
  };

  const excluir = async (d: TuyaDevice) => {
    if (!confirm(`Excluir a fechadura "${d.label}"?`)) return;
    const { error } = await supabase.from("tuya_devices").delete().eq("id", d.id);
    if (error) return toast.error(error.message);
    invalidateTuyaDevicesCache();
    toast.success("Excluída.");
    refresh();
  };

  const verificarOnline = async () => {
    const list = (devices ?? []).filter((d) => d.ativo);
    if (list.length === 0) {
      toast.error("Nenhuma fechadura ativa para verificar.");
      return;
    }
    setChecking(true);
    setStatuses({});
    try {
      const { data, error } = await supabase.functions.invoke("tuya-password", {
        body: { action: "check_status", deviceIds: list.map((d) => d.device_id) },
      });
      if (error) throw error;
      const map: Record<string, { online: boolean; success: boolean; msg?: string }> = {};
      for (const s of data?.statuses ?? []) {
        map[s.deviceId] = { online: !!s.online, success: !!s.success, msg: s.msg };
      }
      setStatuses(map);
      const onlineCount = Object.values(map).filter((s) => s.online).length;
      toast.success(`${onlineCount}/${list.length} fechaduras online.`);
    } catch (e) {
      toast.error("Erro ao verificar: " + (e as Error).message);
    } finally {
      setChecking(false);
    }
  };

  const imprimirPDF = () => {
    const list = devices ?? [];
    if (list.length === 0) {
      toast.error("Nenhuma fechadura cadastrada.");
      return;
    }
    const doc = new jsPDF();
    const now = new Date().toLocaleString("pt-BR");
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Fechaduras Tuya - INJOY Hoteis", 14, 18);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Gerado em: ${now}  |  Total: ${list.length}`, 14, 25);

    let y = 34;
    const grouped = list.reduce<Record<string, TuyaDevice[]>>((acc, d) => {
      (acc[d.unidade] ??= []).push(d);
      return acc;
    }, {});

    Object.entries(grouped).forEach(([unidade, items]) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(`INJOY ${unidade}`, 14, y);
      y += 6;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Rótulo", 14, y);
      doc.text("Tipo", 90, y);
      doc.text("Quarto", 120, y);
      doc.text("Device ID", 140, y);
      doc.text("Ativo", 195, y, { align: "right" });
      y += 2;
      doc.setLineWidth(0.2);
      doc.line(14, y, 196, y);
      y += 4;

      doc.setFont("helvetica", "normal");
      items.forEach((d) => {
        if (y > 285) {
          doc.addPage();
          y = 20;
        }
        doc.text(String(d.label).substring(0, 45), 14, y);
        doc.text(TIPO_LABEL[d.tipo].substring(0, 18), 90, y);
        doc.text(d.room_number ?? "-", 120, y);
        doc.setFont("courier", "normal");
        doc.text(d.device_id, 140, y);
        doc.setFont("helvetica", "normal");
        doc.text(d.ativo ? "Sim" : "Nao", 195, y, { align: "right" });
        y += 6;
      });
      y += 6;
    });

    doc.save(`fechaduras-tuya-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success("PDF gerado!");
  };



  return (
    <section className="space-y-4">
      <header className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-teal-600" />
        <h2 className="text-lg font-bold text-slate-800">Fechaduras Tuya</h2>
      </header>
      <p className="text-xs text-slate-600">
        Cadastre aqui as fechaduras de cada unidade. A senha de check-in é gerada 1x e enviada
        para o quarto do hóspede + todas as compartilhadas (portão, porta de vidro) da unidade.
      </p>

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1">
          <Plus size={16} /> Adicionar fechadura
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Unidade
            </label>
            <select
              value={form.unidade}
              onChange={(e) => setForm((f) => ({ ...f, unidade: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {UNIDADES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Tipo
            </label>
            <select
              value={form.tipo}
              onChange={(e) =>
                setForm((f) => ({ ...f, tipo: e.target.value as TuyaDeviceTipo }))
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {Object.entries(TIPO_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {form.tipo === "quarto" && (
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Número do Quarto
              </label>
              <input
                type="text"
                value={form.room_number}
                onChange={(e) => setForm((f) => ({ ...f, room_number: e.target.value }))}
                placeholder="Ex: 005, 107, 205"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          )}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Device ID (Tuya)
            </label>
            <input
              type="text"
              value={form.device_id}
              onChange={(e) => setForm((f) => ({ ...f, device_id: e.target.value }))}
              placeholder="Ex: eba3429756a5aaa8b2ssrw"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Rótulo
            </label>
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="Ex: Quarto 107 · Portão Principal · Porta de Vidro"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={salvar}
          disabled={saving}
          className="w-full md:w-auto py-2.5 px-4 rounded-xl font-bold text-sm bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Salvar fechadura
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={verificarOnline}
          disabled={checking || loading}
          className="flex-1 md:flex-none py-2 px-3 rounded-xl font-bold text-sm bg-sky-600 hover:bg-sky-700 text-white flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {checking ? <Loader2 size={16} className="animate-spin" /> : <Wifi size={16} />}
          Verificar fechaduras online
        </button>
        <button
          type="button"
          onClick={imprimirPDF}
          disabled={loading}
          className="flex-1 md:flex-none py-2 px-3 rounded-xl font-bold text-sm bg-slate-800 hover:bg-slate-900 text-white flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <FileDown size={16} />
          Imprimir PDF
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b">
          Fechaduras cadastradas
        </div>

        {loading ? (
          <div className="py-8 flex justify-center text-slate-500">
            <Loader2 className="animate-spin" size={20} />
          </div>
        ) : (devices ?? []).length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Nenhuma fechadura cadastrada.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {(devices ?? []).map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {d.label}{" "}
                    {!d.ativo && (
                      <span className="ml-1 text-[10px] font-bold text-slate-400">
                        (inativa)
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {d.unidade} · {TIPO_LABEL[d.tipo]}
                    {d.room_number ? ` · Quarto ${d.room_number}` : ""}
                  </p>
                  <p className="text-[10px] font-mono text-slate-400 truncate">{d.device_id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleAtivo(d)}
                    className={`text-[10px] font-bold px-2 py-1 rounded-md ${d.ativo ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-500 border border-slate-200"}`}
                  >
                    {d.ativo ? "Ativa" : "Inativa"}
                  </button>
                  <button
                    type="button"
                    onClick={() => excluir(d)}
                    className="p-1.5 rounded-md text-red-600 hover:bg-red-50"
                    title="Excluir"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function TuyaDevicesManagerModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-slate-800">Gerenciar Fechaduras Tuya</h1>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500"
          >
            <X size={18} />
          </button>
        </div>
        <TuyaDevicesManager />
      </div>
    </div>
  );
}
