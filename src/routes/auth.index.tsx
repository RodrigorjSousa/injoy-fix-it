import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { firstTimeSetPassword } from "@/lib/user-management.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Wrench } from "lucide-react";
import injoyLogo from "@/assets/injoy-logo.png.asset.json";

export const Route = createFileRoute("/auth/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — Manutenção INJOY" },
      { name: "description", content: "Acesso restrito aos funcionários da INJOY Hotéis." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "first">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const setInitialPassword = useServerFn(firstTimeSetPassword);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/boas-vindas", replace: true });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "first") {
        if (password.length < 6) throw new Error("A senha deve ter ao menos 6 caracteres");
        if (password !== confirmPassword) throw new Error("As senhas não coincidem");
        await setInitialPassword({ data: { email, password } });
        toast.success("Senha cadastrada. Entrando...");
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/boas-vindas", replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao autenticar";
      toast.error(
        mode === "signin" && /invalid/i.test(msg)
          ? "E-mail ou senha inválidos. Se é seu primeiro acesso, use 'Primeiro acesso'."
          : msg,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen grid place-items-center bg-background px-4 overflow-hidden">
      <img
        src={injoyLogo.url}
        alt=""
        className="pointer-events-none absolute inset-0 m-auto h-[60vh] w-[60vh] object-contain opacity-[0.04] select-none"
      />
      <Card className="w-full max-w-md p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-primary text-primary-foreground grid place-items-center">
            <Wrench className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-semibold text-lg leading-tight">Manutenção INJOY</h1>
            <p className="text-xs text-muted-foreground">
              {mode === "first" ? "Cadastre sua senha de acesso" : "Acesso restrito aos funcionários"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`rounded-md py-1.5 transition-colors ${
              mode === "signin" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setMode("first")}
            className={`rounded-md py-1.5 transition-colors ${
              mode === "first" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
            }`}
          >
            Primeiro acesso
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">
              {mode === "first" ? "Crie uma senha" : "Senha"}
            </Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "first" ? "new-password" : "current-password"}
            />
          </div>
          {mode === "first" && (
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirmar senha</Label>
              <Input
                id="confirm"
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {mode === "first" ? "Cadastrar senha e entrar" : "Entrar"}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground text-center">
          {mode === "first"
            ? "Seu email precisa estar previamente cadastrado pelo gestor."
            : "Somente contas cadastradas previamente pelo gestor podem acessar."}
        </p>

        <Link
          to="/auth/admin"
          className="flex items-center justify-center gap-2 text-sm font-medium text-primary hover:text-primary/80 w-full text-center border-t pt-4"
        >
          Acesso administrador
        </Link>
      </Card>
    </div>
  );
}
