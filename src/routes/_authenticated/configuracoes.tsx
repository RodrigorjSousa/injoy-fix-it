import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Trash2, UserPlus, Mail, CheckCircle2, AlertCircle, ShieldCheck, ShieldOff, Pencil, KeyRound, Eye, EyeOff, Copy, Wand2 } from "lucide-react";

function gerarSenha(len = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const cryptoObj = typeof crypto !== "undefined" ? crypto : undefined;
  if (cryptoObj?.getRandomValues) {
    const arr = new Uint32Array(len);
    cryptoObj.getRandomValues(arr);
    for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  } else {
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

async function copiarSenha(valor: string) {
  try {
    await navigator.clipboard.writeText(valor);
    toast.success("Senha copiada");
  } catch {
    toast.error("Não foi possível copiar");
  }
}
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { adminSetFuncionarioCredentials } from "@/lib/user-management.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";



import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CATEGORIAS,
  TELAS_PERMITIDAS,
  useAdicionarFuncionario,
  useAtualizarCategoriasFuncionario,
  useAtualizarNomeFuncionario,
  useAtualizarTelasFuncionario,
  useFuncionarios,
  useMe,
  useRemoverFuncionario,
  useUsuariosComRoles,
  useTornarGestor,
  useRemoverGestor,
  useAtribuirRole,
  useRemoverRole,
  type Categoria,
  type Funcionario,
  type TelaPermitida,
} from "@/lib/store";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: Configuracoes,
});

type TipoFuncionario = "tecnico" | "recepcao" | "camareira" | "gestor";

const LABEL_TIPO: Record<TipoFuncionario, string> = {
  tecnico: "Técnico",
  recepcao: "Recepção",
  camareira: "Camareira",
  gestor: "Gestor",
};

