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
} from "@/lib/push-client";
import { cn } from "@/lib/utils";

type Props = { className?: string; compact?: boolean };

export function PushNotificationsButton({ className, compact }: Props) {
  const [supported] = useState(() => isPushSupported());
  const [preview] = useState(() => isPreviewContext());
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supported) return;
    isCurrentlySubscribed().then(setSubscribed);
  }, [supported]);

  if (!supported) return null;

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
          toast.success("Notificações ativadas");
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
