import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, FlaskConical, Loader2, RefreshCw, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TuyaDevice } from "@/lib/tuya-devices";

// Senha de teste para o gestor: a MESMA senha de 6 dígitos vai para as
// fechaduras escolhidas, sejam teclados TTLock (portões) ou fechaduras Tuya
// (quartos, projeto 1 ou 2). Serve para conferir na porta que a integração
// funciona antes de liberar o totem. Inclui fechaduras desligadas no cadastro
// (ex.: portão TTLock ainda em bancada). Fica registrada em "Senhas ativas",
// de onde também pode ser revogada, e a limpeza automática apaga quando vence.

const VALIDADES = [
  { rotulo: "30 minutos", ms: 30 * 60_000 },
  { rotulo: "2 horas", ms: 2 * 3600_000 },
  { rotulo: "24 horas", ms: 24 * 3600_000 },
];

type Resultado = {
  senha: string | null;
  porAparelho: Array<{ device: TuyaDevice; ok: boolean; msg?: string }>;
  senhaIds: Record<string, string | number>;
  logId: string | null;
  validaAte: Date;
};

const marca = (d: TuyaDevice) =>
  d.fornecedor === "ttlock" ? "TTLock" : d.fornecedor === "manual" ? "Senha fixa" : d.tuya_projeto === 2 ? "Tuya 2" : "Tuya 1";

