import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Fingerprint,
  Loader2,
  Coffee,
  LogIn,
  LogOut,
  MapPin,
  ScanFace,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FaceCapture, type VerificacaoResultado } from "@/components/ponto/face-capture";
import { useMe } from "@/lib/store";
import { getDeviceId, getPosition } from "@/lib/ponto-face";
import {
  MOTIVO_LABEL,
  TIPO_BOTAO,
  TIPO_LABEL,
  type TipoBatida,
  enviarSelfie,
  horaSP,
  useListaQuiosque,
  useMeuStatusPonto,
  useRegistrarPonto,
  type PontoUnidade,
  type RegistroResultado,
} from "@/lib/ponto";
import { useUnidade } from "@/lib/unidade-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ponto")({
  head: () => ({
    meta: [
      { title: "Bater Ponto — INJOY" },
      { name: "description", content: "Registro de entrada e saída com reconhecimento facial." },
    ],
  }),
  component: PontoPage,
});

function PontoPage() {
  const { data: me } = useMe();
  const podeQuiosque = !!me && (me.isGestor || me.isAdmin || me.isRecepcao);
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <header>
        <Badge variant="secondary" className="mb-2">
          <Fingerprint className="mr-1 h-3 w-3" />
          Ponto
        </Badge>
        <h1 className="text-2xl font-bold">Bater Ponto</h1>
        <p className="text-sm text-muted-foreground">
          Controle interno do INJOY. O ponto oficial continua sendo a Pontomais.
        </p>
      </header>
      {podeQuiosque ? (
        <Tabs defaultValue="meu">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="meu">Meu ponto</TabsTrigger>
            <TabsTrigger value="freelancer">Ponto na recepção</TabsTrigger>
          </TabsList>
          <TabsContent value="meu" className="mt-4">
            <MeuPonto />
          </TabsContent>
          <TabsContent value="freelancer" className="mt-4">
            <PontoRecepcao />
          </TabsContent>
        </Tabs>
      ) : (
        <MeuPonto />
      )}
    </div>
  );
}

const COR_TIPO: Record<TipoBatida, string> = {
  entrada: "bg-emerald-600 hover:bg-emerald-700",
  saida_almoco: "bg-amber-500 hover:bg-amber-600",
  volta_almoco: "bg-sky-600 hover:bg-sky-700",
  saida: "bg-rose-600 hover:bg-rose-700",
};

function BotaoBatida({
  tipo,
  destaque,
  onClick,
}: {
  tipo: TipoBatida;
  destaque: boolean;
  onClick: () => void;
}) {
  const Icone =
    tipo === "entrada" || tipo === "volta_almoco"
      ? LogIn
      : tipo === "saida_almoco"
        ? Coffee
        : LogOut;
  return (
    <Button
      size="lg"
      className={cn(
        "w-full gap-2 text-white",
        destaque ? "h-16 text-lg" : "h-12 text-base",
        COR_TIPO[tipo],
      )}
      onClick={onClick}
    >
      <Icone className={destaque ? "h-6 w-6" : "h-5 w-5"} />
      {TIPO_BOTAO[tipo]}
    </Button>
  );
}

function ResultadoCard({ r, onOk }: { r: RegistroResultado; onOk: () => void }) {
  const ok = r.status === "valida";
  return (
    <Card
      className={cn(
        "space-y-3 p-5 text-center",
        ok ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50",
      )}
    >
      {ok ? (
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
      ) : (
        <AlertTriangle className="mx-auto h-12 w-12 text-amber-600" />
      )}
      <div>
        <p className="text-lg font-black">
          {TIPO_LABEL[r.tipo]} registrada às {horaSP(r.registrado_em)}
        </p>
        <p className="text-sm text-slate-600">
          {r.nome} · {r.unidade}
        </p>
      </div>
      {!ok && (
        <div className="space-y-1 text-sm">
          <p className="font-semibold text-amber-800">
            Registrada com pendência — o gestor vai conferir:
          </p>
          <div className="flex flex-wrap justify-center gap-1">
            {r.motivos.map((m) => (
              <Badge key={m} variant="outline" className="border-amber-400 text-amber-800">
                {MOTIVO_LABEL[m] ?? m}
              </Badge>
            ))}
          </div>
        </div>
      )}
      <Button onClick={onOk} className="w-full">
        OK
      </Button>
    </Card>
  );
}

