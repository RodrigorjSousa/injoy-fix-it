import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Camera, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { actions, useStore, type Status } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/chamados/$id")({
  component: ChamadoDetalhe,
});

function ChamadoDetalhe() {
  const { id } = useParams({ from: "/chamados/$id" });
  const chamado = useStore((s) => s.chamados.find((c) => c.id === id));
  const funcionarios = useStore((s) => s.funcionarios);

  if (!chamado) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Chamado não encontrado.</p>
        <Button asChild className="mt-4"><Link to="/painel">Voltar ao painel</Link></Button>
      </div>
    );
  }

  const responsavel = funcionarios.find((f) => f.id === chamado.responsavelId);

  const setStatus = (status: Status) => {
    actions.atualizarChamado(chamado.id, { status });
    toast.success(`Status atualizado: ${status}`);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <Link to="/painel" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Painel
      </Link>

      <header className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{chamado.unidade}</Badge>
          <Badge variant="secondary">{chamado.categoria}</Badge>
          <StatusBadge status={chamado.status} />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight">{chamado.descricao}</h1>
        <p className="text-sm text-muted-foreground">
          Responsável: <span className="font-medium text-foreground">{responsavel?.nome ?? "—"}</span> ·
          Aberto em {new Date(chamado.criadoEm).toLocaleString("pt-BR")}
        </p>
      </header>

      <Card className="p-4 sm:p-5 space-y-3">
        <div className="text-sm font-semibold">Status do serviço</div>
        <Select value={chamado.status} onValueChange={(v) => setStatus(v as Status)}>
          <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Aberto">Aberto</SelectItem>
            <SelectItem value="Em Andamento">Em Andamento</SelectItem>
            <SelectItem value="Concluído">Concluído</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <PhotoSlot
          label="Foto ANTES"
          value={chamado.fotoAntes}
          onChange={(v) => actions.atualizarChamado(chamado.id, { fotoAntes: v })}
        />
        <PhotoSlot
          label="Foto DEPOIS"
          value={chamado.fotoDepois}
          onChange={(v) => actions.atualizarChamado(chamado.id, { fotoDepois: v })}
          accent
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {chamado.status !== "Concluído" && (
          <Button onClick={() => setStatus("Concluído")} className="gap-2">
            <CheckCircle2 className="h-4 w-4" /> Marcar como concluído
          </Button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const cls =
    status === "Aberto" ? "bg-destructive/15 text-destructive border-destructive/30" :
    status === "Em Andamento" ? "bg-warning/20 text-warning-foreground border-warning/40" :
    "bg-success/15 text-success border-success/30";
  return <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-semibold border", cls)}>{status}</span>;
}

function PhotoSlot({
  label,
  value,
  onChange,
  accent,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  accent?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = async (file: File) => {
    setLoading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `chamados/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("fotos-manutencao")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;

      const { data: signed, error: signErr } = await supabase.storage
        .from("fotos-manutencao")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10); // 10 anos
      if (signErr) throw signErr;

      onChange(signed.signedUrl);
      toast.success(`${label} salva`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Falha no upload";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-2xl border-2 border-dashed p-3 bg-card",
        accent ? "border-success/40" : "border-border",
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        {value && (
          <button onClick={() => onChange(null)} className="text-muted-foreground hover:text-destructive">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {value ? (
        <img src={value} alt={label} className="w-full aspect-square object-cover rounded-lg" />
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full aspect-square rounded-lg bg-muted/50 hover:bg-muted transition-colors flex flex-col items-center justify-center gap-2 text-muted-foreground"
        >
          <Camera className="h-8 w-8" />
          <span className="text-xs font-medium">{loading ? "Carregando..." : "Adicionar foto"}</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
