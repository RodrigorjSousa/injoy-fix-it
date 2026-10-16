// Tela Reservas (cobrança): lista a cobrar para todos que têm acesso; Histórico, Conferência e Quem vê para o gestor.
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CreditCard, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { useUnidade } from "@/lib/unidade-context";
import { cn } from "@/lib/utils";
import { ErrorState, LoadingState, friendlyError } from "@/components/ui/data-state";
import { CobrancaCard, TOM_MOTIVO, brl, textoPrazo } from "@/components/reservas/cobranca-card";
import { ConferenciaCobrancas, HistoricoCobrancas, QuemVeReservas } from "@/components/reservas/painel-gestor";
import { cobrancaResolvida, compararParaLista, type MotivoCobranca } from "@/lib/reservas/cobranca";
import {
  useAtualizarAgora,
  useListaCobranca,
  useMarcarCobranca,
  useMarcarReservasVistas,
  useNovidadesReservas,
  usePermissaoReservas,
  useSyncCobranca,
  useTentativasCobranca,
  type LinhaCobranca,
} from "@/lib/reservas/use-reservas";

type Filtro = "todas" | MotivoCobranca;
type Aba = "lista" | "historico" | "conferencia" | "acessos";

const ABAS: { id: Aba; texto: string }[] = [
  { id: "lista", texto: "A cobrar" },
  { id: "historico", texto: "Histórico" },
  { id: "conferencia", texto: "Conferência" },
  { id: "acessos", texto: "Quem vê" },
];

