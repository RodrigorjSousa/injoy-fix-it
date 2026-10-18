import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import {
  currentPermission,
  disablePushNotifications,
  enablePushNotifications,
  isCurrentlySubscribed,
  isPreviewContext,
  isPushSupported,
  sincronizarAparelho,
} from "@/lib/push-client";
import { enviarNotificacaoTeste } from "@/lib/push.functions";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Props = { className?: string; compact?: boolean };

export function PushNotificationsButton({ className, compact }: Props) {
  const [supported, setSupported] = useState(false);
  const [preview, setPreview] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const nextSupported = isPushSupported();
    setSupported(nextSupported);
    setPreview(isPreviewContext());
    setHydrated(true);
    if (!nextSupported) return;
    // Ao abrir o app (e a cada novo login), confirma que ESTE aparelho avisa QUEM está logado.
    // Só fica verde quando o banco tem o aparelho gravado para esta pessoa.
    const conferir = () =>
      sincronizarAparelho()
        .then((ok) => (ok ? true : isCurrentlySubscribed()))
        .then(setSubscribed);
    void conferir();
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_IN") void conferir();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!hydrated || !supported) return null;

  const handle = async () => {
    setLoading(true);
    try {
      if (subscribed) {
        await disablePushNotifications();
        setSubscribed(false);
        toast.success("Notificações desativadas");
      } else {
        const res = await enablePushNotifications();
        if (res.ok) {
          setSubscribed(true);
          // Aviso de teste pelo mesmo caminho dos chamados: confirma que vai chegar.
          const teste = await enviarNotificacaoTeste().catch(() => null);
          if (teste?.ok) toast.success("Notificações ativadas. Enviamos um aviso de teste para este aparelho.");
          else
            toast.warning(
              `Notificações ativadas, mas o teste não chegou${teste?.motivo ? `: ${teste.motivo}` : "."} Avise o gestor.`,
            );
        } else {
          toast.error(res.reason);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const perm = currentPermission();
  const disabled =
    loading || preview || perm === "denied";

  const label = subscribed ? "Notificações ativas" : "Ativar notificações";
  const title = preview
    ? "Disponível apenas no app publicado"
    : perm === "denied"
      ? "Permissão bloqueada pelo navegador"
      : label;

  return (
    <button
      type="button"
      onClick={handle}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors",
        subscribed
          ? "border-emerald-500/40 bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20"
          : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
    >
      {subscribed ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
      {!compact && <span>{label}</span>}
    </button>
  );
}
