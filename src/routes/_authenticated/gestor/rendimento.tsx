import { createFileRoute } from "@tanstack/react-router";
import { BlocoRendimento } from "@/components/dashboard/bloco-rendimento";

// Tela própria do Rendimento por unidade (saiu do Início da área para não misturar com a operação).
export const Route = createFileRoute("/_authenticated/gestor/rendimento")({
  component: RendimentoPorUnidade,
});

function RendimentoPorUnidade() {
  return (
    <div className="space-y-8">
      <BlocoRendimento />
    </div>
  );
}