function Configuracoes() {
  const { data: me } = useMe();
  const { data: funcionarios = [] } = useFuncionarios();
  const { data: usuariosRoles = [] } = useUsuariosComRoles();
  const adicionar = useAdicionarFuncionario();
  const remover = useRemoverFuncionario();
  const atribuirRole = useAtribuirRole();

  const rolesByUser = useMemo(() => {
    const map = new Map<string, { recepcao: boolean; camareira: boolean }>();
    usuariosRoles.forEach((u) =>
      map.set(u.userId, { recepcao: u.isRecepcao, camareira: u.isCamareira }),
    );
    return map;
  }, [usuariosRoles]);

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senhaInicial, setSenhaInicial] = useState("");
  const [tipo, setTipo] = useState<TipoFuncionario>("tecnico");
  const [selecionadas, setSelecionadas] = useState<Categoria[]>([]);
  const [editando, setEditando] = useState<Funcionario | null>(null);
  const [alterandoSenha, setAlterandoSenha] = useState<Funcionario | null>(null);
  const setCredentials = useServerFn(adminSetFuncionarioCredentials);

  // Apenas gestores e administradores
  if (me && !me.isGestor && !me.isAdmin) return <Navigate to="/painel" replace />;

  const toggle = (c: Categoria) =>
    setSelecionadas((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const submitar = () => {
    if (!nome.trim() || !email.trim()) {
      toast.error("Preencha nome e email");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      toast.error("Email inválido");
      return;
    }
    if (senhaInicial && senhaInicial.length < 6) {
      toast.error("A senha deve ter ao menos 6 caracteres");
      return;
    }
    if (tipo === "tecnico" && selecionadas.length === 0) {
      toast.error("Selecione ao menos uma categoria para o técnico");
      return;
    }
    const emailNorm = email.toLowerCase().trim();
    adicionar.mutate(
      { nome: nome.trim(), email: email.trim(), categorias: tipo === "tecnico" ? selecionadas : [] },
      {
        onSuccess: async () => {
          const { data: funcRow } = await supabase
            .from("funcionarios")
            .select("id, user_id")
            .eq("email", emailNorm)
            .maybeSingle();
          const funcId = (funcRow as { id: string; user_id: string | null } | null)?.id;
          let userId = (funcRow as { id: string; user_id: string | null } | null)?.user_id ?? null;

          if (senhaInicial && funcId) {
            try {
              await setCredentials({ data: { funcionarioId: funcId, password: senhaInicial } });
              // refetch to get user_id
              const { data: refetched } = await supabase
                .from("funcionarios")
                .select("user_id")
                .eq("id", funcId)
                .maybeSingle();
              userId = (refetched as { user_id: string | null } | null)?.user_id ?? userId;
            } catch (e) {
              toast.error((e as Error).message);
            }
          }

          if (tipo !== "tecnico") {
            if (userId) {
              atribuirRole.mutate({ userId, role: tipo });
              toast.success(`${nome} cadastrado(a) como ${LABEL_TIPO[tipo]}`);
            } else {
              toast.success(`${nome} cadastrado(a)`, {
                description: `Quando criar conta com este email, atribua o perfil "${LABEL_TIPO[tipo]}" em Perfis de acesso.`,
              });
            }
          } else {
            toast.success(`${nome} cadastrado`, {
              description: senhaInicial
                ? "Senha definida. O funcionário já pode entrar."
                : "Quando criar conta com este email, será vinculado automaticamente.",
            });
          }
          setNome("");
          setEmail("");
          setSenhaInicial("");
          setTipo("tecnico");
          setSelecionadas([]);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <div className="space-y-8 max-w-3xl">
      <header>
        <Badge variant="secondary" className="mb-3 rounded-full">Configurações</Badge>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Equipe</h1>
        <p className="text-muted-foreground mt-1">
          Cadastre técnicos, recepcionistas e camareiras. Quando criarem conta com o mesmo email, recebem acesso automaticamente.
        </p>
      </header>

      <Card className="p-5 space-y-5">
        <div className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Novo membro da equipe</h2>
        </div>

        <div className="space-y-2">
          <Label>Função</Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {([
              { v: "tecnico", l: "Técnico" },
              { v: "recepcao", l: "Recepção" },
              { v: "camareira", l: "Camareira" },
              ...(me?.isAdmin ? [{ v: "gestor" as const, l: "Gestor" }] : []),
            ] as { v: TipoFuncionario; l: string }[]).map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setTipo(opt.v)}
                className={`rounded-lg border p-3 text-sm transition-colors ${
                  tipo === opt.v
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "bg-background hover:border-primary/40"
                }`}
              >
                {opt.l}
              </button>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Maria Silva" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email de acesso</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="maria@injoy.com.br"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="senha-inicial">Senha (opcional)</Label>
          <div className="flex gap-2">
            <Input
              id="senha-inicial"
              type="text"
              value={senhaInicial}
              onChange={(e) => setSenhaInicial(e.target.value)}
              placeholder="Deixe em branco para o funcionário definir no primeiro acesso"
              minLength={6}
              autoComplete="off"
              className="font-mono"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="Gerar senha"
              onClick={() => setSenhaInicial(gerarSenha())}
            >
              <Wand2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="Copiar senha"
              onClick={() => senhaInicial && copiarSenha(senhaInicial)}
              disabled={!senhaInicial}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Se preencher, o funcionário já pode entrar com esta senha. Anote ou copie antes de salvar — não é possível ver depois.
          </p>
        </div>

        {tipo === "tecnico" && (
          <div className="space-y-2">
            <Label>Categorias atendidas</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CATEGORIAS.map((c) => {
                const checked = selecionadas.includes(c);
                return (
                  <label
                    key={c}
                    className="flex items-center gap-2 rounded-lg border bg-background p-3 cursor-pointer hover:border-primary/40"
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggle(c)} />
                    <span className="text-sm">{c}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <Button onClick={submitar} className="w-full sm:w-auto" disabled={adicionar.isPending}>
          {adicionar.isPending ? "Salvando..." : "Cadastrar"}
        </Button>
      </Card>


      <section className="space-y-3">
        <h2 className="font-semibold text-lg">Funcionários cadastrados</h2>
        <div className="space-y-2">
          {funcionarios.map((f) => (
            <Card key={f.id} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{f.nome}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <Mail className="h-3 w-3" /> {f.email}
                  {f.userId ? (
                    <span className="ml-2 inline-flex items-center gap-1 text-success">
                      <CheckCircle2 className="h-3 w-3" /> Conta vinculada
                    </span>
                  ) : (
                    <span className="ml-2 inline-flex items-center gap-1 text-warning-foreground">
                      <AlertCircle className="h-3 w-3" /> Aguardando cadastro
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {f.categorias.map((c) => (
                    <Badge
                      key={c}
                      variant="secondary"
                      className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0 text-[11px] font-medium px-2.5 py-0.5"
                    >
                      {c}
                    </Badge>
                  ))}
                  {f.userId && rolesByUser.get(f.userId)?.camareira && (
                    <Badge
                      variant="secondary"
                      className="rounded-full bg-sky-100 text-sky-700 hover:bg-sky-100 border-0 text-[11px] font-medium px-2.5 py-0.5"
                    >
                      Camareira
                    </Badge>
                  )}
                  {f.userId && rolesByUser.get(f.userId)?.recepcao && (
                    <Badge
                      variant="secondary"
                      className="rounded-full bg-sky-100 text-sky-700 hover:bg-sky-100 border-0 text-[11px] font-medium px-2.5 py-0.5"
                    >
                      Recepção
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Alterar senha de ${f.nome}`}
                  onClick={() => setAlterandoSenha(f)}
                >
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Editar funções de ${f.nome}`}
                  onClick={() => setEditando(f)}
                >
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover ${f.nome}`}
                  onClick={() => {
                    if (confirm(`Remover ${f.nome}?`)) {
                      remover.mutate(f.id, {
                        onSuccess: () => toast.success("Funcionário removido"),
                        onError: (e) => toast.error(e.message),
                      });
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </Card>
          ))}
          {funcionarios.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum funcionário cadastrado.</p>
          )}
        </div>
      </section>

      <SenhaResetTurno />

      <SenhaAlmoxarifado />

      {me?.isAdmin && <GestoresAdmin />}

      <EditarFuncoesDialog
        funcionario={editando}
        onClose={() => setEditando(null)}
      />

      <AlterarSenhaDialog
        funcionario={alterandoSenha}
        onClose={() => setAlterandoSenha(null)}
      />
    </div>
  );
}

function AlterarSenhaDialog({
  funcionario,
  onClose,
}: {
  funcionario: Funcionario | null;
  onClose: () => void;
}) {
  const setCredentials = useServerFn(adminSetFuncionarioCredentials);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedPassword, setSavedPassword] = useState<string | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);

  if (funcionario && funcionario.id !== lastId) {
    setLastId(funcionario.id);
    setEmail(funcionario.email);
    setPassword("");
    setSavedPassword(null);
    setShowPassword(true);
  }
  if (!funcionario && lastId !== null) setLastId(null);

  const salvar = async () => {
    if (!funcionario) return;
    const emailNorm = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(emailNorm)) {
      toast.error("Email inválido");
      return;
    }
    if (password.length < 6) {
      toast.error("A senha deve ter ao menos 6 caracteres");
      return;
    }
    setSaving(true);
    try {
      await setCredentials({
        data: {
          funcionarioId: funcionario.id,
          password,
          email: emailNorm !== funcionario.email ? emailNorm : undefined,
        },
      });
      toast.success("Credenciais atualizadas");
      setSavedPassword(password);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!funcionario} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Credenciais de {funcionario?.nome ?? ""}</DialogTitle>
        </DialogHeader>

        {savedPassword ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
              <p className="text-sm font-medium">Senha definida com sucesso</p>
              <p className="text-xs text-muted-foreground">
                Copie e envie ao funcionário agora. Depois de fechar esta janela, a senha não poderá mais ser recuperada.
              </p>
              <div className="flex items-center gap-2 rounded-md bg-background border p-2">
                <code className="flex-1 font-mono text-sm select-all break-all">{savedPassword}</code>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => copiarSenha(savedPassword)}
                  title="Copiar"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={onClose}>Fechar</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="senha-email">Email de acesso</Label>
                <Input
                  id="senha-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="senha-nova">Nova senha</Label>
                <div className="flex gap-2">
                  <Input
                    id="senha-nova"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="Mínimo 6 caracteres"
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title={showPassword ? "Ocultar" : "Mostrar"}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Gerar senha"
                    onClick={() => {
                      setPassword(gerarSenha());
                      setShowPassword(true);
                    }}
                  >
                    <Wand2 className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Copiar"
                    onClick={() => password && copiarSenha(password)}
                    disabled={!password}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {funcionario?.userId
                    ? "A nova senha substituirá a atual. Anote antes de salvar — não é possível ver depois."
                    : "Ao definir a senha, a conta do funcionário será criada."}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={salvar} disabled={saving || !password}>
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SenhaResetTurno() {
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("app_settings" as never)
        .select("value")
        .eq("key", "reset_turno_password")
        .maybeSingle();
      if (!error) setSenha(((data as { value?: string } | null)?.value) ?? "");
      setCarregando(false);
    })();
  }, []);

  const salvar = async () => {
    if (!senha.trim()) {
      toast.error("A senha não pode ficar vazia");
      return;
    }
    setSalvando(true);
    const { error } = await supabase
      .from("app_settings" as never)
      .upsert({ key: "reset_turno_password", value: senha, updated_at: new Date().toISOString() } as never);
    setSalvando(false);
    if (error) {
      toast.error("Falha ao salvar senha: " + error.message);
      return;
    }
    toast.success("Senha atualizada");
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Senha para Resetar Serviços do Turno</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Essa senha é pedida às camareiras/recepção ao usar o botão “Resetar Serviços do Turno”.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="Digite a nova senha"
          disabled={carregando}
          className="flex-1"
        />
        <Button onClick={salvar} disabled={carregando || salvando}>
          {salvando ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </Card>
  );
}

function SenhaAlmoxarifado() {
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mostrar, setMostrar] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("app_settings" as never)
        .select("value")
        .eq("key", "almox_password")
        .maybeSingle();
      if (!error) setSenha(((data as { value?: string } | null)?.value) ?? "");
      setCarregando(false);
    })();
  }, []);

  const salvar = async () => {
    if (!senha.trim()) {
      toast.error("A senha não pode ficar vazia");
      return;
    }
    setSalvando(true);
    const { error } = await supabase
      .from("app_settings" as never)
      .upsert({ key: "almox_password", value: senha, updated_at: new Date().toISOString() } as never);
    setSalvando(false);
    if (error) {
      toast.error("Falha ao salvar senha: " + error.message);
      return;
    }
    try {
      sessionStorage.removeItem("almox_unlocked_v1");
    } catch {
      // ignore
    }
    toast.success("Senha do Almoxarifado atualizada");
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Senha do Almoxarifado</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Essa senha protege o acesso às áreas de Inventário, Solicitações, Auditoria, Histórico, Setores, Relatório e Novo Item do Almoxarifado. A aba Compras permanece livre.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Input
            type={mostrar ? "text" : "password"}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Digite a nova senha"
            disabled={carregando}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setMostrar((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={mostrar ? "Ocultar senha" : "Mostrar senha"}
          >
            {mostrar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <Button onClick={salvar} disabled={carregando || salvando}>
          {salvando ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </Card>
  );
}




function EditarFuncoesDialog({
  funcionario,
  onClose,
}: {
  funcionario: Funcionario | null;
  onClose: () => void;
}) {
  const { data: me } = useMe();
  const atualizar = useAtualizarCategoriasFuncionario();
  const atualizarNome = useAtualizarNomeFuncionario();
  const atualizarTelas = useAtualizarTelasFuncionario();
  const atribuirRole = useAtribuirRole();
  const removerRole = useRemoverRole();
  const tornarGestor = useTornarGestor();
  const removerGestor = useRemoverGestor();
  const { data: usuariosRoles = [] } = useUsuariosComRoles();

  const currentRoles = useMemo(() => {
    if (!funcionario?.userId)
      return { recepcao: false, camareira: false, gestor: false, tecnico: false };
    const u = usuariosRoles.find((x) => x.userId === funcionario.userId);
    return {
      recepcao: !!u?.isRecepcao,
      camareira: !!u?.isCamareira,
      gestor: !!u?.isGestor,
      tecnico: !!u?.isFuncionario,
    };
  }, [funcionario, usuariosRoles]);

  const [nome, setNome] = useState("");
  const [sel, setSel] = useState<Categoria[]>([]);
  const [rolCamareira, setRolCamareira] = useState(false);
  const [rolRecepcao, setRolRecepcao] = useState(false);
  const [rolGestor, setRolGestor] = useState(false);
  const [rolTecnico, setRolTecnico] = useState(false);
  const [telasCustom, setTelasCustom] = useState(false);
  const [telas, setTelas] = useState<TelaPermitida[]>([]);

  const initialCategorias = useMemo(() => funcionario?.categorias ?? [], [funcionario]);
  const initialNome = funcionario?.nome ?? "";
  const initialTelas = useMemo(() => funcionario?.telasPermitidas ?? null, [funcionario]);

  // Sync state when opening a new funcionario
  const [lastId, setLastId] = useState<string | null>(null);
  if (funcionario && funcionario.id !== lastId) {
    setLastId(funcionario.id);
    setNome(funcionario.nome);
    setSel(funcionario.categorias);
    setRolCamareira(currentRoles.camareira);
    setRolRecepcao(currentRoles.recepcao);
    setRolGestor(currentRoles.gestor);
    setRolTecnico(currentRoles.tecnico);
    setTelasCustom(Array.isArray(funcionario.telasPermitidas));
    setTelas(funcionario.telasPermitidas ?? []);
  }
  if (!funcionario && lastId !== null) {
    setLastId(null);
  }

  const nomeChanged = nome.trim() !== initialNome.trim() && nome.trim().length > 0;
  const categoriasChanged =
    sel.length !== initialCategorias.length ||
    sel.some((c) => !initialCategorias.includes(c)) ||
    initialCategorias.some((c) => !sel.includes(c));
  const rolesChanged =
    rolCamareira !== currentRoles.camareira ||
    rolRecepcao !== currentRoles.recepcao ||
    rolGestor !== currentRoles.gestor ||
    rolTecnico !== currentRoles.tecnico;
  const desiredTelas: TelaPermitida[] | null = telasCustom ? telas : null;
  const telasChanged = (() => {
    const a = initialTelas;
    const b = desiredTelas;
    if (a === null && b === null) return false;
    if (a === null || b === null) return true;
    if (a.length !== b.length) return true;
    return a.some((t) => !b.includes(t)) || b.some((t) => !a.includes(t));
  })();
  const changed = nomeChanged || categoriasChanged || rolesChanged || telasChanged;

  const toggle = (c: Categoria) =>
    setSel((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  const toggleTela = (t: TelaPermitida) =>
    setTelas((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const salvar = async () => {
    if (!funcionario) return;
    try {
      if (nomeChanged) {
        await atualizarNome.mutateAsync({
          id: funcionario.id,
          nome: nome.trim(),
          userId: funcionario.userId,
        });
      }
      if (categoriasChanged) {
        await atualizar.mutateAsync({ id: funcionario.id, categorias: sel });
      }
      if (telasChanged) {
        await atualizarTelas.mutateAsync({ id: funcionario.id, telas: desiredTelas });
      }
      if (rolesChanged && funcionario.userId) {
        if (rolCamareira !== currentRoles.camareira) {
          if (rolCamareira) {
            await atribuirRole.mutateAsync({ userId: funcionario.userId, role: "camareira" });
          } else {
            await removerRole.mutateAsync({ userId: funcionario.userId, role: "camareira" });
          }
        }
        if (rolRecepcao !== currentRoles.recepcao) {
          if (rolRecepcao) {
            await atribuirRole.mutateAsync({ userId: funcionario.userId, role: "recepcao" });
          } else {
            await removerRole.mutateAsync({ userId: funcionario.userId, role: "recepcao" });
          }
        }
        if (rolTecnico !== currentRoles.tecnico) {
          if (rolTecnico) {
            await atribuirRole.mutateAsync({ userId: funcionario.userId, role: "funcionario" });
          } else {
            await removerRole.mutateAsync({ userId: funcionario.userId, role: "funcionario" });
          }
        }
        if (rolGestor !== currentRoles.gestor) {
          if (rolGestor) {
            await tornarGestor.mutateAsync(funcionario.userId);
          } else {
            await removerGestor.mutateAsync(funcionario.userId);
          }
        }
      }
      toast.success("Cadastro atualizado");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const saving =
    atualizar.isPending ||
    atualizarNome.isPending ||
    atualizarTelas.isPending ||
    atribuirRole.isPending ||
    removerRole.isPending ||
    tornarGestor.isPending ||
    removerGestor.isPending;
  const rolesDisabled = !funcionario?.userId;
  const gestorDisabled = rolesDisabled || !me?.isAdmin;

  return (
    <Dialog open={!!funcionario} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar {funcionario?.nome ?? ""}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-nome">Nome</Label>
            <Input
              id="edit-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome completo"
            />
          </div>

          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
              Categorias técnicas
            </div>
            <div className="flex flex-wrap gap-2">
              {CATEGORIAS.map((c) => {
                const active = sel.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggle(c)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      active
                        ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                        : "bg-background hover:border-primary/40"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
              Perfil de acesso
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={rolesDisabled}
                onClick={() => setRolTecnico((v) => !v)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  rolTecnico
                    ? "bg-sky-100 text-sky-700 border-sky-200"
                    : "bg-background hover:border-primary/40"
                }`}
              >
                Técnico
              </button>
              <button
                type="button"
                disabled={rolesDisabled}
                onClick={() => setRolCamareira((v) => !v)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  rolCamareira
                    ? "bg-sky-100 text-sky-700 border-sky-200"
                    : "bg-background hover:border-primary/40"
                }`}
              >
                Camareira
              </button>
              <button
                type="button"
                disabled={rolesDisabled}
                onClick={() => setRolRecepcao((v) => !v)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  rolRecepcao
                    ? "bg-sky-100 text-sky-700 border-sky-200"
                    : "bg-background hover:border-primary/40"
                }`}
              >
                Recepção
              </button>
              <button
                type="button"
                disabled={gestorDisabled}
                onClick={() => setRolGestor((v) => !v)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  rolGestor
                    ? "bg-sky-100 text-sky-700 border-sky-200"
                    : "bg-background hover:border-primary/40"
                }`}
                title={!me?.isAdmin ? "Apenas administradores podem alterar este perfil" : undefined}
              >
                Gestor
              </button>
            </div>
            {rolesDisabled && (
              <p className="text-xs text-muted-foreground mt-2">
                O funcionário ainda não criou conta. Perfis de acesso ficam disponíveis após o primeiro login.
              </p>
            )}
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Telas disponíveis
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {telasCustom
                    ? "Selecione manualmente as abas que este funcionário verá."
                    : "Usando o padrão do perfil de acesso."}
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox
                  checked={telasCustom}
                  onCheckedChange={(v) => {
                    const on = v === true;
                    setTelasCustom(on);
                    if (on && telas.length === 0) setTelas(initialTelas ?? []);
                  }}
                />
                <span>Personalizar</span>
              </label>
            </div>
            {telasCustom && (
              <div className="flex flex-wrap gap-2">
                {TELAS_PERMITIDAS.map((t) => {
                  const active = telas.includes(t.key);
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => toggleTela(t.key)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                        active
                          ? "bg-indigo-100 text-indigo-700 border-indigo-200"
                          : "bg-background hover:border-primary/40"
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>


        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={!changed || saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}




function GestoresAdmin() {
  const { data: usuarios = [], isLoading } = useUsuariosComRoles();
  const tornar = useTornarGestor();
  const remover = useRemoverGestor();

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h2 className="font-semibold text-lg">Gestores (administrador)</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Promova ou remova gestores do sistema. Administradores não aparecem nesta lista.
      </p>
      <div className="space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {usuarios
          .filter((u) => !u.isAdmin)
          .map((u) => (
            <Card key={u.userId} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{u.nome}</div>
                <div className="mt-1">
                  {u.isGestor ? (
                    <Badge className="text-[10px]">Gestor</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">Funcionário</Badge>
                  )}
                </div>
              </div>
              {u.isGestor ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    remover.mutate(u.userId, {
                      onSuccess: () => toast.success(`${u.nome} não é mais gestor`),
                      onError: (e) => toast.error(e.message),
                    })
                  }
                  disabled={remover.isPending}
                >
                  <ShieldOff className="h-4 w-4 mr-1" /> Remover gestor
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() =>
                    tornar.mutate(u.userId, {
                      onSuccess: () => toast.success(`${u.nome} agora é gestor`),
                      onError: (e) => toast.error(e.message),
                    })
                  }
                  disabled={tornar.isPending}
                >
                  <ShieldCheck className="h-4 w-4 mr-1" /> Tornar gestor
                </Button>
              )}
            </Card>
          ))}
        {!isLoading && usuarios.filter((u) => !u.isAdmin).length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhum usuário cadastrado.</p>
        )}
      </div>
    </section>
  );
}
