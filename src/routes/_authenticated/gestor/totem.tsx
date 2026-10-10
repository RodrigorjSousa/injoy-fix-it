import { createFileRoute } from "@tanstack/react-router";
import { conferenciaFoto } from "@/lib/totem/rosto";
import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Copy, KeyRound, Loader2, Plus, Save, Star, Unplug } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

// Área do Gestor › Totem: cadastro dos tablets de auto check-in/check-out,
// regras de liberação da senha, pareamento e histórico.

export const Route = createFileRoute("/_authenticated/gestor/totem")({
  head: () => ({ meta: [{ title: "Totem | Área do Gestor" }] }),
  component: TotemGestor,
});

// Tabelas novas ainda não estão no types.ts gerado.
const sb = supabase as unknown as SupabaseClient;

type TotemRow = {
  id: string;
  nome: string;
  unidade: "Botafogo" | "Ipanema";
  ativo: boolean;
  token_hash: string | null;
  pareado_em: string | null;
  ultimo_uso: string | null;
  hora_checkin: string;
  hora_checkout: string;
  exige_quarto_limpo: boolean;
  bloqueia_saldo_aberto: boolean;
  telefone_suporte: string | null;
  modo: "ambos" | "checkin" | "checkout";
  // 0045 (podem faltar se a migração ainda não foi aplicada)
  pagamento_habilitado?: boolean;
  pos_serial?: string | null;
  pede_documentos?: boolean;
  voz_ativa?: boolean;
  impressora?: "nenhuma" | "rawbt";
  wifi_rede?: string | null;
  wifi_senha?: string | null;
  mensagem_comprovante?: string | null;
};

type CobrancaRow = {
  id: string;
  unidade: string;
  reservation_id: string;
  hospede: string | null;
  fluxo: string;
  valor: number;
  metodo: string;
  status: string;
  bandeira: string | null;
  cloudbeds_lancado: boolean;
  cloudbeds_erro: string | null;
  criado_em: string;
};

type DocumentoRow = {
  id: string;
  unidade: string;
  reservation_id: string;
  hospede_nome: string;
  hospede_ordem: number;
  tipo_documento: string;
  numero_documento: string | null;
  etapa: string;
  vivacidade: boolean | null;
  dist_mesma_pessoa: number | null;
  dist_foto_documento: number | null;
  arquivo_path: string;
  cloudbeds_erro: string | null;
  criado_em: string;
};

const STATUS_COBRANCA: Record<string, string> = {
  pendente: "Aguardando",
  pago: "Pago",
  cancelado: "Cancelado",
  falhou: "Falhou",
  expirado: "Expirou",
};

const MODOS: Array<{ id: TotemRow["modo"]; rotulo: string }> = [
  { id: "checkin", rotulo: "Só check-in" },
  { id: "checkout", rotulo: "Só check-out" },
  { id: "ambos", rotulo: "Os dois" },
];

type Evento = {
  id: string;
  unidade: string | null;
  tipo: string;
  quarto: string | null;
  hospede: string | null;
  detalhe: string | null;
  criado_em: string;
};

type AvaliacaoRow = {
  id: string;
  unidade: string;
  quarto: string | null;
  hospede: string | null;
  nota: number;
  comentario: string | null;
  criado_em: string;
};

const TIPOS: Record<string, string> = {
  pareamento: "Tablet conectado",
  identificacao_ok: "Reserva encontrada",
  identificacao_falhou: "Dados não conferem",
  checkin_ok: "Check-in feito",
  checkin_impedido: "Check-in não liberado",
  checkin_erro: "Erro no check-in",
  senha_reexibida: "Senha mostrada de novo",
  checkout_ok: "Check-out feito",
  checkout_impedido: "Check-out não liberado",
  checkout_erro: "Erro no check-out",
  avaliacao: "Avaliação",
  pagamento_iniciado: "Cobrança enviada à maquininha",
  documento: "Foto de documento",
};

