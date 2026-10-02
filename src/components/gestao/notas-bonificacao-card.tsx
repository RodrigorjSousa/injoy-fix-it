import { AlertTriangle, Award, Siren } from "lucide-react";
import {
  calcularMediasBonificacao,
  nivelNota,
  useRegistrosBonificacaoMes,
  type NivelNota,
} from "@/lib/bonificacao";
import type { Unidade } from "@/lib/store";
import { cn } from "@/lib/utils";

const CAIXA: Record<NivelNota, string> = {
  verde: "bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950 border-emerald-300",
  amarelo: "bg-gradient-to-tr from-amber-500 to-orange-400 text-slate-950 border-amber-300",
  vermelho: "bg-gradient-to-tr from-rose-600 to-red-500 text-white border-rose-300",
  sem: "bg-slate-800 text-slate-400 border-slate-600",
};

const FUNDO: Record<NivelNota, string> = {
  verde: "bg-gradient-to-br from-emerald-950/40 to-teal-950/20 border-emerald-500/40",
  amarelo: "bg-gradient-to-br from-amber-950/40 to-orange-950/20 border-amber-500/40",
  vermelho: "bg-gradient-to-br from-rose-950/50 to-red-950/30 border-rose-500/50",
  sem: "bg-slate-900/60 border-slate-700",
};

const SELO: Record<NivelNota, { texto: string; classe: string }> = {
  verde: { texto: "🏆 METAS E BÔNUS ATIVOS", classe: "bg-emerald-500/20 text-emerald-400" },
  amarelo: { texto: "⚠️ ATENÇÃO COM A META", classe: "bg-amber-500/20 text-amber-400" },
  vermelho: { texto: "🚨 ABAIXO DA META", classe: "bg-rose-500/20 text-rose-300" },
  sem: { texto: "AGUARDANDO AVALIAÇÕES", classe: "bg-slate-700/60 text-slate-300" },
};

function mensagem(nivel: NivelNota, unidade: Unidade) {
  switch (nivel) {
    case "verde":
      return `Bônus garantido para os colaboradores de ${unidade}. Continuem assim!`;
    case "amarelo":
      return "Vamos recuperar nossa nota e garantir o bônus.";
    case "vermelho":
      return "Nota abaixo do esperado. Cada detalhe conta: capricho no atendimento e na limpeza!";
    default:
      return "Ainda não há avaliações neste mês.";
  }
}

function CaixaNota({ titulo, nota }: { titulo: string; nota: number | null }) {
  const nivel = nivelNota(nota);
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-black uppercase tracking-wider text-white/80">
        {titulo}
      </span>
      <div
        className={cn(
          "flex h-16 w-16 flex-col items-center justify-center rounded-xl border-2 font-black shadow-lg sm:h-20 sm:w-20",
          CAIXA[nivel],
          nivel === "verde" && "animate-pulse",
        )}
      >
        <span className="text-xl sm:text-2xl">{nota == null ? "—" : nota.toFixed(1)}</span>
      </div>
    </div>
  );
}

/** Notas do mês (Geral, Funcionário, Limpeza) a partir da lista da Bonificação. */
export function NotasBonificacaoCard({ unidade }: { unidade: Unidade }) {
  const { data: registros = [], isLoading } = useRegistrosBonificacaoMes(unidade);
  const medias = calcularMediasBonificacao(registros);
  const nivelGeral = nivelNota(medias.geral);
  const Icone = nivelGeral === "verde" ? Award : nivelGeral === "vermelho" ? Siren : AlertTriangle;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border-2 p-4 shadow-xl sm:p-5",
        FUNDO[nivelGeral],
      )}
    >
      <div className="pointer-events-none absolute -bottom-8 -right-8 opacity-10">
        <Icone size={150} className="text-white" />
      </div>
      <div className="relative z-10 space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <CaixaNota titulo="Geral" nota={medias.geral} />
          <CaixaNota titulo="Funcionário" nota={medias.funcionarios} />
          <CaixaNota titulo="Limpeza" nota={medias.limpeza} />
        </div>
        <div className="space-y-1">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider",
              SELO[nivelGeral].classe,
            )}
          >
            {SELO[nivelGeral].texto}
          </span>
          <p className="text-xs font-semibold leading-snug text-white/90">
            {isLoading ? "Carregando notas…" : mensagem(nivelGeral, unidade)}
          </p>
          <p className="text-[10px] text-white/50">
            Média do mês · {medias.avaliacoes} avaliação{medias.avaliacoes === 1 ? "" : "s"} ·{" "}
            {unidade}
          </p>
        </div>
      </div>
    </div>
  );
}
