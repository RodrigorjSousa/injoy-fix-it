// Reservas de canais que cobram o hóspede e repassam depois (ex.: Airbnb, repasse em até 48h).
// No Cloudbeds elas aparecem com saldo em aberto, mas o hóspede JÁ PAGOU ao canal:
// para a Recepção e as Camareiras isso não é débito.
// Mantenha igual a supabase/functions/_shared/canal-pagamento.ts.

const CANAIS_PRE_PAGOS = /air\s*bnb/i

const CAMPOS_CANAL = [
  'sourceName', 'source', 'sourceID', 'sourceId', 'origin', 'channel', 'channelName',
  'channelSource', 'thirdPartySource', 'otaName', 'bookingSource',
]

export function canalPrePago(res: Record<string, unknown> | null | undefined): boolean {
  if (!res || typeof res !== 'object') return false
  for (const campo of CAMPOS_CANAL) {
    const v = (res as Record<string, unknown>)[campo]
    if (typeof v === 'string' && CANAIS_PRE_PAGOS.test(v)) return true
    if (v && typeof v === 'object') {
      const nome = (v as Record<string, unknown>).name ?? (v as Record<string, unknown>).sourceName
      if (typeof nome === 'string' && CANAIS_PRE_PAGOS.test(nome)) return true
    }
  }
  return false
}

/** Saldo que a equipe deve cobrar: zero para canal pré-pago (Airbnb). */
export function saldoACobrar(res: Record<string, unknown> | null | undefined): number {
  if (!res || canalPrePago(res)) return 0
  const r = res as Record<string, unknown>
  const v = parseFloat(String(r.balanceDue ?? r.balance ?? 0))
  return Number.isFinite(v) && v > 0 ? Number(v.toFixed(2)) : 0
}
