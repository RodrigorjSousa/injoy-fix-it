import { createFileRoute, Link } from "@tanstack/react-router";
import { PlusCircle, LayoutGrid, MessageSquare, ClipboardCheck } from "lucide-react";
import { useMe } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/recepcao")({
  component: RecepcaoPage,
});

function RecepcaoPage() {
  const { data: me } = useMe();
  const podeCriar = !!me && (me.isGestor || me.isAdmin || me.isRecepcao || me.isCamareira);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Recepção</h1>
        <p className="text-sm text-muted-foreground">
          Espaço da equipe de recepção. Em breve novas funções por aqui.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {podeCriar && (
          <Link
            to="/"
            className="group rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
                <PlusCircle className="h-5 w-5" />
              </div>
              <div>
                <div className="font-medium">Abrir novo chamado</div>
                <div className="text-xs text-muted-foreground">Registrar uma ocorrência</div>
              </div>
            </div>
          </Link>
        )}

        <Link
          to="/vistoria"
          className="group rounded-xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-card p-5 hover:border-emerald-400 hover:shadow-md transition-all sm:col-span-2"
        >
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-lg bg-emerald-600 text-white grid place-items-center shadow-sm">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-emerald-900">Vistoria para Check-in</div>
              <div className="text-xs text-emerald-800/70">Verificar quarto antes da entrada do hóspede</div>
            </div>
          </div>
        </Link>

        <Link
          to="/painel"
          className="group rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
              <LayoutGrid className="h-5 w-5" />
            </div>
            <div>
              <div className="font-medium">Acompanhar chamados</div>
              <div className="text-xs text-muted-foreground">Status dos atendimentos</div>
            </div>
          </div>
        </Link>

        <Link
          to="/chat"
          className="group rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <div className="font-medium">Conversar com a equipe</div>
              <div className="text-xs text-muted-foreground">Mensagens diretas</div>
            </div>
          </div>
        </Link>
      </div>

      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
        Em breve: check-in/check-out, controle de chaves, registro de ocorrências da recepção e mais.
      </div>
    </div>
  );
}
