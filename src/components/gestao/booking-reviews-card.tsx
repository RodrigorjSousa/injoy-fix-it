import { useCallback, useEffect, useMemo, useState } from "react";
import { Star, Plus, Sparkles, Users, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Unidade } from "@/lib/store";
import { useMe } from "@/lib/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type BookingReview = {
  id: string;
  unidade: Unidade;
  reference_date: string;
  overall_score: number;
  cleanliness_score: number | null;
  staff_score: number | null;
  sample_size: number | null;
  notes: string | null;
  created_at: string;
};

export function BookingReviewsCard({ unidade }: { unidade: Unidade }) {
  const { data: me } = useMe();
  const canEdit = !!me && (me.isGestor || me.isAdmin);
  const [rows, setRows] = useState<BookingReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("booking_reviews")
      .select("*")
      .eq("unidade", unidade)
      .order("reference_date", { ascending: false })
      .limit(12);
    if (error) {
      console.error(error);
    } else {
      setRows((data as BookingReview[]) ?? []);
    }
    setLoading(false);
  }, [unidade]);

  useEffect(() => {
    load();
  }, [load]);

  const latest = rows[0];
  const trend = useMemo(() => {
    if (rows.length < 2) return null;
    return Number(rows[0].overall_score) - Number(rows[1].overall_score);
  }, [rows]);

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">Notas Booking.com</p>
          <h3 className="text-lg font-black text-slate-900">INJOY {unidade}</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
            <Star size={20} />
          </div>
          {canEdit && (
            <Button
              size="sm"
              onClick={() => setOpen(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-1" /> Nova
            </Button>
          )}
        </div>
      </div>

      {loading && rows.length === 0 && (
        <p className="text-sm text-slate-400">Carregando…</p>
      )}

      {!loading && rows.length === 0 && (
        <div className="text-center py-6 text-sm text-slate-500 border border-dashed border-slate-200 rounded-xl">
          Nenhuma nota registrada ainda.
          {canEdit && <div className="mt-1 text-xs">Toque em "Nova" para adicionar as notas da Booking.</div>}
        </div>
      )}

      {latest && (
        <>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <ScoreBox
              label="Geral"
              value={latest.overall_score}
              icon={<Star size={16} />}
              color="text-amber-600 bg-amber-50"
              trend={trend}
            />
            <ScoreBox
              label="Limpeza"
              value={latest.cleanliness_score}
              icon={<Sparkles size={16} />}
              color="text-emerald-600 bg-emerald-50"
            />
            <ScoreBox
              label="Equipe"
              value={latest.staff_score}
              icon={<Users size={16} />}
              color="text-indigo-600 bg-indigo-50"
            />
          </div>

          <div className="text-[11px] text-slate-500 flex justify-between border-t pt-2">
            <span>
              Última atualização: {new Date(latest.reference_date + "T00:00:00").toLocaleDateString("pt-BR")}
            </span>
            {latest.sample_size ? <span>{latest.sample_size} avaliações</span> : null}
          </div>

          {rows.length > 1 && (
            <details className="mt-3">
              <summary className="text-xs text-blue-700 cursor-pointer font-semibold">
                Ver histórico ({rows.length - 1})
              </summary>
              <ul className="mt-2 space-y-1 max-h-52 overflow-y-auto">
                {rows.slice(1).map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-3 py-2"
                  >
                    <span className="font-semibold text-slate-700">
                      {new Date(r.reference_date + "T00:00:00").toLocaleDateString("pt-BR")}
                    </span>
                    <span className="flex gap-2 text-slate-600">
                      <span className="text-amber-600 font-bold">{Number(r.overall_score).toFixed(1)}</span>
                      {r.cleanliness_score != null && (
                        <span>L {Number(r.cleanliness_score).toFixed(1)}</span>
                      )}
                      {r.staff_score != null && (
                        <span>E {Number(r.staff_score).toFixed(1)}</span>
                      )}
                    </span>
                    {canEdit && (
                      <button
                        onClick={async () => {
                          if (!confirm("Excluir esta nota?")) return;
                          const { error } = await supabase
                            .from("booking_reviews")
                            .delete()
                            .eq("id", r.id);
                          if (error) toast.error(error.message);
                          else {
                            toast.success("Removido");
                            load();
                          }
                        }}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      <NovaNotaDialog
        open={open}
        onOpenChange={setOpen}
        unidade={unidade}
        onSaved={load}
      />
    </div>
  );
}

function ScoreBox({
  label,
  value,
  icon,
  color,
  trend,
}: {
  label: string;
  value: number | null;
  icon: React.ReactNode;
  color: string;
  trend?: number | null;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${color}`}>
        {icon} {label}
      </div>
      <div className="mt-2 text-2xl font-black text-slate-900 tabular-nums">
        {value != null ? Number(value).toFixed(1) : "—"}
      </div>
      {trend != null && Math.abs(trend) > 0.01 && (
        <div className={`text-[10px] font-semibold ${trend > 0 ? "text-emerald-600" : "text-red-500"}`}>
          {trend > 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(2)}
        </div>
      )}
    </div>
  );
}

function NovaNotaDialog({
  open,
  onOpenChange,
  unidade,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  unidade: Unidade;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    reference_date: new Date().toISOString().split("T")[0],
    overall_score: "",
    cleanliness_score: "",
    staff_score: "",
    sample_size: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const overall = parseFloat(form.overall_score.replace(",", "."));
    if (isNaN(overall) || overall < 0 || overall > 10) {
      toast.error("Nota geral deve ser entre 0 e 10");
      return;
    }
    setSaving(true);
    const parse = (v: string) => {
      const n = parseFloat(v.replace(",", "."));
      return isNaN(n) ? null : n;
    };
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("booking_reviews").insert({
      unidade,
      reference_date: form.reference_date,
      overall_score: overall,
      cleanliness_score: parse(form.cleanliness_score),
      staff_score: parse(form.staff_score),
      sample_size: form.sample_size ? parseInt(form.sample_size, 10) : null,
      notes: form.notes.trim() || null,
      created_by: userData.user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Nota registrada");
    setForm({
      reference_date: new Date().toISOString().split("T")[0],
      overall_score: "",
      cleanliness_score: "",
      staff_score: "",
      sample_size: "",
      notes: "",
    });
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova nota — INJOY {unidade}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Data de referência</Label>
            <Input
              type="date"
              value={form.reference_date}
              onChange={(e) => setForm({ ...form, reference_date: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Geral*</Label>
              <Input
                inputMode="decimal"
                placeholder="8.7"
                value={form.overall_score}
                onChange={(e) => setForm({ ...form, overall_score: e.target.value })}
              />
            </div>
            <div>
              <Label>Limpeza</Label>
              <Input
                inputMode="decimal"
                placeholder="9.0"
                value={form.cleanliness_score}
                onChange={(e) => setForm({ ...form, cleanliness_score: e.target.value })}
              />
            </div>
            <div>
              <Label>Equipe</Label>
              <Input
                inputMode="decimal"
                placeholder="9.2"
                value={form.staff_score}
                onChange={(e) => setForm({ ...form, staff_score: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Quantidade de avaliações</Label>
            <Input
              inputMode="numeric"
              placeholder="Ex.: 124"
              value={form.sample_size}
              onChange={(e) => setForm({ ...form, sample_size: e.target.value })}
            />
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea
              rows={2}
              maxLength={500}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <p className="text-[11px] text-slate-500">
            Escala Booking.com: 0 a 10. Consulte o extranet e atualize semanalmente.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
