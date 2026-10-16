// Botão "Reservas" piscando: quando entra reserva nova na lista de cobrança, o botão do menu pisca
// na cor da modalidade (NR check-in próximo = laranja, NR 8º dia = âmbar, Standard = azul) até a pessoa
// abrir a tela Reservas. Com mais de uma modalidade nova, alterna as cores, da mais urgente para a menos.
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { COR_MOTIVO, MOTIVO_CURTO, ORDEM_URGENCIA } from "@/lib/reservas/cobranca";
import { useNovidadesReservas, usePermissaoReservas } from "@/lib/reservas/use-reservas";

export type PiscaReservas = {
  ativo: boolean;
  total: number;
  /** Cor da vez (troca a cada ciclo quando há mais de uma modalidade). */
  cor: string;
  /** Aplicar no botão: `className` + `style`. */
  className: string;
  style: CSSProperties | undefined;
  /** Texto para leitor de tela e dica: "2 novas: NR · 8º dia, Standard". */
  descricao: string;
};

const CICLO_MS = 2200; // duas piscadas por cor

export function usePiscaReservas(): PiscaReservas {
  const perm = usePermissaoReservas();
  const novidades = useNovidadesReservas(perm.data?.ve === true);
  const n = novidades.data;

  const cores = useMemo(() => (n ? ORDEM_URGENCIA.filter((m) => n[m] > 0) : []), [n]);
  const total = n ? n.nr_checkin_proximo + n.nr_8o_dia + n.standard : 0;

  const [vez, setVez] = useState(0);
  useEffect(() => {
    setVez(0);
    if (cores.length < 2) return;
    const t = setInterval(() => setVez((v) => (v + 1) % cores.length), CICLO_MS);
    return () => clearInterval(t);
  }, [cores.length]);

  const ativo = total > 0 && cores.length > 0;
  const motivo = cores[vez % Math.max(cores.length, 1)];
  const cor = motivo ? COR_MOTIVO[motivo] : COR_MOTIVO.standard;
  return {
    ativo,
    total,
    cor,
    className: ativo ? "animate-pisca-reservas" : "",
    style: ativo ? ({ "--pisca-cor": cor } as CSSProperties) : undefined,
    descricao: ativo
      ? `${total} ${total === 1 ? "reserva nova" : "reservas novas"} para cobrar: ${cores.map((m) => MOTIVO_CURTO[m]).join(", ")}`
      : "",
  };
}

/** Bolinha com a quantidade de reservas novas, na cor da vez. */
export function ContadorReservas({ pisca, className = "" }: { pisca: PiscaReservas; className?: string }) {
  if (!pisca.ativo) return null;
  return (
    <span
      aria-hidden
      className={`inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-black tabular-nums shadow-sm ${className}`}
      style={{ color: pisca.cor }}
    >
      {pisca.total > 99 ? "99+" : pisca.total}
    </span>
  );
}
