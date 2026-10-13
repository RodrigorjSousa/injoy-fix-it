import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type DetalhePainel = { titulo: string; descricao?: string; conteudo: ReactNode };

export function DetalhesPainel({ detalhe, fechar }: { detalhe: DetalhePainel | null; fechar: () => void }) {
  return <Dialog open={detalhe !== null} onOpenChange={(open) => { if (!open) fechar(); }}>
    <DialogContent className="max-w-3xl">
      <DialogHeader><DialogTitle>{detalhe?.titulo}</DialogTitle><DialogDescription>{detalhe?.descricao ?? "Registros do período selecionado"}</DialogDescription></DialogHeader>
      {detalhe?.conteudo}
    </DialogContent>
  </Dialog>;
}