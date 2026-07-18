interface Props {
  size?: number;
  className?: string;
}

/**
 * Ícone flat de "Troca de Turno" — duas setas circulares entrelaçadas
 * (azul → roxo → laranja) inspirado no símbolo fornecido pelo cliente.
 */
export function TrocaTurnoIcon({ size = 24, className }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="ttArrowTop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
        <linearGradient id="ttArrowBottom" x1="1" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#F97316" />
          <stop offset="100%" stopColor="#FB923C" />
        </linearGradient>
      </defs>

      {/* Seta superior (azul → roxo) */}
      <path
        d="M12 26 A20 20 0 0 1 48 20 L48 12 L60 24 L48 36 L48 28 A12 12 0 0 0 20 30 Z"
        fill="url(#ttArrowTop)"
      />

      {/* Seta inferior (laranja) */}
      <path
        d="M52 38 A20 20 0 0 1 16 44 L16 52 L4 40 L16 28 L16 36 A12 12 0 0 0 44 34 Z"
        fill="url(#ttArrowBottom)"
      />
    </svg>
  );
}
