import { useEffect, useState } from "react";
import { Crosshair, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPosition } from "@/lib/ponto-face";
import { usePontoConfig, useSalvarPontoConfig, type PontoConfig } from "@/lib/ponto";

function UnidadeConfig({ row }: { row: PontoConfig }) {
  const salvar = useSalvarPontoConfig();
  const [form, setForm] = useState(row);
  const [buscando, setBuscando] = useState(false);
  useEffect(() => setForm(row), [row]);
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

  const usarLocalAtual = async () => {
    setBuscando(true);
    const p = await getPosition(20000);
    setBuscando(false);
    if (!p)
      return toast.error("Não foi possível obter a localização. Permita o GPS e tente de novo.");
    setForm((f) => ({
      ...f,
      latitude: Number(p.latitude.toFixed(6)),
      longitude: Number(p.longitude.toFixed(6)),
    }));
    toast.success(
      `Localização capturada (precisão ±${Math.round(p.accuracy)} m). Clique em Salvar.`,
    );
  };

  return (
    <Card className="space-y-3 p-4">
      <p className="font-black">{row.unidade}</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Latitude</Label>
          <Input
            value={form.latitude ?? ""}
            onChange={(e) => setForm({ ...form, latitude: num(e.target.value) })}
          />
        </div>
        <div>
          <Label className="text-xs">Longitude</Label>
          <Input
            value={form.longitude ?? ""}
            onChange={(e) => setForm({ ...form, longitude: num(e.target.value) })}
          />
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={usarLocalAtual}
        disabled={buscando}
      >
        {buscando ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Crosshair className="h-4 w-4" />
        )}
        Usar minha localização atual (estando na recepção)
      </Button>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs">Raio (m)</Label>
          <Input
            type="number"
            value={form.raio_m}
            onChange={(e) => setForm({ ...form, raio_m: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label className="text-xs">Tolerância (min/dia)</Label>
          <Input
            type="number"
            value={form.tolerancia_min}
            onChange={(e) => setForm({ ...form, tolerancia_min: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label className="text-xs">Rigor do rosto</Label>
          <Input
            type="number"
            step="0.01"
            value={form.limiar_face}
            onChange={(e) => setForm({ ...form, limiar_face: Number(e.target.value) })}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Rigor do rosto: quanto menor, mais exigente (padrão 0,50). Se alguém cair muito em "rosto
        não confere", primeiro refaça o cadastro com boa luz; só então suba, no máximo até 0,55.
      </p>
      <Button
        className="gap-2"
        disabled={salvar.isPending}
        onClick={() =>
          salvar.mutate(form, {
            onSuccess: () => toast.success("Configuração salva"),
            onError: (e) => toast.error((e as Error).message),
          })
        }
      >
        <Save className="h-4 w-4" />
        Salvar
      </Button>
    </Card>
  );
}

export function ConfigPonto() {
  const q = usePontoConfig();
  if (q.isLoading) return <Loader2 className="mx-auto h-6 w-6 animate-spin" />;
  if (q.error) return <p className="text-sm text-rose-600">{(q.error as Error).message}</p>;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {(q.data ?? []).map((r) => (
        <UnidadeConfig key={r.unidade} row={r} />
      ))}
    </div>
  );
}
