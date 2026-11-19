// FNRH Digital (Ministério do Turismo) — pré-checagem do cadastro dos hóspedes no Cloudbeds.
// O app "Brazil Police Report (FNRH)" envia a ficha no check-in; se UM hóspede da reserva
// tiver erro, a reserva inteira fica sem FNRH. Aqui olhamos o guestList da reserva
// (getReservations com includeGuestsDetails=true) e dizemos o que falta ANTES do check-in.
// Arquivo puro (sem rede), usado pela edge function dados-recepcao e testado em src/lib/fnrh.test.ts.

type Raw = Record<string, unknown>

export type PendenciaFnrh = {
  hospede: string
  faltando: string[]
}

const texto = (v: unknown): string => {
  if (v === null || v === undefined || typeof v === 'object') return ''
  const s = String(v).trim()
  return s === '-' || s.toLowerCase() === 'null' || s.toLowerCase() === 'n/a' ? '' : s
}

const semAcento = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** customFields do Cloudbeds: array [{customFieldName, customFieldValue}] ou objeto. */
function camposPersonalizados(g: Raw): Array<[string, string]> {
  const cf = g.customFields ?? g.guestCustomFields
  if (Array.isArray(cf))
    return cf
      .filter((c): c is Raw => !!c && typeof c === 'object')
      .map((c) => [
        String(c.customFieldName ?? c.name ?? c.customFieldShortcode ?? ''),
        texto(c.customFieldValue ?? c.value),
      ])
  if (cf && typeof cf === 'object')
    return Object.entries(cf as Raw).map(([k, v]) => [k, texto(v)])
  return []
}

/** CPF válido (11 dígitos + dígitos verificadores; rejeita 111.111.111-11 etc.). */
export function cpfValido(valor: unknown): boolean {
  const d = String(valor ?? '').replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const dv = (n: number) => {
    let soma = 0
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

const ehBrasil = (v: string) => {
  const s = semAcento(v)
  return s === 'br' || s === 'bra' || s === 'brasil' || s === 'brazil' || s.startsWith('brasileir')
}

const dataValida = (v: string) => {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/) ?? v.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return false
  const ano = Number(v.includes('/') ? m[3] : m[1])
  return ano > 1900 && ano <= new Date().getFullYear()
}

/** Valor de um campo personalizado cujo nome casa com o padrão (undefined = o campo não existe). */
function campo(cfs: Array<[string, string]>, padrao: RegExp): string | undefined {
  const achado = cfs.filter(([k]) => padrao.test(semAcento(k)))
  if (!achado.length) return undefined
  return achado.map(([, v]) => v).find(Boolean) ?? ''
}

function digitos(v: string) {
  return v.replace(/\D/g, '')
}

/** O que falta no cadastro de UM hóspede para a FNRH passar. */
export function pendenciasDoHospede(g: Raw): { nome: string; cpf: string | null; faltando: string[] } {
  const faltando: string[] = []
  const first = texto(g.guestFirstName ?? g.firstName)
  const last = texto(g.guestLastName ?? g.lastName)
  const nome = [first, last].filter(Boolean).join(' ') || texto(g.guestName ?? g.name)
  if (!first || !last) faltando.push('nome completo')

  const cfs = camposPersonalizados(g)
  const nascimento = texto(g.guestBirthdate ?? g.guestBirthDate ?? g.birthdate ?? g.birthDate ?? g.dateOfBirth)
  if (!dataValida(nascimento)) faltando.push('nascimento')

  const nacionalidade =
    texto(g.guestNationality ?? g.nationality) || (campo(cfs, /nacionalidad|nationality/) ?? '')
  const pais = texto(g.guestCountry ?? g.country)
  const brasileiro = nacionalidade ? ehBrasil(nacionalidade) : ehBrasil(pais)
  if (!nacionalidade && !pais) faltando.push('nacionalidade')

  // Documento: brasileiro precisa de CPF válido; estrangeiro, do nº do documento (passaporte).
  const docNum = texto(g.guestDocumentNumber ?? g.documentNumber)
  const taxId = texto(g.taxID ?? g.guestTaxID)
  let cpf: string | null = null
  if (brasileiro) {
    const candidato = [docNum, taxId].find((v) => digitos(v).length === 11) ?? (docNum || taxId)
    if (!candidato) faltando.push('CPF')
    else if (!cpfValido(candidato)) faltando.push('CPF inválido')
    else cpf = digitos(candidato)
  } else if (!docNum) {
    faltando.push('documento (passaporte)')
  }

  // Endereço: o erro mais comum é "cidade_id não informado".
  if (!texto(g.guestCity ?? g.city)) faltando.push('cidade')
  if (brasileiro && !texto(g.guestState ?? g.state)) faltando.push('estado (UF)')
  if (!pais) faltando.push('país')

  // Motivo da viagem / meio de transporte: só cobramos se o campo existe na reserva
  // (o nome varia entre contas; sem o campo não dá para saber).
  const motivo = campo(cfs, /motivo|travel ?reason|reason for travel/)
  if (motivo === '') faltando.push('motivo da viagem')
  const transporte = campo(cfs, /transporte|transportation|transport/)
  if (transporte === '') faltando.push('meio de transporte')

  return { nome: nome || 'Hóspede', cpf, faltando }
}

/** Pendências FNRH da reserva inteira (todos os hóspedes), só de quem tem algo faltando. */
export function pendenciasFnrhDaReserva(guests: unknown[], totalPax?: number): PendenciaFnrh[] {
  const lista = guests.filter((g): g is Raw => !!g && typeof g === 'object')
  const analisados = lista.map(pendenciasDoHospede)
  // Mesmo CPF em dois hóspedes = "documentação registrada em nome de outra pessoa".
  const vezes = new Map<string, number>()
  for (const a of analisados) if (a.cpf) vezes.set(a.cpf, (vezes.get(a.cpf) ?? 0) + 1)
  const out: PendenciaFnrh[] = []
  for (const a of analisados) {
    const faltando = [...a.faltando]
    if (a.cpf && (vezes.get(a.cpf) ?? 0) > 1) faltando.push('CPF repetido em outro hóspede')
    if (faltando.length) out.push({ hospede: a.nome, faltando })
  }
  const pax = Number(totalPax) || 0
  if (pax > lista.length && lista.length > 0) {
    const n = pax - lista.length
    out.push({ hospede: n === 1 ? '1 acompanhante' : `${n} acompanhantes`, faltando: ['cadastrar no Cloudbeds'] })
  }
  return out
}

/** "Cidade, CPF" — texto curto para o card. */
export function resumoFnrh(p: PendenciaFnrh[]): string {
  const tudo = [...new Set(p.flatMap((x) => x.faltando))]
  return tudo.join(', ')
}
