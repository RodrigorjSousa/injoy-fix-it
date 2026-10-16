// Abas do gestor na tela Reservas: Histórico, Conferência e Quem vê.
import { useMemo, useState } from "react";
import { Eye, EyeOff, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { EXCLUSAO_TEXTO, MOTIVO_CURTO } from "@/lib/reservas/cobranca";
import {
  useAcessosReservas,
  useConferenciaCobranca,
  useDefinirAcessoReservas,
  useHistoricoCobranca,
  type AcessoReservas,
} from "@/lib/reservas/use-reservas";
import type { Unidade } from "@/lib/store";
import { TOM_MOTIVO, brl, dataCurta } from "./cobranca-card";

function Estado({ carregando, erro, vazio, children }: { carregando: boolean; erro: unknown; vazio: string | null; children: React.ReactNode }) {
  if (carregando) return <p className="py-10 text-center text-sm text-slate-500">Carregando…</p>;
  if (erro) return <p className="py-10 text-center text-sm text-red-600">{(erro as Error).message}</p>;
  if (vazio) return <p className="py-10 text-center text-sm text-slate-500">{vazio}</p>;
  return <>{children}</>;
}

function Motivo({ motivo }: { motivo: keyof typeof MOTIVO_CURTO | null }) {
  if (!motivo) return <span className="text-slate-400">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={cn("h-2 w-2 rounded-full", TOM_MOTIVO[motivo].ponto)} />
      {MOTIVO_CURTO[motivo]}
    </span>
  );
}

