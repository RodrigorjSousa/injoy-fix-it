import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BedDouble,
  Camera,
  CheckCircle2,
  Loader2,
  Send,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIAS, type Categoria, type Unidade } from "@/lib/store";
import { cn } from "@/lib/utils";
import { compressImage } from "@/lib/image-compression";

const FALLBACK_CHECKLIST_ITEMS = [
  "Ar condicionado testado e gelando",
  "Enxoval completo e cama montada",
  "Banheiro higienizado e com papel/toalhas",
  "Quarto cheiroso e sem poeira",
  "Controle remoto e TV funcionando",
];

type ChecklistState = Record<string, boolean>;
type IssueTeam = "camareira" | "manutencao";
type InspectionIssue = {
  id: string;
  team: IssueTeam;
  description: string;
  responsible_name: string;
  created_at: string;
};
type Technician = { id: string; nome: string; categorias: string[] | null };

interface VistoriaModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  unidade: Unidade;
  roomNumber: string;
}

export function VistoriaModal({
  open,
  onClose,
  onSuccess,
  unidade,
  roomNumber,
}: VistoriaModalProps) {
  const [items, setItems] = useState<string[]>(FALLBACK_CHECKLIST_ITEMS);
  const [checklist, setChecklist] = useState<ChecklistState>(() =>
    Object.fromEntries(FALLBACK_CHECKLIST_ITEMS.map((item) => [item, false])),
  );
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [openIssues, setOpenIssues] = useState<InspectionIssue[]>([]);
  const [hasIssue, setHasIssue] = useState<boolean | null>(null);
  const [team, setTeam] = useState<IssueTeam | null>(null);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Categoria | null>(null);
  const [technicianId, setTechnicianId] = useState<string | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [savingIssue, setSavingIssue] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadIssues = useCallback(async () => {
    if (!open) return;
    setLoadingIssues(true);
    const { data, error } = await supabase
      .from("room_inspection_issues")
      .select("id, team, description, responsible_name, created_at")
      .eq("property", unidade)
      .eq("room_number", roomNumber)
      .eq("status", "open")
      .order("created_at", { ascending: true });
    setLoadingIssues(false);
    if (error) {
      toast.error("Não foi possível verificar as pendências do quarto");
      return;
    }
    const issues = (data ?? []) as InspectionIssue[];
    setOpenIssues(issues);
    if (issues.length > 0) setHasIssue(true);
  }, [open, roomNumber, unidade]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const [{ data: checklistData, error: checklistError }, { data: technicianData }] =
        await Promise.all([
          supabase
            .from("vistoria_checklist_items")
            .select("item_name, sort_order")
            .order("sort_order", { ascending: true }),
          supabase.rpc("list_tecnicos"),
        ]);
      if (cancelled) return;
      const list =
        !checklistError && checklistData && checklistData.length > 0
          ? checklistData.map((row) => row.item_name)
          : FALLBACK_CHECKLIST_ITEMS;
      setItems(list);
      setChecklist(Object.fromEntries(list.map((item) => [item, false])));
      setTechnicians((technicianData ?? []) as Technician[]);
    })();
    setFile(null);
    setHasIssue(null);
    setTeam(null);
    setDescription("");
    setCategory(null);
    setTechnicianId(null);
    void loadIssues();
    return () => {
      cancelled = true;
    };
  }, [loadIssues, open]);

  useEffect(() => {
    if (!open) return;
    const channel = supabase
      .channel(`vistoria-pendencias-${unidade}-${roomNumber}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_inspection_issues" },
        () => void loadIssues(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadIssues, open, roomNumber, unidade]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!open) return null;

  const eligibleTechnicians = technicians.filter((technician) =>
    category
      ? (technician.categorias ?? []).some(
          (item) => item.trim().toLowerCase() === category.trim().toLowerCase(),
        )
      : false,
  );
  const allChecked = items.length > 0 && items.every((item) => checklist[item]);
  const issueDecisionComplete = hasIssue === false || (hasIssue === true && openIssues.length === 0);
  const canSubmit =
    allChecked && !!file && issueDecisionComplete && !enviando && !loadingIssues;
  const canCreateIssue =
    !!team &&
    description.trim().length >= 4 &&
    (team === "camareira" || (!!category && !!technicianId)) &&
    !savingIssue;

  const toggleItem = (item: string) =>
    setChecklist((previous) => ({ ...previous, [item]: !previous[item] }));

  const createIssue = async () => {
    if (!canCreateIssue || !team) return;
    setSavingIssue(true);
    const args =
      team === "manutencao"
        ? {
            _property: unidade,
            _room_number: roomNumber,
            _team: team,
            _description: description.trim(),
            _category: category ?? undefined,
            _responsible_id: technicianId ?? undefined,
          }
        : {
            _property: unidade,
            _room_number: roomNumber,
            _team: team,
            _description: description.trim(),
          };
    const { error } = await supabase.rpc("open_room_inspection_issue", args);
    setSavingIssue(false);
    if (error) {
      toast.error(error.message || "Não foi possível chamar o responsável");
      return;
    }
    toast.success(
      team === "camareira"
        ? "Camareiras avisadas imediatamente"
        : "Chamado urgente enviado ao técnico",
    );
    setDescription("");
    setTeam(null);
    setCategory(null);
    setTechnicianId(null);
    await loadIssues();
  };

  const resolveIssue = async (issueId: string) => {
    setResolvingId(issueId);
    const { error } = await supabase.rpc("resolve_room_inspection_issue", {
      _issue_id: issueId,
    });
    setResolvingId(null);
    if (error) {
      toast.error(error.message || "Não foi possível resolver a pendência");
      return;
    }
    toast.success("Pendência resolvida. Termine o checklist para liberar o quarto.");
    await loadIssues();
  };

  const handleSubmit = async () => {
    if (!canSubmit || !file) return;
    setEnviando(true);
    try {
      const { data: freshIssues, error: issueError } = await supabase
        .from("room_inspection_issues")
        .select("id")
        .eq("property", unidade)
        .eq("room_number", roomNumber)
        .eq("status", "open")
        .limit(1);
      if (issueError) throw issueError;
      if ((freshIssues ?? []).length > 0) {
        await loadIssues();
        throw new Error("Resolva a pendência antes de liberar o quarto");
      }

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      let inspectorName = "Recepção";
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("nome")
          .eq("id", user.id)
          .maybeSingle();
        inspectorName = profile?.nome || user.email || "Recepção";
      }

      const compressed = await compressImage(file);
      const ext = compressed.name.split(".").pop()?.toLowerCase() || "jpg";
      const safeRoom = roomNumber.replace(/\s+/g, "_");
      const path = `${unidade}/${safeRoom}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("inspections")
        .upload(path, compressed, {
          cacheControl: "3600",
          upsert: false,
          contentType: compressed.type,
        });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from("inspections").getPublicUrl(path);
      const { error: inspectionError } = await supabase.from("room_inspections").insert({
        property: unidade,
        room_number: roomNumber,
        inspector_name: inspectorName,
        inspector_id: user?.id ?? null,
        checklist,
        photo_url: publicUrlData.publicUrl,
      });
      if (inspectionError) throw inspectionError;

      const { error: roomError } = await supabase
        .from("room_housekeeping")
        .update({
          status: "clean",
          assigned_task: "VERIFICAÇÃO",
          updated_at: new Date().toISOString(),
        })
        .eq("property", unidade)
        .eq("room_number", roomNumber);
      if (roomError) throw roomError;

      toast.success(`Quarto ${roomNumber} vistoriado e liberado`);
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error("[vistoria] erro:", error);
      toast.error(error instanceof Error ? error.message : "Falha ao salvar vistoria");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[95vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:max-w-lg sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Vistoria Preventiva
            </p>
            <h3 className="text-base font-black text-slate-900">Quarto {roomNumber}</h3>
            <p className="text-xs text-slate-500">INJOY {unidade}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </Button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <section className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Checklist obrigatório
            </p>
            {items.map((item) => {
              const checked = checklist[item];
              return (
                <label
                  key={item}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors",
                    checked
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-slate-200 bg-slate-50 hover:bg-slate-100",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleItem(item)}
                    className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span
                    className={cn(
                      "text-sm font-medium",
                      checked ? "text-emerald-800" : "text-slate-700",
                    )}
                  >
                    {item}
                  </span>
                </label>
              );
            })}
          </section>

          <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
              <div>
                <p className="text-sm font-black text-amber-950">Existe alguma pendência?</p>
                <p className="text-xs text-amber-800">
                  Chame o responsável imediatamente antes de concluir a vistoria.
                </p>
              </div>
            </div>

            {loadingIssues ? (
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-800">
                <Loader2 className="h-4 w-4 animate-spin" /> Verificando pendências...
              </div>
            ) : openIssues.length > 0 ? (
              <div className="space-y-2">
                {openIssues.map((issue) => (
                  <div key={issue.id} className="rounded-lg border border-red-200 bg-white p-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-red-800">
                      {issue.team === "camareira" ? (
                        <BedDouble className="h-4 w-4" />
                      ) : (
                        <Wrench className="h-4 w-4" />
                      )}
                      {issue.team === "camareira" ? "Camareira" : "Manutenção"}
                    </div>
                    <p className="mt-1 text-sm text-slate-800">{issue.description}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Responsável: {issue.responsible_name} · {new Date(issue.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <Button
                      type="button"
                      className="mt-3 w-full bg-emerald-600 text-white hover:bg-emerald-700"
                      onClick={() => void resolveIssue(issue.id)}
                      disabled={resolvingId === issue.id}
                    >
                      {resolvingId === issue.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Pendência resolvida
                    </Button>
                  </div>
                ))}
                <p className="text-center text-xs font-bold text-red-700">
                  O quarto não pode ser liberado enquanto houver pendência aberta.
                </p>
              </div>
            ) : hasIssue === null ? (
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={() => setHasIssue(false)}>
                  Não, está tudo certo
                </Button>
                <Button type="button" variant="destructive" onClick={() => setHasIssue(true)}>
                  Sim, há pendência
                </Button>
              </div>
            ) : hasIssue === false ? (
              <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-white p-2.5">
                <span className="flex items-center gap-2 text-sm font-bold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Sem pendências
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setHasIssue(true)}>
                  Corrigir
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={team === "camareira" ? "default" : "outline"}
                    onClick={() => {
                      setTeam("camareira");
                      setCategory(null);
                      setTechnicianId(null);
                    }}
                  >
                    <BedDouble className="h-4 w-4" /> Camareira
                  </Button>
                  <Button
                    type="button"
                    variant={team === "manutencao" ? "default" : "outline"}
                    onClick={() => setTeam("manutencao")}
                  >
                    <Wrench className="h-4 w-4" /> Manutenção
                  </Button>
                </div>

                {team === "manutencao" && (
                  <>
                    <Select
                      value={category ?? undefined}
                      onValueChange={(value) => {
                        setCategory(value as Categoria);
                        setTechnicianId(null);
                      }}
                    >
                      <SelectTrigger className="bg-white">
                        <SelectValue placeholder="Categoria do problema" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIAS.map((item) => (
                          <SelectItem key={item} value={item}>{item}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {category && (
                      <Select value={technicianId ?? undefined} onValueChange={setTechnicianId}>
                        <SelectTrigger className="bg-white">
                          <SelectValue placeholder="Técnico responsável" />
                        </SelectTrigger>
                        <SelectContent>
                          {eligibleTechnicians.map((technician) => (
                            <SelectItem key={technician.id} value={technician.id}>
                              {technician.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {category && eligibleTechnicians.length === 0 && (
                      <p className="text-xs font-semibold text-red-700">
                        Nenhum técnico cadastrado para esta categoria.
                      </p>
                    )}
                  </>
                )}

                {team && (
                  <Textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Descreva o que precisa ser resolvido antes de liberar o quarto"
                    className="min-h-20 bg-white"
                  />
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setHasIssue(null);
                      setTeam(null);
                    }}
                  >
                    Voltar
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    className="flex-1"
                    disabled={!canCreateIssue}
                    onClick={() => void createIssue()}
                  >
                    {savingIssue ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Chamar agora
                  </Button>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Anexar Foto do Quarto
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            {previewUrl ? (
              <div className="relative">
                <img
                  src={previewUrl}
                  alt="Prévia da vistoria"
                  className="h-56 w-full rounded-xl border border-slate-200 object-cover"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="absolute right-2 top-2"
                  onClick={() => {
                    setFile(null);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                >
                  Trocar foto
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => inputRef.current?.click()}
                className="h-auto w-full flex-col gap-2 border-dashed py-8 text-slate-500"
              >
                <Camera size={28} />
                <span className="text-sm font-semibold">Tirar foto ou escolher da galeria</span>
                <span className="text-[11px] text-slate-400">
                  Foto obrigatória para liberar o quarto
                </span>
              </Button>
            )}
          </section>
        </div>

        <div className="border-t border-slate-100 p-4">
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="h-12 w-full bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700"
          >
            {enviando ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
            ) : (
              <><CheckCircle2 className="h-4 w-4" /> Salvar e Liberar Quarto</>
            )}
          </Button>
          {!issueDecisionComplete && (
            <p className="mt-2 text-center text-[11px] font-semibold text-red-600">
              Confirme se há pendência e resolva qualquer problema antes de liberar.
            </p>
          )}
          {issueDecisionComplete && (!allChecked || !file) && (
            <p className="mt-2 text-center text-[11px] text-slate-500">
              Marque todos os itens do checklist e anexe uma foto.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}