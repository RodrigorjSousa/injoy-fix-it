import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, CheckCircle2, Heart, Loader2, Star, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/image-compression";
import { cn } from "@/lib/utils";
import {
  calcularNota,
  STATUS_ITEM,
  useInvalidarAvaliacoes,
  useItensAvaliacao,
  type ItemAvaliado,
  type StatusItem,
} from "@/lib/avaliacao-arrumacao";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type Servico = {
  id: string;
  camareira_name: string;
  task_name: string | null;
  ended_at: string | null;
  created_at: string;
};
type Marcacao = { status: StatusItem; obs: string; foto: File | null; preview: string | null };

const OUTRA = "__outra";
const horaBR = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
const corNota = (n: number) =>
  n >= 9 ? "text-emerald-700" : n >= 7 ? "text-amber-700" : "text-rose-700";

/** Líder das camareiras avalia a arrumação feita no quarto (checklist OK / Ajustar / Refazer). */
export function AvaliarArrumacaoModal({
  open,
  onClose,
  property,
  roomNumber,
  avaliadoraNome,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  property: "Botafogo" | "Ipanema";
  roomNumber: string;
  avaliadoraNome: string;
  userId: string;
}) {
  const invalidar = useInvalidarAvaliacoes();
  const itensQ = useItensAvaliacao();
  const servicosQ = useQuery({
    queryKey: ["avaliar_servicos", property, roomNumber],
    enabled: open,
    queryFn: async () => {
      const desde = new Date(Date.now() - 3 * 86_400_000).toISOString();
      const [{ data: s }, { data: nomes }, { data: ult }] = await Promise.all([
        db
          .from("room_housekeeping_history")
          .select("id, camareira_name, task_name, ended_at, created_at")
          .eq("property", property)
          .eq("room_number", roomNumber)
          .gte("created_at", desde)
          .order("created_at", { ascending: false })
          .limit(5),
        db
          .from("room_housekeeping_history")
          .select("camareira_name")
          .eq("property", property)
          .gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
          .limit(500),
        db
          .from("avaliacoes_arrumacao")
          .select("id, nota, camareira_nome, avaliadora_nome, created_at, refazer")
          .eq("property", property)
          .eq("room_number", roomNumber)
          .order("created_at", { ascending: false })
          .limit(3),
      ]);
      const camareiras = [
        ...new Set(
          ((nomes ?? []) as { camareira_name: string }[])
            .map((n) => n.camareira_name?.trim())
            .filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b, "pt-BR"));
      return {
        servicos: (s ?? []) as Servico[],
        camareiras,
        ultimas: (ult ?? []) as {
          id: string;
          nota: number;
          camareira_nome: string;
          avaliadora_nome: string | null;
          created_at: string;
          refazer: boolean;
        }[],
      };
    },
  });

  const [servicoId, setServicoId] = useState<string>("");
  const [outraNome, setOutraNome] = useState("");
  const [marc, setMarc] = useState<Record<string, Marcacao>>({});
  const [elogio, setElogio] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);
  const [fotoPara, setFotoPara] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      Object.values(marc).forEach((m) => m.preview && URL.revokeObjectURL(m.preview));
      setServicoId("");
      setOutraNome("");
      setMarc({});
      setElogio("");
      setObs("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    const primeiro = servicosQ.data?.servicos[0];
    if (open && !servicoId) setServicoId(primeiro ? primeiro.id : OUTRA);
  }, [open, servicoId, servicosQ.data]);

  const itens = itensQ.data ?? [];
  const servico = servicosQ.data?.servicos.find((s) => s.id === servicoId) ?? null;
  const camareira = servicoId === OUTRA ? outraNome.trim() : (servico?.camareira_name ?? "");
  const marcados: ItemAvaliado[] = itens
    .filter((i) => marc[i.id])
    .map((i) => ({
      item_id: i.id,
      nome: i.nome,
      status: marc[i.id].status,
      obs: marc[i.id].obs.trim() || null,
      foto_path: null,
    }));
  const nota = calcularNota(marcados);
  const faltando = itens.filter((i) => !marc[i.id]).length;
  const semDescricao = itens.filter(
    (i) => marc[i.id] && marc[i.id].status !== "ok" && marc[i.id].obs.trim().length < 3,
  );
  const semFoto = itens.filter((i) => marc[i.id]?.status === "refazer" && !marc[i.id].foto);
  const podeSalvar =
    !!camareira &&
    itens.length > 0 &&
    faltando === 0 &&
    !semDescricao.length &&
    !semFoto.length &&
    !salvando;

  const marcar = (id: string, status: StatusItem) =>
    setMarc((m) => ({
      ...m,
      [id]: {
        status,
        obs: m[id]?.obs ?? "",
        foto: m[id]?.foto ?? null,
        preview: m[id]?.preview ?? null,
      },
    }));
  const todosOk = () =>
    setMarc((m) =>
      Object.fromEntries(
        itens.map((i) => [
          i.id,
          m[i.id]?.status && m[i.id].status !== "ok"
            ? m[i.id]
            : { status: "ok" as StatusItem, obs: "", foto: null, preview: null },
        ]),
      ),
    );

  const escolherFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !fotoPara) return;
    try {
      const c = await compressImage(f);
      const id = fotoPara;
      setMarc((m) => {
        if (m[id]?.preview) URL.revokeObjectURL(m[id].preview as string);
        return { ...m, [id]: { ...m[id], foto: c, preview: URL.createObjectURL(c) } };
      });
    } catch {
      toast.error("Não foi possível usar a foto.");
    }
  };

  const salvar = async () => {
    if (!podeSalvar) return;
    setSalvando(true);
    try {
      const comFoto = await Promise.all(
        marcados.map(async (m, idx) => {
          const f = marc[m.item_id].foto;
          if (!f) return m;
          const ext = f.name.split(".").pop()?.toLowerCase() || "jpg";
          const path = `avaliacoes/${property}/${roomNumber.replace(/\s+/g, "_")}/${Date.now()}-${idx}.${ext}`;
          const { error } = await supabase.storage
            .from("inspections")
            .upload(path, f, { contentType: f.type, upsert: false });
          if (error) throw new Error(`Foto de ${m.nome}: ${error.message}`);
          return { ...m, foto_path: path };
        }),
      );
      const refazer = comFoto.some((m) => m.status === "refazer");
      const { error } = await db.from("avaliacoes_arrumacao").insert({
        property,
        room_number: roomNumber,
        servico_id: servico?.id ?? null,
        tarefa: servico?.task_name ?? null,
        servico_concluido_em: servico?.ended_at ?? null,
        camareira_nome: camareira,
        avaliadora_id: userId,
        avaliadora_nome: avaliadoraNome,
        nota,
        itens: comFoto,
        refazer,
        elogio: elogio.trim() || null,
        observacao: obs.trim() || null,
      });
      if (error) throw new Error(error.message);
      toast.success(
        refazer
          ? `Avaliação salva (nota ${nota?.toFixed(1)}). ${camareira} foi avisada para refazer.`
          : `Avaliação salva: nota ${nota?.toFixed(1)} para ${camareira}.`,
      );
      invalidar();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a avaliação.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-500" /> Avaliar arrumação · {roomNumber}
          </DialogTitle>
          <DialogDescription>
            {property} · avaliando como {avaliadoraNome}
          </DialogDescription>
        </DialogHeader>

        {itensQ.data === null && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            A avaliação ainda não está ativa (falta aplicar a migração 0098). Avise o gestor.
          </p>
        )}
        {(itensQ.isLoading || servicosQ.isLoading) && (
          <div className="grid place-items-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        )}
        {itensQ.error && <p className="text-sm text-rose-700">{(itensQ.error as Error).message}</p>}

        {itensQ.data && servicosQ.data && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm font-bold">Arrumação de quem?</p>
              <div className="space-y-1.5">
                {servicosQ.data.servicos.map((s) => (
                  <label
                    key={s.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm",
                      servicoId === s.id ? "border-amber-400 bg-amber-50" : "border-slate-200",
                    )}
                  >
                    <input
                      type="radio"
                      checked={servicoId === s.id}
                      onChange={() => setServicoId(s.id)}
                    />
                    <span className="flex-1">
                      <strong>{s.camareira_name}</strong> · {s.task_name ?? "Serviço"}
                      <span className="block text-[11px] text-slate-500">
                        concluído {horaBR(s.ended_at ?? s.created_at)}
                      </span>
                    </span>
                  </label>
                ))}
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm",
                    servicoId === OUTRA ? "border-amber-400 bg-amber-50" : "border-slate-200",
                  )}
                >
                  <input
                    type="radio"
                    checked={servicoId === OUTRA}
                    onChange={() => setServicoId(OUTRA)}
                  />
                  <span>
                    {servicosQ.data.servicos.length
                      ? "Outra camareira"
                      : "Sem serviço registrado: escolha a camareira"}
                  </span>
                </label>
                {servicoId === OUTRA && (
                  <>
                    <Input
                      list="avaliar-camareiras"
                      placeholder="Nome da camareira"
                      value={outraNome}
                      onChange={(e) => setOutraNome(e.target.value)}
                    />
                    <datalist id="avaliar-camareiras">
                      {servicosQ.data.camareiras.map((n) => (
                        <option key={n} value={n} />
                      ))}
                    </datalist>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">Checklist</p>
              <button
                type="button"
                onClick={todosOk}
                className="text-xs font-semibold text-emerald-700 hover:underline"
              >
                Marcar o resto como OK
              </button>
            </div>
            <ul className="space-y-2">
              {itens.map((i) => {
                const m = marc[i.id];
                return (
                  <li key={i.id} className="rounded-lg border p-2.5">
                    <p className="text-sm font-semibold">{i.nome}</p>
                    {i.descricao && <p className="text-[11px] text-slate-500">{i.descricao}</p>}
                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                      {(["ok", "ajustar", "refazer"] as StatusItem[]).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => marcar(i.id, st)}
                          className={cn(
                            "rounded-lg border-2 py-2 text-xs font-bold transition",
                            m?.status === st
                              ? st === "ok"
                                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                                : st === "ajustar"
                                  ? "border-amber-500 bg-amber-50 text-amber-700"
                                  : "border-rose-500 bg-rose-50 text-rose-700"
                              : "border-slate-200 text-slate-600",
                          )}
                        >
                          {st === "ok" ? "✅ " : st === "ajustar" ? "⚠️ " : "❌ "}
                          {STATUS_ITEM[st].rotulo}
                        </button>
                      ))}
                    </div>
                    {m && m.status !== "ok" && (
                      <div className="mt-2 space-y-1.5">
                        <Input
                          placeholder="O que estava errado? (ex.: cabelo no box)"
                          value={m.obs}
                          onChange={(e) =>
                            setMarc((x) => ({ ...x, [i.id]: { ...x[i.id], obs: e.target.value } }))
                          }
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setFotoPara(i.id);
                              fotoRef.current?.click();
                            }}
                          >
                            <Camera className="mr-1 h-4 w-4" />
                            {m.foto
                              ? "Trocar foto"
                              : m.status === "refazer"
                                ? "Foto (obrigatória)"
                                : "Foto (opcional)"}
                          </Button>
                          {m.preview && (
                            <span className="relative">
                              <img
                                src={m.preview}
                                alt=""
                                className="h-10 w-10 rounded object-cover"
                              />
                              <button
                                type="button"
                                className="absolute -right-1 -top-1 rounded-full bg-rose-600 p-0.5 text-white"
                                onClick={() =>
                                  setMarc((x) => ({
                                    ...x,
                                    [i.id]: { ...x[i.id], foto: null, preview: null },
                                  }))
                                }
                                aria-label="Tirar foto"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <input
              ref={fotoRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={escolherFoto}
            />

            <div className="space-y-1.5">
              <p className="flex items-center gap-1 text-sm font-bold">
                <Heart className="h-4 w-4 text-rose-500" /> Elogio (opcional)
              </p>
              <Input
                placeholder="Ex.: banheiro impecável, cama perfeita"
                value={elogio}
                onChange={(e) => setElogio(e.target.value)}
              />
              <Textarea
                rows={2}
                placeholder="Observação ou orientação para a camareira (opcional)"
                value={obs}
                onChange={(e) => setObs(e.target.value)}
              />
            </div>

            <div className="sticky bottom-0 -mx-6 space-y-2 border-t bg-white px-6 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">
                  {faltando > 0
                    ? `Faltam ${faltando} item(ns)`
                    : semDescricao.length
                      ? "Descreva os erros"
                      : semFoto.length
                        ? "Falta foto no Refazer"
                        : "Pronto para salvar"}
                </span>
                <span
                  className={cn(
                    "text-2xl font-black",
                    nota == null ? "text-slate-400" : corNota(nota),
                  )}
                >
                  {nota == null ? "—" : nota.toFixed(1)}
                </span>
              </div>
              <Button
                className="w-full bg-amber-500 font-bold text-white hover:bg-amber-600"
                disabled={!podeSalvar}
                onClick={salvar}
              >
                {salvando ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                )}
                Salvar avaliação
              </Button>
            </div>

            {servicosQ.data.ultimas.length > 0 && (
              <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                <p className="mb-1 font-semibold">Últimas avaliações deste quarto</p>
                {servicosQ.data.ultimas.map((u) => (
                  <p key={u.id}>
                    {horaBR(u.created_at)} · {u.camareira_nome} ·{" "}
                    <strong className={corNota(Number(u.nota))}>{Number(u.nota).toFixed(1)}</strong>
                    {u.refazer ? " · refazer" : ""}
                    {u.avaliadora_nome ? ` (por ${u.avaliadora_nome})` : ""}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