function haQuanto(iso: string | null | undefined): string {
  if (!iso) return "nunca";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.floor(h / 24)} dias`;
}

const tratada = (l: LinhaCobranca) => cobrancaResolvida(l.cobrado);

export function ReservasTela() {
  const { unidade } = useUnidade();
  const perm = usePermissaoReservas();
  const gestor = perm.data?.gestor === true;
  const [aba, setAba] = useState<Aba>("lista");

  // Abriu a tela: o botão "Reservas" do menu para de piscar. Se entrar reserva nova com a tela
  // aberta, marca de novo (a pessoa já está vendo a lista).
  const ve = perm.data?.ve === true;
  const novidades = useNovidadesReservas(ve);
  const totalNovas = novidades.data
    ? novidades.data.nr_checkin_proximo + novidades.data.nr_8o_dia + novidades.data.standard
    : 0;
  const marcarVistas = useMarcarReservasVistas();
  const marcouAoAbrir = useRef(false);
  useEffect(() => {
    if (!ve) return;
    if (marcouAoAbrir.current && totalNovas === 0) return;
    marcouAoAbrir.current = true;
    marcarVistas.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ve, totalNovas]);

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-16">
      {gestor && (
        <nav aria-label="Seções das Reservas" className="flex gap-1 overflow-x-auto rounded-xl bg-white p-1 ring-1 ring-slate-200">
          {ABAS.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-current={aba === a.id ? "page" : undefined}
              onClick={() => setAba(a.id)}
              className={cn(
                "h-9 shrink-0 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f8b8d]",
                aba === a.id ? "bg-[#0e2a30] text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              {a.texto}
            </button>
          ))}
        </nav>
      )}

      {aba === "lista" || !gestor ? (
        <ListaACobrar key={unidade} unidade={unidade} />
      ) : (
        <div className="space-y-4">
          <h1 className="font-display text-2xl font-extrabold text-[#0e2a30]">
            {ABAS.find((a) => a.id === aba)?.texto}
            {aba !== "acessos" && <span className="font-semibold text-slate-400"> em {unidade}</span>}
          </h1>
          {aba === "historico" && <HistoricoCobrancas unidade={unidade} />}
          {aba === "conferencia" && <ConferenciaCobrancas unidade={unidade} />}
          {aba === "acessos" && <QuemVeReservas />}
        </div>
      )}
    </div>
  );
}

function ListaACobrar({ unidade }: { unidade: "Botafogo" | "Ipanema" }) {
  const lista = useListaCobranca(unidade);
  const sync = useSyncCobranca(unidade);
  const atualizar = useAtualizarAgora(unidade);
  const marcar = useMarcarCobranca(unidade);
  const tentativas = useTentativasCobranca(unidade);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busca, setBusca] = useState("");
  const [esconderTratadas, setEsconderTratadas] = useState(false);

  const todas = lista.data ?? [];
  const ativas = useMemo(() => todas.filter((l) => l.ativa && l.motivo), [todas]);
  const sairam = useMemo(
    () => todas.filter((l) => !l.ativa).sort((a, b) => (b.saiu_em ?? "").localeCompare(a.saiu_em ?? "")),
    [todas],
  );

  const pendentes = ativas.filter((l) => !tratada(l));
  const totalPendente = pendentes.reduce((s, l) => s + l.saldo, 0);
  const contagem = (m: MotivoCobranca) => ativas.filter((l) => l.motivo === m).length;

  const visiveis = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return ativas
      .filter((l) => filtro === "todas" || l.motivo === filtro)
      .filter((l) => !esconderTratadas || !tratada(l))
      .filter((l) => !b || l.hospede.toLowerCase().includes(b) || l.reservation_id.toLowerCase().includes(b))
      .map((l) => ({ ...l, motivo: l.motivo as MotivoCobranca, reservationId: l.reservation_id, dataReserva: l.data_reserva }))
      .sort(compararParaLista);
  }, [ativas, filtro, busca, esconderTratadas]);

  const antesDoCheckin = visiveis.filter((l) => l.motivo !== "nr_8o_dia");
  const oitavoDia = visiveis.filter((l) => l.motivo === "nr_8o_dia");
  const maisUrgente = [...pendentes]
    .map((l) => ({ ...l, motivo: l.motivo as MotivoCobranca, reservationId: l.reservation_id, dataReserva: l.data_reserva }))
    .sort(compararParaLista)[0];

  const s = sync.data;
  const falhou = !!s?.erro && (!s.ultima_ok || (s.ultima_tentativa ?? "") > s.ultima_ok);
  const nuncaGerada = !sync.isLoading && !s?.ultima_ok;

  const clicarAtualizar = () =>
    atualizar.mutate(undefined, {
      onSuccess: (r) =>
        toast.success(
          r.entraram ? `Lista atualizada: ${r.entraram} ${r.entraram === 1 ? "reserva entrou" : "reservas entraram"}` : "Lista atualizada",
        ),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível atualizar agora."),
    });

  const marcarLinha = (l: LinhaCobranca) => (cobrado: LinhaCobranca["cobrado"], observacao: string | null) =>
    marcar.mutateAsync({ id: l.id, cobrado, observacao });

  const filtros: { id: Filtro; texto: string; n: number }[] = [
    { id: "todas", texto: "Todas", n: ativas.length },
    { id: "nr_checkin_proximo", texto: "NR, check-in próximo", n: contagem("nr_checkin_proximo") },
    { id: "nr_8o_dia", texto: "NR, 8º dia", n: contagem("nr_8o_dia") },
    { id: "standard", texto: "Standard", n: contagem("standard") },
  ];

  return (
    <>
      {/* Cabeçalho: o total que falta cobrar e a próxima ação. */}
      <header className="overflow-hidden rounded-3xl bg-[#0e2a30] text-white">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-7">
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-[#7fd1cf]">
              <CreditCard className="h-4 w-4" /> Reservas a cobrar em {unidade}
            </p>
            {lista.isLoading ? (
              <div className="h-12 w-56 animate-pulse rounded-lg bg-white/10" />
            ) : (
              <p className="font-display text-4xl font-extrabold tabular-nums tracking-tight sm:text-5xl">{brl(totalPendente)}</p>
            )}
            <p className="max-w-xl text-sm leading-relaxed text-slate-300">
              {pendentes.length === 0
                ? "Nada pendente agora."
                : `${pendentes.length} ${pendentes.length === 1 ? "reserva pendente" : "reservas pendentes"}. `}
              {maisUrgente && (
                <>
                  A primeira da fila é <span className="font-semibold text-white">{maisUrgente.hospede}</span>,{" "}
                  {textoPrazo(maisUrgente).toLowerCase()}.
                </>
              )}
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <button
              type="button"
              onClick={clicarAtualizar}
              disabled={atualizar.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0f8b8d] px-4 text-sm font-bold text-white hover:bg-[#0c7a7c] disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e2a30]"
            >
              <RefreshCw className={cn("h-4 w-4", atualizar.isPending && "animate-spin")} />
              {atualizar.isPending ? "Consultando o Cloudbeds…" : "Atualizar agora"}
            </button>
            <p className="text-xs text-slate-400">
              Atualizada {haQuanto(s?.ultima_ok)}. Atualiza sozinha a cada hora.
            </p>
          </div>
        </div>
        <p className="border-t border-white/10 px-5 py-3 text-xs text-slate-300 sm:px-7">
          "Cobrar agora" cobra pelo Stripe o cartão guardado na reserva e lança o pagamento e a nota no Cloudbeds. A reserva sai
          sozinha quando o saldo zera.
        </p>
      </header>

      {falhou && (
        <div role="alert" className="flex gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">A última consulta ao Cloudbeds falhou ({haQuanto(s?.ultima_tentativa)}).</p>
            <p className="mt-0.5 text-amber-800">
              A lista abaixo é a da última atualização boa. Tente "Atualizar agora"; se continuar, avise o gestor.
            </p>
            <p className="mt-1 break-words text-xs text-amber-700">{s?.erro}</p>
          </div>
        </div>
      )}

      {/* Filtros: cada motivo com sua cor e quantidade. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div role="group" aria-label="Filtrar por motivo" className="flex flex-wrap gap-1.5">
          {filtros.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filtro === f.id}
              onClick={() => setFiltro(f.id)}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f8b8d]",
                filtro === f.id
                  ? "border-[#0e2a30] bg-[#0e2a30] text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
              )}
            >
              {f.id !== "todas" && <span className={cn("h-2 w-2 rounded-full", TOM_MOTIVO[f.id].ponto)} />}
              {f.texto}
              <span className={cn("tabular-nums", filtro === f.id ? "text-white/70" : "text-slate-400")}>{f.n}</span>
            </button>
          ))}
        </div>
        <label className="relative sm:ml-auto sm:w-60">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Hóspede ou nº da reserva"
            aria-label="Buscar reserva"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm focus:border-[#0f8b8d] focus:outline-none focus:ring-2 focus:ring-[#0f8b8d]/25"
          />
        </label>
      </div>
      <label className="flex w-max cursor-pointer items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={esconderTratadas}
          onChange={(e) => setEsconderTratadas(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 accent-[#0f8b8d]"
        />
        Esconder as já pagas e as de pagamento no check-in
      </label>

      {lista.isLoading ? (
        <LoadingState label="Carregando a lista de cobrança…" />
      ) : lista.error ? (
        <ErrorState title="Não foi possível abrir a lista" description={friendlyError(lista.error)} onRetry={() => void lista.refetch()} />
      ) : ativas.length === 0 ? (
        <div className="rounded-2xl bg-white px-6 py-12 text-center ring-1 ring-slate-200">
          <p className="font-display text-lg font-extrabold text-[#0e2a30]">
            {nuncaGerada ? "A lista ainda não foi gerada" : `Nenhuma reserva para cobrar em ${unidade}`}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            {nuncaGerada
              ? "Toque em Atualizar agora para consultar o Cloudbeds pela primeira vez."
              : "Quando uma reserva chegar no prazo de cobrança, ela aparece aqui sozinha e você recebe um aviso no celular."}
          </p>
        </div>
      ) : visiveis.length === 0 ? (
        <p className="rounded-2xl bg-white px-6 py-10 text-center text-sm text-slate-500 ring-1 ring-slate-200">
          Nenhuma reserva com esse filtro. Limpe a busca ou escolha "Todas".
        </p>
      ) : (
        <div className="space-y-8">
          <Grupo
            titulo="Antes do check-in"
            explicacao="NR com check-in a menos de 8 dias da reserva e Standard a até 2 dias do check-in, por data de check-in."
            linhas={antesDoCheckin}
            renderLinha={(l) => <CobrancaCard key={l.id} linha={l} tentativas={tentativas.data?.get(l.reservation_id)} salvando={marcar.isPending && marcar.variables?.id === l.id} onMarcar={marcarLinha(l)} />}
          />
          <Grupo
            titulo="NR liberadas no 8º dia"
            explicacao="Passado o prazo de arrependimento de 7 dias. As mais atrasadas primeiro."
            linhas={oitavoDia}
            renderLinha={(l) => <CobrancaCard key={l.id} linha={l} tentativas={tentativas.data?.get(l.reservation_id)} salvando={marcar.isPending && marcar.variables?.id === l.id} onMarcar={marcarLinha(l)} />}
          />
        </div>
      )}

      {sairam.length > 0 && (
        <details className="group rounded-2xl bg-white ring-1 ring-slate-200">
          <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-slate-700 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f8b8d] [&::-webkit-details-marker]:hidden">
            <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
            Saíram da lista nos últimos 2 dias ({sairam.length})
          </summary>
          <div className="space-y-3 px-4 pb-4">
            {sairam.map((l) => (
              <CobrancaCard key={l.id} linha={l} tentativas={tentativas.data?.get(l.reservation_id)} salvando={false} onMarcar={async () => undefined} />
            ))}
          </div>
        </details>
      )}
    </>
  );
}

function Grupo<T extends LinhaCobranca>({
  titulo,
  explicacao,
  linhas,
  renderLinha,
}: {
  titulo: string;
  explicacao: string;
  linhas: T[];
  renderLinha: (l: T) => React.ReactNode;
}) {
  if (!linhas.length) return null;
  const total = linhas.filter((l) => !tratada(l)).reduce((s, l) => s + l.saldo, 0);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-xl font-extrabold text-[#0e2a30]">
          {titulo} <span className="font-semibold tabular-nums text-slate-400">{linhas.length}</span>
        </h2>
        <p className="text-sm font-semibold tabular-nums text-slate-600">{brl(total)} pendente</p>
      </div>
      <p className="-mt-2 text-sm text-slate-500">{explicacao}</p>
      <div className="space-y-3">{linhas.map(renderLinha)}</div>
    </section>
  );
}