export function HistoricoCobrancas({ unidade }: { unidade: Unidade }) {
  const q = useHistoricoCobranca(unidade, true);
  const linhas = q.data ?? [];
  return (
    <section className="space-y-3">
      <p className="text-sm text-slate-600">
        Cada reserva aparece uma vez, no dia e hora em que entrou na lista de {unidade}.
      </p>
      <Estado carregando={q.isLoading} erro={q.error} vazio={linhas.length ? null : "Nenhuma reserva entrou na lista ainda."}>
        <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-[#f7faf9] text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Entrou em</th>
                <th className="px-4 py-2.5 font-semibold">Reserva</th>
                <th className="px-4 py-2.5 font-semibold">Hóspede</th>
                <th className="px-4 py-2.5 font-semibold">Motivo</th>
                <th className="px-4 py-2.5 text-right font-semibold">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {linhas.map((h) => (
                <tr key={h.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-slate-600">
                    {new Date(h.registrado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{h.reservation_id}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{h.hospede}</td>
                  <td className="px-4 py-2.5 text-slate-700"><Motivo motivo={h.motivo} /></td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{brl(h.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Estado>
    </section>
  );
}

type FiltroConf = "todas" | "nr" | "na_lista" | "fora";

export function ConferenciaCobrancas({ unidade }: { unidade: Unidade }) {
  const q = useConferenciaCobranca(unidade, true);
  const [filtro, setFiltro] = useState<FiltroConf>("todas");
  const [busca, setBusca] = useState("");
  const todas = q.data ?? [];
  const linhas = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return todas.filter((c) => {
      if (filtro === "nr" && !c.nr) return false;
      if (filtro === "na_lista" && !c.motivo) return false;
      if (filtro === "fora" && c.motivo) return false;
      if (!b) return true;
      return [c.hospede, c.reservation_id, c.planos, c.origem].some((v) => (v ?? "").toLowerCase().includes(b));
    });
  }, [todas, filtro, busca]);
  const nr = todas.filter((c) => c.nr).length;
  const opcoes: { id: FiltroConf; texto: string }[] = [
    { id: "todas", texto: `Todas (${todas.length})` },
    { id: "nr", texto: `Classificadas NR (${nr})` },
    { id: "na_lista", texto: `Na lista (${todas.filter((c) => c.motivo).length})` },
    { id: "fora", texto: "Fora da lista" },
  ];
  return (
    <section className="space-y-3">
      <p className="text-sm text-slate-600">
        Tudo o que foi consultado no Cloudbeds na última atualização, com o plano lido e se virou NR. Use para conferir a
        regra quando aparecer um plano com nome novo.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {opcoes.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={filtro === o.id}
            onClick={() => setFiltro(o.id)}
            className={cn(
              "h-8 rounded-full border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f8b8d]",
              filtro === o.id ? "border-[#0e2a30] bg-[#0e2a30] text-white" : "border-slate-200 bg-white text-slate-600 hover:text-slate-900",
            )}
          >
            {o.texto}
          </button>
        ))}
        <label className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Hóspede, reserva ou plano"
            aria-label="Buscar na conferência"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm focus:border-[#0f8b8d] focus:outline-none focus:ring-2 focus:ring-[#0f8b8d]/25"
          />
        </label>
      </div>
      <Estado carregando={q.isLoading} erro={q.error} vazio={todas.length ? null : "A conferência aparece depois da primeira atualização."}>
        <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-[#f7faf9] text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Reserva</th>
                <th className="px-4 py-2.5 font-semibold">Plano lido</th>
                <th className="px-4 py-2.5 font-semibold">NR?</th>
                <th className="px-4 py-2.5 font-semibold">Check-in</th>
                <th className="px-4 py-2.5 text-right font-semibold">Saldo</th>
                <th className="px-4 py-2.5 font-semibold">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {linhas.map((c) => (
                <tr key={c.reservation_id} className="align-top">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-slate-800">{c.hospede ?? "—"}</p>
                    <p className="text-xs tabular-nums text-slate-500">
                      {c.reservation_id}, {c.status_cloudbeds ?? "—"}
                      {c.origem ? `, ${c.origem}` : ""}
                    </p>
                  </td>
                  <td className="max-w-[260px] px-4 py-2.5 text-slate-700">{c.planos ?? <span className="text-amber-700">Nenhum plano lido</span>}</td>
                  <td className="px-4 py-2.5">{c.nr ? <Badge className="bg-[#b7791f] hover:bg-[#b7791f]">NR</Badge> : <span className="text-slate-400">Não</span>}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-slate-600">{dataCurta(c.checkin)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{brl(c.saldo)}</td>
                  <td className="px-4 py-2.5 text-slate-700">
                    {c.motivo ? (
                      <Motivo motivo={c.motivo} />
                    ) : (
                      <span className="text-slate-500">
                        {c.exclusao ? EXCLUSAO_TEXTO[c.exclusao] : "Fora da lista"}
                        {c.entra_em ? `. Entra em ${dataCurta(c.entra_em)}` : ""}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Estado>
    </section>
  );
}

const ORIGEM: Record<AcessoReservas["origem"], string> = {
  gestor: "Gestor, sempre vê",
  liberado: "Liberado por você",
  bloqueado: "Bloqueado por você",
  equipe: "Liberado em Equipe › Telas",
  sem_acesso: "Não vê",
};
const PAPEL: Record<string, string> = { recepcao: "Recepção", camareira: "Camareira", funcionario: "Técnico", gestor: "Gestor", admin: "Admin" };

export function QuemVeReservas() {
  const q = useAcessosReservas(true);
  const definir = useDefinirAcessoReservas();
  const [verTodos, setVerTodos] = useState(false);
  const mudar = (a: AcessoReservas, liberado: boolean | null) =>
    definir.mutate(
      { userId: a.user_id, liberado },
      {
        onSuccess: () =>
          toast.success(
            liberado === null ? `${a.nome} voltou ao que está em Equipe` : liberado ? `${a.nome} agora vê as Reservas` : `${a.nome} não vê mais as Reservas`,
          ),
        onError: (e) => toast.error(e.message),
      },
    );
  const todos = q.data ?? [];
  // Foco na Recepção (e em quem já vê); os demais logins ficam atrás de "mostrar todos".
  const principais = todos.filter((a) => a.papeis.includes("recepcao") || a.ve);
  const lista = verTodos ? todos : principais;
  const escondidos = todos.length - principais.length;
  return (
    <section className="space-y-3">
      <p className="text-sm text-slate-600">
        Ligue as recepcionistas que vão cuidar da cobrança. Quem é liberado vê a lista completa, anota o resultado e recebe o
        aviso no celular. Gestor e admin sempre veem. A mudança vale quando a pessoa reabre o app.
      </p>
      <Estado carregando={q.isLoading} erro={q.error} vazio={todos.length ? null : "Nenhum login encontrado."}>
        <ul className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200">
          {lista.map((a) => (
            <li key={a.user_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-semibold text-slate-800">
                  {a.ve ? <Eye className="h-4 w-4 text-[#0f8b8d]" /> : <EyeOff className="h-4 w-4 text-slate-400" />}
                  {a.nome}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {a.papeis.map((p) => (
                    <Badge key={p} variant="secondary" className="text-[11px]">
                      {PAPEL[p] ?? p}
                    </Badge>
                  ))}
                  <span className="text-xs text-slate-500">{ORIGEM[a.origem]}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(a.origem === "liberado" || a.origem === "bloqueado") && (
                  <button
                    type="button"
                    title="Desfazer (voltar ao que está em Equipe)"
                    aria-label={`Desfazer a escolha para ${a.nome}`}
                    disabled={definir.isPending}
                    onClick={() => mudar(a, null)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f8b8d]"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                )}
                <Switch
                  checked={a.ve}
                  disabled={a.gestor || definir.isPending}
                  onCheckedChange={(v) => mudar(a, v)}
                  aria-label={`Reservas para ${a.nome}`}
                />
              </div>
            </li>
          ))}
        </ul>
        {escondidos > 0 && (
          <button
            type="button"
            onClick={() => setVerTodos((v) => !v)}
            className="text-sm font-semibold text-[#0f8b8d] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f8b8d]"
          >
            {verTodos ? "Mostrar só a Recepção e quem já vê" : `Mostrar os outros ${escondidos} logins`}
          </button>
        )}
      </Estado>
    </section>
  );
}