const MOTIVOS: Record<string, string> = {
  reserva_cancelada: "reserva cancelada",
  ja_saiu: "já fez check-out",
  ja_hospedado: "check-in já feito",
  chegada_outro_dia: "chegada em outro dia",
  antes_do_horario: "antes do horário",
  sem_quarto: "sem quarto atribuído",
  quarto_nao_limpo: "quarto não limpo",
  sem_fechadura: "quarto sem fechadura",
  saldo_aberto: "saldo em aberto",
  nao_hospedado: "não hospedado",
  documentos_pendentes: "faltam documentos",
};

const dataHora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })
    : "—";

const hhmm = (v: string) => v.slice(0, 5);

function TotemGestor() {
  const [totens, setTotens] = useState<TotemRow[] | null>(null);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<AvaliacaoRow[]>([]);
  const [cobrancas, setCobrancas] = useState<CobrancaRow[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoRow[]>([]);
  const [aviso0045, setAviso0045] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [novaUnidade, setNovaUnidade] = useState<"Botafogo" | "Ipanema">("Ipanema");
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    const [t, e, a] = await Promise.all([
      sb
        .from("totem_dispositivos")
        .select("*")
        .order("criado_em"),
      sb.from("totem_eventos").select("id,unidade,tipo,quarto,hospede,detalhe,criado_em").order("criado_em", { ascending: false }).limit(60),
      sb.from("totem_avaliacoes").select("id,unidade,quarto,hospede,nota,comentario,criado_em").order("criado_em", { ascending: false }).limit(50),
    ]);
    const falha = t.error ?? e.error ?? a.error;
    if (falha) {
      setErro(
        /does not exist|schema cache/i.test(falha.message)
          ? "As tabelas do totem ainda não estão completas. Aplique no Lovable as migrações drizzle/migrations/0041_totem_checkin_checkout.sql e 0042_totem_modo.sql."
          : falha.message,
      );
      setTotens([]);
      return;
    }
    setErro(null);
    setTotens((t.data ?? []) as TotemRow[]);
    setEventos((e.data ?? []) as Evento[]);
    setAvaliacoes((a.data ?? []) as AvaliacaoRow[]);

    // Pagamentos e documentos (migração 0045). Se ainda não existir, só avisa.
    const [c, d] = await Promise.all([
      sb
        .from("totem_cobrancas")
        .select("id,unidade,reservation_id,hospede,fluxo,valor,metodo,status,bandeira,cloudbeds_lancado,cloudbeds_erro,criado_em")
        .order("criado_em", { ascending: false })
        .limit(40),
      sb
        .from("totem_documentos")
        .select("id,unidade,reservation_id,hospede_nome,hospede_ordem,tipo_documento,numero_documento,etapa,vivacidade,dist_mesma_pessoa,dist_foto_documento,arquivo_path,cloudbeds_erro,criado_em")
        .order("criado_em", { ascending: false })
        .limit(40),
    ]);
    setAviso0045(!!(c.error || d.error));
    setCobrancas(((c.data ?? []) as CobrancaRow[]).map((r) => ({ ...r, valor: Number(r.valor) })));
    setDocumentos(
      ((d.data ?? []) as DocumentoRow[]).map((r) => ({
        ...r,
        dist_mesma_pessoa: r.dist_mesma_pessoa === null ? null : Number(r.dist_mesma_pessoa),
        dist_foto_documento: r.dist_foto_documento === null ? null : Number(r.dist_foto_documento),
      })),
    );
  }, []);

  const verDocumento = async (path: string) => {
    const { data, error } = await sb.storage.from("documentos-hospedes").createSignedUrl(path, 300);
    if (error || !data?.signedUrl) return toast.error(`Não foi possível abrir: ${error?.message ?? "sem link"}`);
    window.open(data.signedUrl, "_blank", "noopener");
  };

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const criar = async () => {
    if (!novoNome.trim()) return;
    setCriando(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await sb
      .from("totem_dispositivos")
      .insert({ nome: novoNome.trim(), unidade: novaUnidade, criado_por: auth.user?.id ?? null });
    setCriando(false);
    if (error) return toast.error(`Não foi possível cadastrar: ${error.message}`);
    setNovoNome("");
    toast.success("Totem cadastrado. Agora gere o código de pareamento.");
    void carregar();
  };

  const media = avaliacoes.length ? avaliacoes.reduce((s, a) => s + a.nota, 0) / avaliacoes.length : null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-black text-slate-900">Totem</h2>
        <p className="text-sm text-slate-500">
          Tablet da unidade para o hóspede fazer check-in (com senha da porta) e check-out sozinho. No tablet, abra{" "}
          <span className="font-mono">{typeof window !== "undefined" ? `${window.location.origin}/totem` : "/totem"}</span>.
        </p>
      </div>

      {erro && <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-800">{erro}</Card>}

      <Card className="space-y-3 p-4">
        <p className="font-bold text-slate-900">Cadastrar totem</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <Input placeholder="Nome (ex.: Totem da entrada)" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
          <div className="flex gap-1 rounded-md border p-1">
            {(["Ipanema", "Botafogo"] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setNovaUnidade(u)}
                className={`rounded px-3 text-sm font-semibold ${novaUnidade === u ? "bg-blue-900 text-white" : "text-slate-600"}`}
              >
                {u}
              </button>
            ))}
          </div>
          <Button onClick={criar} disabled={criando || !novoNome.trim()}>
            {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Cadastrar
          </Button>
        </div>
      </Card>

      {totens === null ? (
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {totens.map((t) => (
            <TotemCard key={t.id} totem={t} onMudou={carregar} />
          ))}
          {totens.length === 0 && !erro && <p className="text-sm text-slate-500">Nenhum totem cadastrado ainda.</p>}
        </div>
      )}

      {aviso0045 && (
        <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Pagamento na maquininha e fotos de identificação ainda não estão ativos: aplique no Lovable a migração
          drizzle/migrations/0045_totem_pagamento_documentos.sql (e, depois de criar o bucket privado
          "documentos-hospedes", a 0046_totem_documentos_storage_policies.sql).
        </Card>
      )}

      <section className="space-y-3">
        <h3 className="text-lg font-black text-slate-900">Pagamentos no totem</h3>
        <Card className="divide-y">
          {cobrancas.length === 0 && <p className="p-4 text-sm text-slate-500">Nenhum pagamento ainda.</p>}
          {cobrancas.map((c) => (
            <div key={c.id} className="grid gap-1 p-3 text-sm sm:grid-cols-[8rem_1fr_auto]">
              <span className="text-xs text-slate-500">{dataHora(c.criado_em)}</span>
              <div>
                <p className="font-semibold text-slate-900">
                  R$ {c.valor.toFixed(2).replace(".", ",")} · {c.metodo}
                  {c.bandeira ? ` ${c.bandeira}` : ""} · {c.hospede ?? "Hóspede"} · reserva {c.reservation_id}
                </p>
                {c.status === "pago" && !c.cloudbeds_lancado && (
                  <p className="text-red-700">Não lançado no Cloudbeds{c.cloudbeds_erro ? `: ${c.cloudbeds_erro}` : ""}. Lançar manualmente.</p>
                )}
              </div>
              <Badge variant={c.status === "pago" ? "default" : "secondary"}>{STATUS_COBRANCA[c.status] ?? c.status}</Badge>
            </div>
          ))}
        </Card>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-black text-slate-900">Fotos de identificação</h3>
        <p className="text-sm text-slate-500">
          Selfie com prova de vida e selfie segurando o documento. Os indícios abaixo são calculados no tablet; na dúvida, confira a foto.
        </p>
        <Card className="divide-y">
          {documentos.length === 0 && <p className="p-4 text-sm text-slate-500">Nenhuma foto ainda.</p>}
          {documentos.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div>
                <p className="font-semibold text-slate-900">
                  {d.hospede_nome} · {d.etapa === "rosto" ? "Selfie" : `Selfie com ${d.tipo_documento.toUpperCase()}`} {d.numero_documento ?? ""}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {conferenciaFoto(d).map((c) => (
                    <span
                      key={c.texto}
                      className={
                        c.ok === true
                          ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800"
                          : c.ok === false
                            ? "rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800"
                            : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600"
                      }
                    >
                      {c.texto}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-slate-500">
                  {d.unidade} · reserva {d.reservation_id} · {dataHora(d.criado_em)}
                  {d.cloudbeds_erro ? ` · não anexado no Cloudbeds: ${d.cloudbeds_erro}` : ""}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => void verDocumento(d.arquivo_path)}>
                Ver foto
              </Button>
            </div>
          ))}
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-lg font-black text-slate-900">Avaliações do check-out</h3>
          {media !== null && (
            <span className="flex items-center gap-1 text-sm font-bold text-slate-700">
              <Star className="h-4 w-4 fill-amber-400 text-amber-500" /> {media.toFixed(1)} · {avaliacoes.length} avaliações
            </span>
          )}
        </div>
        <Card className="divide-y">
          {avaliacoes.length === 0 && <p className="p-4 text-sm text-slate-500">Nenhuma avaliação ainda.</p>}
          {avaliacoes.map((a) => (
            <div key={a.id} className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm">
              <div>
                <p className="font-semibold text-slate-900">
                  {"★".repeat(a.nota)}
                  <span className="text-slate-300">{"★".repeat(5 - a.nota)}</span> {a.hospede ?? "Hóspede"} · quarto {a.quarto ?? "—"}
                </p>
                {a.comentario && <p className="mt-1 text-slate-600">{a.comentario}</p>}
              </div>
              <span className="text-xs text-slate-500">
                {a.unidade} · {dataHora(a.criado_em)}
              </span>
            </div>
          ))}
        </Card>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-black text-slate-900">Histórico do totem</h3>
        <Card className="divide-y">
          {eventos.length === 0 && <p className="p-4 text-sm text-slate-500">Nenhum uso registrado.</p>}
          {eventos.map((e) => (
            <div key={e.id} className="grid gap-1 p-3 text-sm sm:grid-cols-[8rem_1fr_auto]">
              <span className="text-xs text-slate-500">{dataHora(e.criado_em)}</span>
              <div>
                <p className="font-semibold text-slate-900">
                  {TIPOS[e.tipo] ?? e.tipo}
                  {e.quarto ? ` · quarto ${e.quarto}` : ""}
                  {e.hospede ? ` · ${e.hospede}` : ""}
                </p>
                {e.detalhe && (
                  <p className="text-slate-600">
                    {e.detalhe
                      .split(", ")
                      .map((d) => MOTIVOS[d] ?? d)
                      .join(", ")}
                  </p>
                )}
              </div>
              <span className="text-xs text-slate-500">{e.unidade}</span>
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}

function TotemCard({ totem, onMudou }: { totem: TotemRow; onMudou: () => void }) {
  const [form, setForm] = useState({
    hora_checkin: hhmm(totem.hora_checkin),
    hora_checkout: hhmm(totem.hora_checkout),
    exige_quarto_limpo: totem.exige_quarto_limpo,
    bloqueia_saldo_aberto: totem.bloqueia_saldo_aberto,
    telefone_suporte: totem.telefone_suporte ?? "",
    ativo: totem.ativo,
    modo: totem.modo ?? "ambos",
    pagamento_habilitado: totem.pagamento_habilitado ?? false,
    pos_serial: totem.pos_serial ?? "",
    pede_documentos: totem.pede_documentos ?? true,
    voz_ativa: totem.voz_ativa ?? true,
    impressora: totem.impressora ?? "nenhuma",
    wifi_rede: totem.wifi_rede ?? "",
    wifi_senha: totem.wifi_senha ?? "",
    mensagem_comprovante: totem.mensagem_comprovante ?? "",
  });
  const tem0045 = totem.pagamento_habilitado !== undefined;
  const [salvando, setSalvando] = useState(false);
  const [codigo, setCodigo] = useState<{ codigo: string; expira: string } | null>(null);
  const [gerando, setGerando] = useState(false);

  const salvar = async () => {
    setSalvando(true);
    const { data, error } = await sb
      .from("totem_dispositivos")
      .update(
        tem0045
          ? {
              ...form,
              telefone_suporte: form.telefone_suporte.trim() || null,
              pos_serial: form.pos_serial.trim() || null,
              wifi_rede: form.wifi_rede.trim() || null,
              wifi_senha: form.wifi_senha.trim() || null,
              mensagem_comprovante: form.mensagem_comprovante.trim() || null,
            }
          : {
              hora_checkin: form.hora_checkin,
              hora_checkout: form.hora_checkout,
              exige_quarto_limpo: form.exige_quarto_limpo,
              bloqueia_saldo_aberto: form.bloqueia_saldo_aberto,
              telefone_suporte: form.telefone_suporte.trim() || null,
              ativo: form.ativo,
              modo: form.modo,
            },
      )
      .eq("id", totem.id)
      .select("id");
    setSalvando(false);
    if (error) return toast.error(`Não foi possível salvar: ${error.message}`);
    if (!data?.length) return toast.error("Nada foi salvo: seu login não tem permissão de gestor.");
    toast.success("Regras do totem salvas.");
    onMudou();
  };

  const gerarCodigo = async () => {
    setGerando(true);
    const { data, error } = await sb.rpc("totem_gerar_pareamento", { p_totem: totem.id });
    setGerando(false);
    if (error) return toast.error(error.message);
    setCodigo(data as { codigo: string; expira: string });
  };

  const desconectar = async () => {
    const { data, error } = await sb.from("totem_dispositivos").update({ token_hash: null }).eq("id", totem.id).select("id");
    if (error) return toast.error(error.message);
    if (!data?.length) return toast.error("Nada foi alterado: sem permissão de gestor.");
    toast.success("Tablet desconectado. Ele vai pedir um novo código.");
    onMudou();
  };

  const conectado = !!totem.token_hash;

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-black text-slate-900">{totem.nome}</p>
          <p className="text-xs text-slate-500">
            {totem.unidade} · {MODOS.find((m) => m.id === totem.modo)?.rotulo ?? "Os dois"} · último uso {dataHora(totem.ultimo_uso)}
          </p>
        </div>
        <Badge variant={conectado && totem.ativo ? "default" : "secondary"}>
          {!totem.ativo ? "Desativado" : conectado ? "Tablet conectado" : "Sem tablet"}
        </Badge>
      </div>

      <div>
        <p className="mb-1 text-sm font-medium">Função deste tablet</p>
        <div className="grid grid-cols-3 gap-1 rounded-md border p-1">
          {MODOS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setForm({ ...form, modo: m.id })}
              className={`min-h-9 rounded px-2 text-sm font-semibold ${form.modo === m.id ? "bg-blue-900 text-white" : "text-slate-600"}`}
            >
              {m.rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`ci-${totem.id}`}>Check-in a partir de</Label>
          <Input id={`ci-${totem.id}`} type="time" value={form.hora_checkin} onChange={(e) => setForm({ ...form, hora_checkin: e.target.value })} />
        </div>
        <div>
          <Label htmlFor={`co-${totem.id}`}>Senha vale até (dia da saída)</Label>
          <Input id={`co-${totem.id}`} type="time" value={form.hora_checkout} onChange={(e) => setForm({ ...form, hora_checkout: e.target.value })} />
        </div>
      </div>
      <div>
        <Label htmlFor={`tel-${totem.id}`}>Telefone/WhatsApp mostrado ao hóspede quando precisar de ajuda</Label>
        <Input
          id={`tel-${totem.id}`}
          placeholder="(21) 9xxxx-xxxx"
          value={form.telefone_suporte}
          onChange={(e) => setForm({ ...form, telefone_suporte: e.target.value })}
        />
      </div>
      <div className="space-y-3">
        <Regra
          rotulo="Só libera a senha com o quarto Limpo"
          ajuda="Usa o status da tela Camareiras."
          valor={form.exige_quarto_limpo}
          onChange={(v) => setForm({ ...form, exige_quarto_limpo: v })}
        />
        <Regra
          rotulo="Bloqueia com saldo em aberto no Cloudbeds"
          ajuda="Vale para check-in e check-out."
          valor={form.bloqueia_saldo_aberto}
          onChange={(v) => setForm({ ...form, bloqueia_saldo_aberto: v })}
        />
        <Regra rotulo="Totem ativo" valor={form.ativo} onChange={(v) => setForm({ ...form, ativo: v })} />
      </div>

      {tem0045 && (
        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
          <p className="text-sm font-bold text-slate-900">Pagamento, documentos e comprovante</p>
          <Regra
            rotulo="Cobrar saldo na maquininha Stone"
            ajuda="Pagamento Direto (Connect 2.0). Precisa dos segredos da Pagar.me/Stone no Lovable."
            valor={form.pagamento_habilitado}
            onChange={(v) => setForm({ ...form, pagamento_habilitado: v })}
          />
          <div>
            <Label htmlFor={`pos-${totem.id}`}>Número de série da maquininha (S920 ou Q92)</Label>
            <Input id={`pos-${totem.id}`} value={form.pos_serial} onChange={(e) => setForm({ ...form, pos_serial: e.target.value })} />
          </div>
          <Regra
            rotulo="Pedir foto do documento de todos os adultos"
            ajuda="No check-in, antes de entregar a senha."
            valor={form.pede_documentos}
            onChange={(v) => setForm({ ...form, pede_documentos: v })}
          />
          <Regra
            rotulo="Voz guiando o hóspede"
            ajuda="Fala o passo a passo e as dicas da câmera no idioma escolhido. No Fully Kiosk, ligue a JavaScript Interface (PLUS)."
            valor={form.voz_ativa}
            onChange={(v) => setForm({ ...form, voz_ativa: v })}
          />
          <Regra
            rotulo="Imprimir comprovante (impressora térmica via RawBT)"
            valor={form.impressora === "rawbt"}
            onChange={(v) => setForm({ ...form, impressora: v ? "rawbt" : "nenhuma" })}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor={`wr-${totem.id}`}>Wi-Fi (rede)</Label>
              <Input id={`wr-${totem.id}`} value={form.wifi_rede} onChange={(e) => setForm({ ...form, wifi_rede: e.target.value })} />
            </div>
            <div>
              <Label htmlFor={`ws-${totem.id}`}>Wi-Fi (senha)</Label>
              <Input id={`ws-${totem.id}`} value={form.wifi_senha} onChange={(e) => setForm({ ...form, wifi_senha: e.target.value })} />
            </div>
          </div>
          <div>
            <Label htmlFor={`msg-${totem.id}`}>Mensagem no fim do comprovante</Label>
            <Input
              id={`msg-${totem.id}`}
              placeholder="Ex.: Café da manhã das 7h às 10h"
              value={form.mensagem_comprovante}
              onChange={(e) => setForm({ ...form, mensagem_comprovante: e.target.value })}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={salvar} disabled={salvando}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar regras
        </Button>
        <Button variant="outline" onClick={gerarCodigo} disabled={gerando || !totem.ativo}>
          {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Gerar código de pareamento
        </Button>
        {conectado && (
          <Button variant="ghost" onClick={desconectar}>
            <Unplug className="h-4 w-4" /> Desconectar tablet
          </Button>
        )}
      </div>

      {codigo && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs text-emerald-800">Digite no tablet (em /totem). Vale até {dataHora(codigo.expira)} e só funciona uma vez.</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono text-3xl font-black tracking-widest text-emerald-900">{codigo.codigo}</span>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Copiar código"
              onClick={() => navigator.clipboard?.writeText(codigo.codigo).then(() => toast.success("Copiado"))}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Regra({ rotulo, ajuda, valor, onChange }: { rotulo: string; ajuda?: string; valor: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span>
        <span className="block text-sm font-semibold text-slate-800">{rotulo}</span>
        {ajuda && <span className="block text-xs text-slate-500">{ajuda}</span>}
      </span>
      <Switch checked={valor} onCheckedChange={onChange} />
    </label>
  );
}
