import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TuyaDevice } from "@/lib/tuya-devices";
import { fimDaSenha, lerLinhas, type LinhaSenha } from "@/lib/senhas-existentes";

// Troca dos teclados dos portões (Tuya → TTLock) sem afetar quem já está hospedado:
// a recepção cola a lista "quarto senha saída [nome]" com as senhas criadas no app
// da Tuya, e cada senha é cadastrada IGUAL nos dois teclados TTLock, valendo até o
// check-out. Inclui teclados TTLock desligados no cadastro (ainda na bancada), para
// carregar as senhas ANTES de trocar os teclados. Fica registrada em "Senhas ativas"
// e a limpeza automática apaga quando vence.

type Resultado = { linha: LinhaSenha; porTeclado: Array<{ label: string; ok: boolean; msg?: string }> };

const hojeSP = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

export function SenhasExistentesTTLock({ unidade }: { unidade: string }) {
  const [teclados, setTeclados] = useState<TuyaDevice[] | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [resultados, setResultados] = useState<Resultado[]>([]);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from("tuya_devices").select("*").eq("unidade", unidade);
    if (error) return toast.error("Erro ao carregar fechaduras: " + error.message);
    setTeclados(((data ?? []) as TuyaDevice[]).filter((d) => d.fornecedor === "ttlock" && d.tipo !== "quarto"));
  }, [unidade]);

  useEffect(() => {
    void carregar();
    setResultados([]);
  }, [carregar]);

  const lidas = useMemo(() => lerLinhas(texto, hojeSP()), [texto]);

  const cadastrar = async () => {
    if (!teclados?.length) return toast.error("Nenhum teclado TTLock cadastrado nesta unidade.");
    if (!lidas.ok.length) return toast.error("Nenhuma linha válida.");
    if (lidas.erros.length) return toast.error("Corrija as linhas com erro antes de cadastrar.");
    setEnviando(true);
    setProgresso(0);
    setResultados([]);
    const { data: userData } = await supabase.auth.getUser();
    const feitos: Resultado[] = [];
    for (const linha of lidas.ok) {
      const fim = fimDaSenha(linha.saida);
      let porTeclado: Resultado["porTeclado"];
      try {
        const { data, error } = await supabase.functions.invoke("tuya-password", {
          body: {
            deviceIds: teclados.map((t) => t.device_id),
            guestName: linha.nome || "Hospede",
            startTime: Date.now(),
            endTime: fim,
            roomNumber: linha.quarto,
            unidade,
            senha: linha.senha,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(String(data.error));
        const senhas: Record<string, string> = data?.senhas ?? {};
        const senhaIds: Record<string, string | number> = data?.senhaIds ?? {};
        const results: Array<{ deviceId: string; status?: { msg?: string; code?: number } }> = data?.tuyaResults ?? [];
        porTeclado = teclados.map((t) => {
          const ok = senhas[t.device_id] === linha.senha;
          const r = results.find((x) => x.deviceId === t.device_id);
          return { label: t.label, ok, msg: ok ? undefined : (r?.status?.msg ?? "sem resposta") };
        });
        const aceitos = teclados.filter((t) => senhas[t.device_id] === linha.senha).map((t) => t.device_id);
        if (aceitos.length) {
          await supabase.from("tuya_password_logs").insert({
            room_number: linha.quarto,
            guest_name: linha.nome || "Hóspede (senha do app Tuya)",
            password: aceitos.map((id) => `${id}:${linha.senha}`).join(" | "),
            entrada: new Date().toISOString(),
            saida: new Date(fim).toISOString(),
            device_ids: aceitos,
            senha_ids: Object.fromEntries(aceitos.map((id) => [id, senhaIds[id]])),
            unidade,
            generated_by_user_id: userData?.user?.id ?? null,
            generated_by_name: `Troca dos teclados (senha do app Tuya) · ${userData?.user?.email ?? "gestor"}`,
          });
        }
      } catch (e) {
        porTeclado = teclados.map((t) => ({ label: t.label, ok: false, msg: (e as Error).message }));
      }
      feitos.push({ linha, porTeclado });
      setResultados([...feitos]);
      setProgresso(feitos.length);
    }
    setEnviando(false);
    const falhas = feitos.filter((f) => f.porTeclado.some((p) => !p.ok)).length;
    if (falhas) toast.warning(`${feitos.length - falhas}/${feitos.length} senhas cadastradas nos dois teclados.`);
    else toast.success(`${feitos.length} senhas cadastradas nos teclados TTLock.`);
  };

  return (
    <section className="max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-3 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm">
          <ArrowRightLeft className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-black text-slate-900">Passar senhas dos hóspedes para os portões TTLock</p>
          <p className="text-xs text-slate-500">
            Para trocar os teclados sem afetar quem já está no hotel. Faça antes de tirar os teclados antigos.
          </p>
        </div>
      </header>

      <p className="mb-2 text-xs text-slate-600">
        Uma linha por hóspede, com <b>quarto, senha e data de saída</b> (o nome é opcional). A senha é a mesma que ele já
        usa (do app da Tuya) e vale nos dois teclados TTLock até 12h do dia da saída.
      </p>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={6}
        placeholder={"113 482913 22/11 Maria\n006 731205 20/11\n118 905114 25/11 John"}
        className="w-full rounded-xl border border-slate-300 p-3 font-mono text-sm"
        disabled={enviando}
      />

      <div className="mt-2 text-xs text-slate-600">
        Teclados TTLock:{" "}
        {teclados === null ? "carregando..." : teclados.length ? teclados.map((t) => `${t.label}${t.ativo ? "" : " (desligado)"}`).join(", ") : "nenhum cadastrado"}
      </div>

      {lidas.erros.length > 0 && (
        <ul className="mt-2 space-y-1 rounded-xl bg-rose-50 p-3 text-xs text-rose-800">
          {lidas.erros.map((e) => (
            <li key={e.linha}>
              Linha {e.linha} ({e.texto}): {e.erro}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => void cadastrar()}
        disabled={enviando || !lidas.ok.length || lidas.erros.length > 0 || !teclados?.length}
        className="mt-3 inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50"
      >
        {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
        {enviando ? `Cadastrando ${progresso}/${lidas.ok.length}...` : `Cadastrar ${lidas.ok.length} senha(s) nos teclados TTLock`}
      </button>

      {resultados.length > 0 && (
        <ul className="mt-4 space-y-2">
          {resultados.map((r) => (
            <li key={r.linha.linha} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <div className="font-semibold text-slate-800">
                Quarto {r.linha.quarto} · {r.linha.senha}# · até {r.linha.saida.split("-").reverse().join("/")}
                {r.linha.nome ? ` · ${r.linha.nome}` : ""}
              </div>
              {r.porTeclado.map((p) => (
                <div key={p.label} className={`flex items-center gap-1 text-xs ${p.ok ? "text-emerald-700" : "text-rose-700"}`}>
                  {p.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                  {p.label}
                  {p.msg ? `: ${p.msg}` : ""}
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
