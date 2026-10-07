import { useState } from "react";
import { AlertTriangle, Award, Siren, Target } from "lucide-react";
import { avaliarMeta, useMetaSituacao } from "@/lib/bonus-meta";
import { formatBRL } from "@/lib/bonificacao";
import { BonificacaoVisualizacaoDialog } from "@/components/gestao/bonificacao-visualizacao-dialog";
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
  const [aberto, setAberto] = useState(false);
  const { data: meta } = useMetaSituacao();
  const cfgMeta = meta?.config;
  const avaliacao = cfgMeta ? avaliarMeta(medias, cfgMeta.nota_minima) : null;
  const eu = meta?.pessoas.find((p) => p.sou_eu);

  return (
    <>
    <button
      type="button"
      onClick={() => setAberto(true)}
      aria-label="Ver detalhes das notas da bonificação"
      className={cn(
        "relative block w-full overflow-hidden rounded-2xl border-2 p-4 text-left shadow-xl transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:p-5",
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
          {cfgMeta?.ativo && avaliacao && (
            <div
              className={cn(
                "mt-2 flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs",
                avaliacao.atingida
                  ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-100"
                  : "border-white/15 bg-white/5 text-white/85",
              )}
            >
              <Target className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>Meta da equipe:</strong> as 3 notas em {cfgMeta.nota_minima.toFixed(1)} ou mais ={" "}
                <strong>+{formatBRL(cfgMeta.valor_por_pessoa)} para cada um</strong>.{" "}
                {avaliacao.atingida
                  ? "Meta batida até agora! 🎉"
                  : `Falta subir: ${avaliacao.abaixo.map((a) => a.nome).join(", ")}.`}
              </span>
            </div>
          )}
          {eu && eu.situacao !== "ok" && (
            <div
              className={cn(
                "mt-2 flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs font-semibold",
                eu.situacao === "perdeu"
                  ? "border-rose-400/70 bg-rose-500/25 text-rose-50"
                  : "border-amber-400/70 bg-amber-500/25 text-amber-50",
              )}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {eu.situacao === "perdeu"
                  ? `Você perdeu as bonificações deste mês (${eu.atrasos} atraso${eu.atrasos === 1 ? "" : "s"}${eu.faltas ? `, ${eu.faltas} falta${eu.faltas === 1 ? "" : "s"} sem justificativa` : ""}).`
                  : `Atenção: você já tem ${eu.atrasos} atraso${eu.atrasos === 1 ? "" : "s"} no mês. Com mais de ${cfgMeta?.max_atrasos ?? 3} você perde as bonificações.`}
              </span>
            </div>
          )}
          <p className="text-[10px] text-white/50">
            Média do mês · {medias.avaliacoes} avaliação{medias.avaliacoes === 1 ? "" : "s"} ·{" "}
            {unidade} · toque para ver regras e avaliações
          </p>
        </div>
      </div>
    </button>
    <BonificacaoVisualizacaoDialog open={aberto} onOpenChange={setAberto} unidade={unidade} />
    </>
  );
}
