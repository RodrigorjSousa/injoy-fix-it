import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CATEGORIES as TAREFAS_EXTRAS_CATEGORIES,
  CATEGORIES_BY_UNIDADE as TAREFAS_EXTRAS_BY_UNIDADE,
  type CategoryKey as TarefaExtraKey,
} from "@/components/camareiras/tarefas-extras-modal";

export const TAREFAS_EXTRAS_PERIODICITY_KEY = "tarefas_extras_periodicity";

export type PeriodicityMap = Partial<Record<TarefaExtraKey, number>>;

const DEFAULT_DAYS = 7;

export function readPeriodicity(raw: string | null | undefined): PeriodicityMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as PeriodicityMap;
  } catch {
    // ignore
  }
  return {};
}

export function daysFor(map: PeriodicityMap, key: TarefaExtraKey): number {
  const v = map[key];
  return typeof v === "number" && v > 0 ? v : DEFAULT_DAYS;
}

export function TarefasExtrasPeriodicityManager() {
  const [unidade, setUnidade] = useState<"Botafogo" | "Ipanema">("Botafogo");
  const [values, setValues] = useState<PeriodicityMap>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("app_settings" as never)
      .select("value")
      .eq("key", TAREFAS_EXTRAS_PERIODICITY_KEY)
      .maybeSingle();
    setLoading(false);
    if (error) {
      toast.error("Falha ao carregar periodicidade");
      return;
    }
    setValues(readPeriodicity((data as { value?: string } | null)?.value));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const cats = useMemo(
    () =>
      TAREFAS_EXTRAS_CATEGORIES.filter((c) =>
        TAREFAS_EXTRAS_BY_UNIDADE[unidade].includes(c.key),
      ),
    [unidade],
  );

  const salvar = async () => {
    setSaving(true);
    const payload = JSON.stringify(values);
    const { error } = await supabase
      .from("app_settings" as never)
      .upsert({ key: TAREFAS_EXTRAS_PERIODICITY_KEY, value: payload } as never);
    setSaving(false);
    if (error) {
      toast.error("Falha ao salvar: " + error.message);
      return;
    }
    toast.success("Periodicidade atualizada");
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Timer className="h-5 w-5 text-primary" />
        <h2 className="font-semibold text-lg">Periodicidade das Tarefas Extras</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Defina de quantos em quantos dias cada área comum deve ser executada.
        Quando o intervalo for ultrapassado, o botão da área ganha um alerta
        vermelho no painel das camareiras.
      </p>

      <div className="grid grid-cols-2 gap-2 max-w-sm">
        {(["Botafogo", "Ipanema"] as const).map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => setUnidade(u)}
            className={`rounded-lg border p-2.5 text-sm transition-colors ${
              unidade === u
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "bg-background hover:border-primary/40"
            }`}
          >
            INJOY {u}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <div className="space-y-2">
          {cats.map((c) => (
            <div
              key={c.key}
              className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`inline-block h-3 w-3 rounded-full bg-gradient-to-br ${c.gradient}`}
                />
                <span className="text-sm font-medium truncate">{c.label}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={values[c.key] ?? DEFAULT_DAYS}
                  onChange={(e) => {
                    const n = Math.max(1, Math.min(365, Number(e.target.value) || DEFAULT_DAYS));
                    setValues((s) => ({ ...s, [c.key]: n }));
                  }}
                  className="w-20 text-center"
                />
                <span className="text-xs text-muted-foreground">dias</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={salvar} disabled={saving || loading}>
          {saving ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-1" />
          )}
          Salvar periodicidade
        </Button>
      </div>
    </Card>
  );
}
