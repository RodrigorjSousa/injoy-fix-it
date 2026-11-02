/** Só os dígitos. */
export const soDigitos = (v: string | null | undefined) => String(v ?? "").replace(/\D/g, "");

/** CPF válido (dígitos verificadores; recusa 11 dígitos iguais). */
export function cpfValido(valor: string | null | undefined): boolean {
  const c = soDigitos(valor);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const d = c.split("").map(Number);
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += d[i] * (n + 1 - i);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(9) === d[9] && dv(10) === d[10];
}

/** 52998224725 → 529.982.247-25 */
export function formatarCpf(valor: string | null | undefined): string {
  const c = soDigitos(valor).slice(-11).padStart(11, "0");
  return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
}

/** 12345678000190 → 12.345.678/0001-90 */
export function formatarCnpj(valor: string | null | undefined): string {
  const c = soDigitos(valor).padStart(14, "0");
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}