async function registrar(
  resultado: VerificacaoResultado,
  mutate: ReturnType<typeof useRegistrarPonto>["mutateAsync"],
  extra: { modo: "app" | "quiosque"; colaboradorId?: string; tipo: TipoBatida },
  posicao: Awaited<ReturnType<typeof getPosition>>,
) {
  const selfiePath = await enviarSelfie(resultado.selfie);
  return mutate({
    descritor: resultado.descritor,
    latitude: posicao?.latitude ?? null,
    longitude: posicao?.longitude ?? null,
    precisao: posicao ? Math.round(posicao.accuracy) : null,
    vivacidade: resultado.vivacidade,
    deviceId: getDeviceId(),
    selfiePath,
    modo: extra.modo,
    colaboradorId: extra.colaboradorId ?? null,
    tipo: extra.tipo,
  });
}

function MeuPonto() {
  const status = useMeuStatusPonto();
  const registrarMut = useRegistrarPonto();
  const [etapa, setEtapa] = useState<"inicio" | "camera" | "enviando" | "resultado">("inicio");
  const [resultado, setResultado] = useState<RegistroResultado | null>(null);
  const [posicaoPromise, setPosicaoPromise] = useState<ReturnType<typeof getPosition> | null>(null);
  const [tipoEscolhido, setTipoEscolhido] = useState<TipoBatida>("entrada");

  if (status.isLoading)
    return (
      <Card className="p-6 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
      </Card>
    );
  if (status.error)
    return (
      <Card className="p-6 text-sm text-rose-600">
        Não foi possível carregar seu ponto. {(status.error as Error).message}
      </Card>
    );
  const s = status.data;
  if (!s?.vinculado) {
    return (
      <Card className="space-y-2 p-6 text-center">
        <Users className="mx-auto h-8 w-8 text-slate-400" />
        <p className="font-semibold">Seu usuário ainda não está ligado à escala.</p>
        <p className="text-sm text-muted-foreground">
          O gestor vincula seu usuário em Área do Gestor › Ponto Facial › Pessoas.
        </p>
      </Card>
    );
  }
  if (s.habilitado === false) {
    return (
      <Card className="space-y-2 p-6 text-center">
        <Users className="mx-auto h-8 w-8 text-slate-400" />
        <p className="font-semibold">Você não está habilitado(a) para o ponto do app.</p>
        <p className="text-sm text-muted-foreground">Fale com o gestor se precisar registrar.</p>
      </Card>
    );
  }

  const proximos: TipoBatida[] = s.proximos_tipos?.length ? s.proximos_tipos : ["entrada"];
  const emAlmoco = s.ultimo_tipo_aberto === "saida_almoco";
  const desde = s.batidas_recentes?.find(
    (b) => b.status !== "recusada" && b.tipo === s.ultimo_tipo_aberto,
  );

  const comecar = (tipo: TipoBatida) => {
    // Pede a localização em paralelo com a câmera (o GPS demora alguns segundos)
    setTipoEscolhido(tipo);
    setPosicaoPromise(getPosition());
    setEtapa("camera");
  };

  const aoCapturar = async (r: VerificacaoResultado) => {
    setEtapa("enviando");
    try {
      const posicao = posicaoPromise ? await posicaoPromise : await getPosition();
      const res = await registrar(
        r,
        registrarMut.mutateAsync,
        { modo: "app", tipo: tipoEscolhido },
        posicao,
      );
      setResultado(res);
      setEtapa("resultado");
      if (res.status === "valida") toast.success(`${TIPO_LABEL[res.tipo]} registrada`);
    } catch (error) {
      toast.error((error as Error).message ?? "Falha ao registrar o ponto");
      setEtapa("inicio");
    }
  };

  if (etapa === "resultado" && resultado)
    return (
      <ResultadoCard
        r={resultado}
        onOk={() => {
          setResultado(null);
          setEtapa("inicio");
        }}
      />
    );
  if (etapa === "enviando")
    return (
      <Card className="space-y-2 p-8 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin" />
        <p className="text-sm">Registrando…</p>
      </Card>
    );
  if (etapa === "camera")
    return (
      <Card className="space-y-3 p-4">
        <p className="text-center text-sm font-semibold">{TIPO_LABEL[tipoEscolhido]}</p>
        <FaceCapture
          modo="verificar"
          onResultado={aoCapturar}
          onCancelar={() => setEtapa("inicio")}
        />
      </Card>
    );

  const escala =
    s.escala_hoje?.filter((e) => e.status === "trabalho" || e.status === "extra") ?? [];
  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-slate-500">Olá</p>
            <p className="text-lg font-black">{s.nome}</p>
          </div>
          <Badge variant={s.cadastro_facial ? "secondary" : "destructive"} className="gap-1">
            <ScanFace className="h-3 w-3" />
            {s.cadastro_facial ? "Rosto cadastrado" : "Sem cadastro facial"}
          </Badge>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <Clock className="h-4 w-4" />
            Escala de hoje
          </p>
          {escala.length ? (
            escala.map((e, i) => (
              <p key={i} className="mt-1 text-slate-600">
                {e.unidade} · {e.hora_entrada?.slice(0, 5) ?? "—"} às{" "}
                {e.hora_saida?.slice(0, 5) ?? "—"}
                {e.status === "extra" ? " · plantão extra" : ""}
              </p>
            ))
          ) : (
            <p className="mt-1 text-slate-500">Sem plantão publicado para hoje.</p>
          )}
        </div>
        {!s.cadastro_facial && (
          <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            Você ainda não tem o rosto cadastrado. Pode bater o ponto, mas ele ficará pendente até o
            gestor conferir. Peça o cadastro facial ao gestor.
          </p>
        )}
        {s.ultimo_tipo_aberto && desde && (
          <p
            className={cn(
              "rounded-lg p-3 text-center text-sm font-semibold",
              emAlmoco ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800",
            )}
          >
            {emAlmoco ? "Em almoço desde " : "Trabalhando — última batida: "}
            {emAlmoco
              ? horaSP(desde.registrado_em)
              : `${TIPO_LABEL[desde.tipo]} às ${horaSP(desde.registrado_em)}`}
          </p>
        )}
        <div className="grid gap-2">
          {proximos.map((t, idx) => (
            <BotaoBatida key={t} tipo={t} destaque={idx === 0} onClick={() => comecar(t)} />
          ))}
        </div>
        <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" />
          Usa câmera e localização somente no momento da batida.
        </p>
      </Card>

      {!!s.batidas_recentes?.length && (
        <Card className="p-4">
          <p className="mb-2 text-xs font-bold uppercase text-slate-500">Últimas batidas</p>
          <ul className="space-y-1 text-sm">
            {s.batidas_recentes.map((b) => (
              <li key={b.id} className="flex items-center justify-between">
                <span>
                  {TIPO_LABEL[b.tipo]} ·{" "}
                  {new Date(b.registrado_em).toLocaleDateString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                  })}{" "}
                  {horaSP(b.registrado_em)}
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    b.status === "pendente" && "border-amber-400 text-amber-700",
                    b.status === "recusada" && "border-rose-400 text-rose-700",
                  )}
                >
                  {b.status === "valida" ? "ok" : b.status}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function PontoRecepcao() {
  const { unidade: unidadeAtiva } = useUnidade();
  const [unidade, setUnidade] = useState<PontoUnidade>(unidadeAtiva as PontoUnidade);
  const lista = useListaQuiosque(unidade, true);
  const [busca, setBusca] = useState("");
  const normal = (t: string) =>
    t
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const filtrada = (lista.data ?? []).filter((p) => normal(p.nome).includes(normal(busca)));
  const grupos = [
    { titulo: "Funcionários fixos", itens: filtrada.filter((p) => p.vinculo === "fixo") },
    { titulo: "Freelancers", itens: filtrada.filter((p) => p.vinculo === "freelance") },
  ].filter((g) => g.itens.length);
  const registrarMut = useRegistrarPonto();
  const [selecionado, setSelecionado] = useState<{
    id: string;
    nome: string;
    proximos: TipoBatida[];
    tipo: TipoBatida;
  } | null>(null);
  const [etapa, setEtapa] = useState<"lista" | "escolha" | "camera" | "enviando" | "resultado">(
    "lista",
  );
  const [resultado, setResultado] = useState<RegistroResultado | null>(null);
  const [posicaoPromise, setPosicaoPromise] = useState<ReturnType<typeof getPosition> | null>(null);

  const aoCapturar = async (r: VerificacaoResultado) => {
    if (!selecionado) return;
    setEtapa("enviando");
    try {
      const posicao = posicaoPromise ? await posicaoPromise : await getPosition();
      const res = await registrar(
        r,
        registrarMut.mutateAsync,
        { modo: "quiosque", colaboradorId: selecionado.id, tipo: selecionado.tipo },
        posicao,
      );
      setResultado(res);
      setEtapa("resultado");
    } catch (error) {
      toast.error((error as Error).message ?? "Falha ao registrar o ponto");
      setEtapa("lista");
    }
  };

  if (etapa === "resultado" && resultado)
    return (
      <ResultadoCard
        r={resultado}
        onOk={() => {
          setResultado(null);
          setSelecionado(null);
          setEtapa("lista");
        }}
      />
    );
  if (etapa === "enviando")
    return (
      <Card className="space-y-2 p-8 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin" />
        <p className="text-sm">Registrando…</p>
      </Card>
    );
  if (etapa === "escolha" && selecionado) {
    return (
      <Card className="space-y-3 p-5">
        <p className="text-center font-semibold">{selecionado.nome} — o que vai registrar?</p>
        {selecionado.proximos.map((t, idx) => (
          <BotaoBatida
            key={t}
            tipo={t}
            destaque={idx === 0}
            onClick={() => {
              setSelecionado({ ...selecionado, tipo: t });
              setPosicaoPromise(getPosition());
              setEtapa("camera");
            }}
          />
        ))}
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => {
            setSelecionado(null);
            setEtapa("lista");
          }}
        >
          Voltar
        </Button>
      </Card>
    );
  }
  if (etapa === "camera" && selecionado) {
    return (
      <Card className="space-y-3 p-4">
        <p className="text-center text-sm font-semibold">
          {selecionado.nome} · {TIPO_LABEL[selecionado.tipo]}
        </p>
        <FaceCapture
          modo="verificar"
          onResultado={aoCapturar}
          onCancelar={() => {
            setSelecionado(null);
            setEtapa("lista");
          }}
        />
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-5">
      <p className="text-sm text-muted-foreground">
        Aparelho da recepção: qualquer pessoa da equipe (fixa ou freelancer) escolhe o nome e
        confirma pelo rosto. Use quando a pessoa estiver sem o celular dela.
      </p>
      <div className="flex gap-2">
        {(["Botafogo", "Ipanema"] as PontoUnidade[]).map((u) => (
          <Button
            key={u}
            variant={u === unidade ? "default" : "outline"}
            className="flex-1"
            onClick={() => setUnidade(u)}
          >
            {u}
          </Button>
        ))}
      </div>
      {lista.isLoading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
      ) : lista.error ? (
        <p className="text-sm text-rose-600">{(lista.error as Error).message}</p>
      ) : !lista.data?.length ? (
        <p className="text-sm text-muted-foreground">
          Ninguém habilitado para o ponto em {unidade}. O gestor inclui as pessoas em Ponto Facial ›
          Pessoas.
        </p>
      ) : (
        <div className="space-y-4">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar pelo nome"
          />
          {!grupos.length && (
            <p className="text-sm text-muted-foreground">Nenhum nome encontrado.</p>
          )}
          {grupos.map((g) => (
            <div key={g.titulo} className="space-y-2">
              <p className="text-xs font-bold uppercase text-slate-500">{g.titulo}</p>
              <ul className="space-y-2">
                {g.itens.map((f) => (
                  <li key={f.colaborador_id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded-xl border bg-white p-3 text-left hover:border-primary"
                      onClick={() => {
                        const proximos = f.proximos_tipos?.length
                          ? f.proximos_tipos
                          : (["entrada"] as TipoBatida[]);
                        setSelecionado({
                          id: f.colaborador_id,
                          nome: f.nome,
                          proximos,
                          tipo: proximos[0],
                        });
                        if (proximos.length > 1) return setEtapa("escolha");
                        setPosicaoPromise(getPosition());
                        setEtapa("camera");
                      }}
                    >
                      <span className="font-semibold">{f.nome}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        {!f.cadastro_facial && (
                          <Badge variant="outline" className="border-amber-400 text-amber-700">
                            sem rosto
                          </Badge>
                        )}
                        <Badge className={COR_TIPO[f.proximos_tipos?.[0] ?? "entrada"]}>
                          {f.ultimo_tipo === "saida_almoco"
                            ? "No almoço"
                            : f.entrada_aberta
                              ? "Trabalhando"
                              : "Registrar entrada"}
                        </Badge>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
