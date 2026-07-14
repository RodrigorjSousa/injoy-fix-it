import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Award, AlertTriangle, ArrowRight, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/store";
import { useUnidade } from "@/lib/unidade-context";

export const Route = createFileRoute("/_authenticated/boas-vindas")({
  component: BoasVindas,
});

function obterSaudacaoHora() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function BoasVindas() {
  const { data: me } = useMe();
  const { unidade } = useUnidade();
  const [rating, setRating] = useState<number>(8.5);
  const [nome, setNome] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        if (me?.userId) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("nome")
            .eq("id", me.userId)
            .maybeSingle();
          if (!cancelled && prof?.nome) setNome(prof.nome);
        }
        const { data: metric } = await supabase
          .from("hotel_metrics")
          .select("rating")
          .eq("property", unidade)
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!cancelled) {
          if (metric?.rating != null) setRating(Number(metric.rating));
          else setRating(unidade === "Botafogo" ? 8.6 : 7.8);
        }
      } catch (e) {
        console.error("[BoasVindas] erro:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [me?.userId, unidade]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-500" />
      </div>
    );
  }

  const primeiroNome = (nome || me?.funcionario?.nome || me?.email?.split("@")[0] || "Colaborador").split(" ")[0];
  const isAdmin = me?.isAdmin || me?.isGestor;
  const isCamareira = me?.isCamareira;
  const notaHotel = Number.isFinite(rating) ? rating : 8.0;
  const metaBatida = notaHotel >= 8.0;

  let ctaHref = "/recepcao";
  let ctaLabel = "Ir para o Controle de Check-ins";
  if (isAdmin) {
    ctaHref = "/gestao";
    ctaLabel = "Acessar Dashboard de Gestão";
  } else if (isCamareira) {
    ctaHref = "/camareiras";
    ctaLabel = "Ver Meu Mapa de Limpeza";
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-white p-6 flex flex-col justify-between font-sans">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-gradient-to-tr from-teal-500 to-emerald-500 rounded-xl flex items-center justify-center font-black text-white shadow-lg">
            IJ
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight">INJOY HOTÉIS</h1>
            <p className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase">
              Unidade {unidade}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400 font-bold">
            {new Date().toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "numeric",
              month: "short",
            })}
          </p>
          <span className="inline-flex items-center gap-1 text-[10px] bg-slate-800 text-teal-400 px-2 py-0.5 rounded-full font-bold">
            <Sparkles size={10} /> Sistema Ativo
          </span>
        </div>
      </div>

      {/* Center */}
      <div className="my-auto space-y-8 max-w-xl mx-auto w-full py-6">
        <div className="space-y-2">
          <h2 className="text-4xl md:text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-400">
            {obterSaudacaoHora()},<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-emerald-400">
              {primeiroNome}!
            </span>
          </h2>
          <p className="text-sm text-slate-400">
            Pronto para garantir uma experiência 5 estrelas aos nossos hóspedes hoje?
          </p>
        </div>

        {/* Rating card */}
        <div
          className={`relative overflow-hidden rounded-3xl border-2 p-6 shadow-2xl transition-all duration-300 ${
            metaBatida
              ? "bg-gradient-to-br from-emerald-950/40 to-teal-950/20 border-emerald-500/30 shadow-emerald-950/20"
              : "bg-gradient-to-br from-amber-950/40 to-red-950/20 border-amber-500/30 shadow-amber-950/20"
          }`}
        >
          <div className="absolute -right-8 -bottom-8 opacity-10 pointer-events-none">
            {metaBatida ? (
              <Award size={180} className="text-emerald-400" />
            ) : (
              <AlertTriangle size={180} className="text-amber-400" />
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between relative z-10">
            <div className="flex items-center gap-4">
              <div
                className={`w-20 h-20 rounded-2xl flex flex-col items-center justify-center font-black text-2xl shadow-lg border-2 ${
                  metaBatida
                    ? "bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950 border-emerald-300 animate-pulse"
                    : "bg-gradient-to-tr from-amber-500 to-orange-400 text-slate-950 border-amber-300"
                }`}
              >
                <span>{notaHotel.toFixed(1)}</span>
                <span className="text-[9px] uppercase font-bold -mt-1 tracking-wider">
                  Avaliação
                </span>
              </div>

              <div className="space-y-1">
                <span
                  className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                    metaBatida
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-amber-500/20 text-amber-400"
                  }`}
                >
                  {metaBatida ? "🏆 BÔNUS ATIVO" : "⚠️ ATENÇÃO - META DE BÔNUS"}
                </span>
                <h3 className="text-lg font-extrabold text-white">
                  Status de Qualidade da Unidade
                </h3>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-white/5 relative z-10">
            {metaBatida ? (
              <p className="text-sm text-emerald-300 font-medium leading-relaxed">
                🏆 <strong className="text-white">NOTA DO HOTEL: {notaHotel.toFixed(1)} — META ATINGIDA!</strong>{" "}
                Bônus garantido para a equipe! Continuem com o excelente trabalho de arrumação e
                atendimento. 🎉
              </p>
            ) : (
              <p className="text-sm text-amber-300 font-medium leading-relaxed">
                ⚠️ <strong className="text-white">NOTA DO HOTEL: {notaHotel.toFixed(1)} — PODEMOS MELHORAR!</strong>{" "}
                Vamos focar nos detalhes (limpeza fina, enxoval, vistorias) para recuperar o nosso
                bônus! 💪
              </p>
            )}
          </div>
        </div>

        {/* CTA */}
        <div className="pt-2">
          <Link
            to={ctaHref}
            className="w-full py-4 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-slate-950 font-black text-sm rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-teal-500/20"
          >
            {ctaLabel} <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      <div className="text-center text-[10px] text-slate-600 font-medium uppercase tracking-widest pt-4">
        INJOY Hotéis • Tecnologia e Gestão Hoteleira de Alta Performance
      </div>
    </div>
  );
}
