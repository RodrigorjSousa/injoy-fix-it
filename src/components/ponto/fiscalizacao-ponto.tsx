import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Download,
  FileCheck2,
  KeyRound,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { arquivoParaBase64, baixarBase64 } from "@/lib/baixar-arquivo";
import { afdAssinadoPonto, enviarCertificadoPonto } from "@/lib/ponto-assinatura.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addCivilDays } from "@/lib/escala-engine";
import { formatarCnpj } from "@/lib/cpf";
import { usePessoasPonto } from "@/lib/ponto";
import {
  afdParaBytes,
  conferirRegistros,
  gerarAfd,
  nomeArquivoAfd,
  type Conferencia,
} from "@/lib/ponto-afd";
import {
  dataDoRegistro,
  lerRegistrosRep,
  useAceitesTermo,
  useAtivarRep,
  useCertificadoInfo,
  useEmpregador,
  useResumoRep,
  useSalvarEmpregador,
} from "@/lib/ponto-rep";
import { todaySP } from "@/lib/tz";
import { cn } from "@/lib/utils";

function Pendencia({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <li
      className={cn("flex items-start gap-2 text-sm", ok ? "text-emerald-700" : "text-amber-800")}
    >
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      {texto}
    </li>
  );
}

function FormEmpregador() {
  const emp = useEmpregador();
  const salvar = useSalvarEmpregador();
  const [f, setF] = useState({
    documento: "",
    razao_social: "",
    cno_caepf: "",
    inpi_registro: "",
    desenvolvedor_documento: "",
  });
  useEffect(() => {
    if (emp.data)
      setF({
        documento: formatarCnpj(emp.data.documento),
        razao_social: emp.data.razao_social,
        cno_caepf: emp.data.cno_caepf ?? "",
        inpi_registro: emp.data.inpi_registro ?? "",
        desenvolvedor_documento: emp.data.desenvolvedor_documento ?? "",
      });
  }, [emp.data]);
  const enviar = () =>
    salvar.mutate(
      { tipo_doc: 1, ...f },
      {
        onSuccess: () => toast.success("Dados do empregador salvos"),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  return (
    <Card className="space-y-3 p-4">
      <p className="font-semibold">Empregador</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label className="text-xs">CNPJ</Label>
          <Input
            value={f.documento}
            onChange={(e) => setF({ ...f, documento: e.target.value })}
            placeholder="00.000.000/0000-00"
          />
        </div>
        <div>
          <Label className="text-xs">Razão social</Label>
          <Input
            value={f.razao_social}
            onChange={(e) => setF({ ...f, razao_social: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">CNO ou CAEPF (se houver)</Label>
          <Input value={f.cno_caepf} onChange={(e) => setF({ ...f, cno_caepf: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Nº do registro do programa no INPI</Label>
          <Input
            value={f.inpi_registro}
            onChange={(e) => setF({ ...f, inpi_registro: e.target.value })}
            placeholder="preencha quando sair o registro"
          />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">
            CNPJ do desenvolvedor do programa (em branco = o próprio empregador)
          </Label>
          <Input
            value={f.desenvolvedor_documento}
            onChange={(e) => setF({ ...f, desenvolvedor_documento: e.target.value })}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Locais de prestação: R. Estácio Coimbra, 80 (Botafogo) e R. Joana Angélica, 247 (Ipanema),
        com o mesmo CNPJ.
      </p>
      <Button onClick={enviar} disabled={salvar.isPending}>
        {salvar.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
        Salvar
      </Button>
    </Card>
  );
}

function CertificadoA1Card() {
  const cert = useCertificadoInfo();
  const enviar = useServerFn(enviarCertificadoPonto);
  const qc = useQueryClient();
  const [enviando, setEnviando] = useState(false);
  const aoEscolher = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setEnviando(true);
    try {
      const info = await enviar({ data: { pfxBase64: await arquivoParaBase64(arquivo) } });
      toast.success(`Certificado de ${info.titular} guardado`);
      qc.invalidateQueries({ queryKey: ["ponto", "rep", "certificado"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };
  const vencido = cert.data && new Date(cert.data.valido_ate) < new Date();
  return (
    <Card className="space-y-3 p-4">
      <p className="flex items-center gap-2 font-semibold">
        <KeyRound className="h-4 w-4" />
        Certificado digital e-CNPJ A1
      </p>
      {cert.data ? (
        <div
          className={cn(
            "rounded-lg p-2 text-sm",
            vencido ? "bg-rose-50 text-rose-800" : "bg-slate-50",
          )}
        >
          <p className="font-semibold">{cert.data.titular}</p>
          <p className="text-xs text-slate-600">
            {cert.data.documento ? `CNPJ ${formatarCnpj(cert.data.documento)} · ` : ""}
            Emissor: {cert.data.emissor} · válido de{" "}
            {new Date(cert.data.valido_de).toLocaleDateString("pt-BR")} até{" "}
            {new Date(cert.data.valido_ate).toLocaleDateString("pt-BR")}
            {vencido ? " · VENCIDO" : ""}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhum certificado enviado.</p>
      )}
      <div>
        <Label className="text-xs">
          {cert.data ? "Trocar certificado (.pfx ou .p12)" : "Enviar certificado (.pfx ou .p12)"}
        </Label>
        <Input
          type="file"
          accept=".pfx,.p12,application/x-pkcs12"
          disabled={enviando}
          onChange={(e) => void aoEscolher(e.target.files?.[0])}
        />
      </div>
      {enviando && (
        <p className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Conferindo e guardando…
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        A senha do certificado não é digitada aqui: ela fica no segredo <b>CERT_A1_SENHA</b> do
        Lovable. O arquivo fica guardado no banco num lugar que só o servidor lê; ninguém consegue
        baixá-lo pelo app. Use o mesmo certificado para o AFD e os comprovantes.
      </p>
    </Card>
  );
}

function ArquivoFiscal({ temCertificado }: { temCertificado: boolean }) {
  const emp = useEmpregador();
  const afdAssinado = useServerFn(afdAssinadoPonto);
  const hoje = todaySP();
  const [inicio, setInicio] = useState(`${hoje.slice(0, 7)}-01`);
  const [fim, setFim] = useState(hoje);
  const [gerando, setGerando] = useState(false);
  const [conf, setConf] = useState<Conferencia | null>(null);

  const gerar = async (assinado: boolean) => {
    if (!emp.data) return toast.error("Salve antes os dados do empregador.");
    if (fim < inicio) return toast.error("A data final é antes da inicial.");
    setGerando(true);
    try {
      const todos = await lerRegistrosRep(fim);
      const c = await conferirRegistros(todos);
      setConf(c);
      const periodo = todos.filter((r) => {
        const d = dataDoRegistro(r);
        return d >= inicio && d <= fim;
      });
      if (assinado) {
        const r = await afdAssinado({ data: { inicio, fim } });
        baixarBase64(r.afdBase64, r.nome, "text/plain");
        setTimeout(
          () => baixarBase64(r.p7sBase64, `${r.nome}.p7s`, "application/pkcs7-signature"),
          400,
        );
        toast.success(`AFD com ${r.registros} registro(s) e assinatura .p7s (${r.assinadoPor})`);
      } else {
        const texto = gerarAfd(emp.data, periodo, { inicio, fim });
        const blob = new Blob([afdParaBytes(texto)], { type: "text/plain;charset=iso-8859-1" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = nomeArquivoAfd(emp.data);
        a.click();
        URL.revokeObjectURL(a.href);
        toast.success(`AFD sem assinatura com ${periodo.length} registro(s)`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGerando(false);
    }
  };

  return (
    <Card className="space-y-3 p-4">
      <p className="flex items-center gap-2 font-semibold">
        <FileCheck2 className="h-4 w-4" />
        Arquivo para a fiscalização (AFD)
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">De</Label>
          <Input
            type="date"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
            className="w-40"
          />
        </div>
        <div>
          <Label className="text-xs">Até</Label>
          <Input
            type="date"
            value={fim}
            max={hoje}
            onChange={(e) => setFim(e.target.value)}
            className="w-40"
          />
        </div>
        <Button
          className="gap-2"
          onClick={() => void gerar(true)}
          disabled={gerando || !emp.data?.oficial_desde || !temCertificado}
        >
          {gerando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Baixar AFD assinado (.txt + .p7s)
        </Button>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => void gerar(false)}
          disabled={gerando || !emp.data?.oficial_desde}
        >
          Sem assinatura
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setInicio(addCivilDays(hoje, -30));
            setFim(hoje);
          }}
        >
          Últimos 30 dias
        </Button>
      </div>
      {conf && (
        <p
          className={cn(
            "flex items-start gap-2 rounded-lg p-2 text-sm",
            conf.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800",
          )}
        >
          {conf.ok ? (
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          {conf.ok
            ? `Integridade conferida: ${conf.marcacoes} marcação(ões), sequência de NSR sem buracos e cadeia de hashes correta.`
            : `Problema na integridade: ${conf.buracos.length ? `NSR faltando: ${conf.buracos.join(", ")}. ` : ""}${conf.hashesErrados.length ? `Hash não confere nos NSR: ${conf.hashesErrados.join(", ")}.` : ""}`}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Leiaute 004 da Portaria 671 (ISO-8859-1, CR LF, CRC-16 nos tipos 1 a 5). A assinatura CAdES
        (.p7s destacado) é feita no servidor com o e-CNPJ A1 enviado acima; entregue os dois
        arquivos juntos à fiscalização.
      </p>
    </Card>
  );
}

export function FiscalizacaoPonto() {
  const emp = useEmpregador();
  const resumo = useResumoRep();
  const pessoas = usePessoasPonto();
  const ativar = useAtivarRep();
  const cert = useCertificadoInfo();
  const aceites = useAceitesTermo(
    pessoas.data?.pessoas.filter((p) => p.ativo && p.ponto_habilitado && p.funcionario_id).length ??
      0,
  );

  if (emp.isLoading) return <Loader2 className="mx-auto h-6 w-6 animate-spin" />;
  if (emp.error) return <p className="text-sm text-rose-600">{(emp.error as Error).message}</p>;

  const semCpf = pessoas.data?.pessoas.filter((p) => p.ativo && p.ponto_habilitado && !p.cpf) ?? [];
  const ativo = !!emp.data?.oficial_desde;

  const ativarRep = () => {
    const texto =
      "Ativar o registro oficial do ponto (REP-P)?\n\n" +
      "• A partir de agora toda batida no app ou na recepção vira uma marcação permanente, com NSR e hash, que nunca poderá ser alterada nem apagada.\n" +
      "• O ponto deixa de bloquear batidas: fora dos 100 m, sem localização, fora de ordem ou repetida, a batida é gravada e fica pendente para você conferir.\n" +
      "• Lançamentos manuais e pedidos aprovados continuam como ajustes (não são marcações).\n" +
      (semCpf.length
        ? `\nAtenção: ${semCpf.length} pessoa(s) sem CPF; as marcações delas sairão com CPF zerado.\n`
        : "") +
      "\nNão dá para desativar depois.";
    if (!window.confirm(texto)) return;
    ativar.mutate(undefined, {
      onSuccess: (r) =>
        toast.success(
          `Registro oficial ativado · ${r.pessoas} pessoa(s) incluída(s)${r.sem_cpf.length ? ` · sem CPF: ${r.sem_cpf.join(", ")}` : ""}`,
        ),
      onError: (e) => toast.error((e as Error).message),
    });
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <p className="flex items-center gap-2 font-semibold">
          {ativo ? (
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          ) : (
            <ShieldAlert className="h-4 w-4 text-amber-600" />
          )}
          Registro oficial (REP-P, Portaria 671):{" "}
          {ativo
            ? `ativo desde ${new Date(emp.data!.oficial_desde!).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
            : "desligado"}
        </p>
        {ativo && resumo.data && (
          <p className="text-sm text-slate-600">
            Registros permanentes: {resumo.data.marcacoes} marcação(ões), {resumo.data.empregados}{" "}
            de empregados e {resumo.data.empregador} do empregador.
          </p>
        )}
        <ul className="space-y-1">
          <Pendencia ok={!!emp.data} texto="Dados do empregador (CNPJ e razão social)" />
          <Pendencia
            ok={!semCpf.length}
            texto={
              semCpf.length
                ? `CPF de todos que batem ponto — faltam ${semCpf.length}: ${semCpf.map((p) => p.nome).join(", ")} (cadastre na aba Pessoas)`
                : "CPF de todos que batem ponto"
            }
          />
          <Pendencia
            ok={!!emp.data?.inpi_registro}
            texto="Registro do programa no INPI (com o contador ou advogado)"
          />
          <Pendencia
            ok={!!cert.data && new Date(cert.data.valido_ate) > new Date()}
            texto={
              cert.data
                ? `Certificado e-CNPJ A1: ${cert.data.titular}, válido até ${new Date(cert.data.valido_ate).toLocaleDateString("pt-BR")}`
                : "Certificado e-CNPJ A1 para assinar o AFD (.p7s) e os comprovantes (PDF)"
            }
          />
          <Pendencia
            ok={false}
            texto="Atestado Técnico e Termo de Responsabilidade assinados (responsável legal e técnico)"
          />
          <Pendencia
            ok={
              !!aceites.data && aceites.data.aceitos >= aceites.data.total && aceites.data.total > 0
            }
            texto={`Novo termo aceito pelos funcionários no app: ${aceites.data?.aceitos ?? 0} de ${aceites.data?.total ?? 0} (aparece para eles depois da ativação)`}
          />
          <Pendencia ok={false} texto="AEJ e espelho no formato legal — próxima etapa" />
        </ul>
        {!ativo && (
          <Button className="gap-2" onClick={ativarRep} disabled={!emp.data || ativar.isPending}>
            {ativar.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Ativar registro oficial
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          Enquanto o Pontomais for o ponto oficial, dá para ativar e rodar em paralelo para testar:
          as marcações ficam guardadas com NSR e hash. Ative só quando os dados do empregador e os
          CPFs estiverem certos.
        </p>
      </Card>
      <FormEmpregador />
      <CertificadoA1Card />
      <ArquivoFiscal temCertificado={!!cert.data} />
    </div>
  );
}