export function SenhaTesteFechaduras({ unidade }: { unidade: string }) {
  const [devices, setDevices] = useState<TuyaDevice[] | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [validade, setValidade] = useState(VALIDADES[0].ms);
  const [gerando, setGerando] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const carregar = useCallback(async () => {
    // "*": colunas novas (fornecedor, tuya_projeto) sem quebrar se faltar migração.
    const { data, error } = await supabase.from("tuya_devices").select("*").eq("unidade", unidade);
    if (error) return toast.error("Erro ao carregar fechaduras: " + error.message);
    const lista = ((data ?? []) as TuyaDevice[]).sort(
      (a, b) =>
        Number(a.tipo === "quarto") - Number(b.tipo === "quarto") ||
        (a.room_number ?? a.label).localeCompare(b.room_number ?? b.label, "pt-BR", {
          numeric: true,
        }),
    );
    setDevices(lista);
    setSelecionados(new Set());
  }, [unidade]);

  useEffect(() => {
    void carregar();
    setResultado(null);
  }, [carregar]);

  const grupos = useMemo(() => {
    const l = devices ?? [];
    return [
      { titulo: "Portões e portas compartilhadas", itens: l.filter((d) => d.tipo !== "quarto") },
      { titulo: "Quartos", itens: l.filter((d) => d.tipo === "quarto") },
    ].filter((g) => g.itens.length);
  }, [devices]);

  const alternar = (id: string) =>
    setSelecionados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const gerar = async () => {
    const escolhidos = (devices ?? []).filter((d) => selecionados.has(d.device_id));
    if (!escolhidos.length) return toast.error("Escolha pelo menos uma fechadura.");
    setGerando(true);
    setResultado(null);
    const inicio = Date.now();
    const fim = inicio + validade;
    try {
      const { data, error } = await supabase.functions.invoke("tuya-password", {
        body: {
          deviceIds: escolhidos.map((d) => d.device_id),
          guestName: "Teste Gestao",
          startTime: inicio,
          endTime: fim,
          roomNumber: "TESTE",
          unidade,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      const senhas: Record<string, string> = data?.senhas ?? {};
      const senhaIds: Record<string, string | number> = data?.senhaIds ?? {};
      const results: Array<{
        deviceId: string;
        status?: { success?: boolean; msg?: string; code?: number };
      }> = data?.tuyaResults ?? [];
      const porAparelho = escolhidos.map((d) => {
        const r = results.find((x) => x.deviceId === d.device_id);
        const ok = !!senhas[d.device_id];
        const msg = ok
          ? senhaIds[d.device_id] === "senha_fixa"
            ? "senha fixa do cadastro (não é a de teste)"
            : undefined
          : (r?.status?.msg ?? (r?.status?.code ? `code ${r.status.code}` : "sem resposta"));
        return { device: d, ok, msg };
      });
      // A senha de teste é a gerada agora (não a senha fixa de algum portão antigo).
      const senha =
        Object.entries(senhas).find(([id]) => senhaIds[id] !== "senha_fixa")?.[1] ?? null;

      // Registra como as outras senhas: aparece em "Senhas ativas" e a limpeza automática apaga quando vencer.
      let logId: string | null = null;
      if (senha) {
        const { data: userData } = await supabase.auth.getUser();
        const { data: log } = await supabase
          .from("tuya_password_logs")
          .insert({
            room_number: "TESTE",
            guest_name: "Teste Gestão",
            password: Object.entries(senhas)
              .map(([id, p]) => `${id}:${p}`)
              .join(" | "),
            entrada: new Date(inicio).toISOString(),
            saida: new Date(fim).toISOString(),
            device_ids: escolhidos.map((d) => d.device_id),
            senha_ids: senhaIds,
            unidade,
            generated_by_user_id: userData?.user?.id ?? null,
            generated_by_name: `Teste gestão (${userData?.user?.email ?? "gestor"})`,
          })
          .select("id")
          .maybeSingle();
        logId = log?.id ?? null;
      }
      setResultado({ senha, porAparelho, senhaIds, logId, validaAte: new Date(fim) });
      const ok = porAparelho.filter((p) => p.ok).length;
      if (!senha) toast.error("Nenhuma fechadura aceitou a senha.");
      else if (ok < porAparelho.length)
        toast.warning(`${ok}/${porAparelho.length} fechaduras aceitaram a senha.`);
      else toast.success("Todas as fechaduras aceitaram a senha.");
    } catch (e) {
      toast.error("Erro ao gerar a senha de teste: " + (e as Error).message);
    } finally {
      setGerando(false);
    }
  };

  const apagar = async () => {
    if (!resultado) return;
    setApagando(true);
    try {
      const items = Object.entries(resultado.senhaIds)
        .filter(([, pid]) => pid && String(pid) !== "senha_fixa")
        .map(([deviceId, passwordId]) => ({ deviceId, passwordId }));
      if (items.length) {
        const { data, error } = await supabase.functions.invoke("tuya-password", {
          body: { action: "revoke", items, roomNumber: "TESTE", unidade },
        });
        if (error) throw error;
        if (
          Array.isArray(data?.revokes) &&
          data.revokes.some((r: { success: boolean }) => !r.success)
        )
          toast.warning("Alguma fechadura não confirmou. Veja em Senhas ativas.");
      }
      if (resultado.logId)
        await supabase
          .from("tuya_password_logs")
          .update({
            revoked_at: new Date().toISOString(),
            revoked_by_name: "gestor",
            revoke_reason: "manual:teste",
          })
          .eq("id", resultado.logId);
      toast.success("Senha de teste apagada das fechaduras.");
      setResultado(null);
    } catch (e) {
      toast.error("Falha ao apagar: " + (e as Error).message);
    } finally {
      setApagando(false);
    }
  };

  return (
    <section className="max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
            <FlaskConical className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-black text-slate-900">Senha de teste · TTLock + Tuya</p>
            <p className="text-xs text-slate-500">
              A mesma senha nas fechaduras escolhidas, para conferir na porta.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void carregar()}
          className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
          title="Recarregar fechaduras"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </header>

      {devices === null ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando fechaduras…
        </p>
      ) : devices.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma fechadura cadastrada em {unidade}.</p>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={() => setSelecionados(new Set(devices.map((d) => d.device_id)))}
              className="rounded-md border border-slate-200 px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50"
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() =>
                setSelecionados(new Set(devices.filter((d) => d.ativo).map((d) => d.device_id)))
              }
              className="rounded-md border border-slate-200 px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50"
            >
              Só as ativas
            </button>
            <button
              type="button"
              onClick={() => setSelecionados(new Set())}
              className="rounded-md border border-slate-200 px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50"
            >
              Nenhuma
            </button>
          </div>
          <div className="max-h-72 space-y-3 overflow-y-auto rounded-xl border border-slate-100 p-3">
            {grupos.map((g) => (
              <div key={g.titulo}>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {g.titulo}
                </p>
                <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {g.itens.map((d) => (
                    <li key={d.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={selecionados.has(d.device_id)}
                          onChange={() => alternar(d.device_id)}
                          className="h-4 w-4 accent-indigo-600"
                        />
                        <span className="min-w-0 flex-1 truncate">{d.label}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            d.fornecedor === "ttlock"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-orange-50 text-orange-700"
                          }`}
                        >
                          {marca(d)}
                        </span>
                        {!d.ativo && (
                          <span className="text-[10px] font-semibold text-slate-400">
                            desligada
                          </span>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="text-xs font-semibold text-slate-600">
              Validade{" "}
              <select
                value={validade}
                onChange={(e) => setValidade(Number(e.target.value))}
                className="ml-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              >
                {VALIDADES.map((v) => (
                  <option key={v.ms} value={v.ms}>
                    {v.rotulo}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void gerar()}
              disabled={gerando || !selecionados.size}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {gerando && <Loader2 className="h-4 w-4 animate-spin" />}
              Gerar senha de teste ({selecionados.size})
            </button>
          </div>
        </>
      )}

      {resultado && (
        <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
          {resultado.senha ? (
            <>
              <p className="text-xs font-semibold text-indigo-700">Senha de teste</p>
              <p className="font-mono text-4xl font-black tracking-[0.2em] text-indigo-900">
                {resultado.senha}
                <span className="text-indigo-400">#</span>
              </p>
              <p className="mt-1 text-xs text-indigo-700">
                Digite e aperte # no final. Válida até{" "}
                {resultado.validaAte.toLocaleString("pt-BR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
                . Nas fechaduras Tuya pode levar até 2 minutos para valer.
              </p>
            </>
          ) : (
            <p className="text-sm font-semibold text-red-700">Nenhuma fechadura aceitou a senha.</p>
          )}
          <ul className="mt-3 space-y-1 text-sm">
            {resultado.porAparelho.map(({ device, ok, msg }) => (
              <li key={device.device_id} className="flex items-start gap-2">
                {ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                )}
                <span>
                  <strong>{device.label}</strong>{" "}
                  <span className="text-xs text-slate-500">({marca(device)})</span>
                  {msg && <span className="block text-xs text-slate-600">{msg}</span>}
                </span>
              </li>
            ))}
          </ul>
          {resultado.senha && (
            <button
              type="button"
              onClick={() => void apagar()}
              disabled={apagando}
              className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              {apagando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Apagar a senha de teste agora
            </button>
          )}
        </div>
      )}
    </section>
  );
}
