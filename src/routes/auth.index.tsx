import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/boas-vindas", replace: true });
    });
  }, [navigate]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: "/boas-vindas", replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao autenticar";
      toast.error(
        /invalid/i.test(msg)
          ? "E-mail ou senha inválidos. Somente usuários cadastrados pelo gestor podem acessar."
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
            <p className="text-xs text-muted-foreground">Acesso restrito aos funcionários</p>
          </div>
        </div>

        <form onSubmit={handleEmail} className="space-y-3">
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
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            Entrar
          </Button>
        </form>

        <p className="text-xs text-muted-foreground text-center">
          Somente contas cadastradas previamente pelo gestor podem acessar o sistema.
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
