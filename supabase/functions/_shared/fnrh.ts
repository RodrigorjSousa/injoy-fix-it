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

const UFS: Record<string, string> = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE',
  'distrito federal': 'DF', 'espirito santo': 'ES', goias: 'GO', maranhao: 'MA', 'mato grosso': 'MT',
  'mato grosso do sul': 'MS', 'minas gerais': 'MG', para: 'PA', paraiba: 'PB', parana: 'PR',
  pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ', 'rio grande do norte': 'RN',
  'rio grande do sul': 'RS', rondonia: 'RO', roraima: 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP',
  sergipe: 'SE', tocantins: 'TO',
}

/** "São Paulo" / "sp" → "SP" (null se não reconhecer). */
export function ufDoEstado(v: string): string | null {
  const s = semAcento(v).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!s) return null
  if (s.length === 2) {
    const sigla = s.toUpperCase()
    return Object.values(UFS).includes(sigla) ? sigla : null
  }
  return UFS[s] ?? null
}

// Faixas de CEP dos Correios por UF (5 primeiros dígitos).
const FAIXAS_CEP: Array<[number, number, string]> = [
  [1000, 19999, 'SP'], [20000, 28999, 'RJ'], [29000, 29999, 'ES'], [30000, 39999, 'MG'],
  [40000, 48999, 'BA'], [49000, 49999, 'SE'], [50000, 56999, 'PE'], [57000, 57999, 'AL'],
  [58000, 58999, 'PB'], [59000, 59999, 'RN'], [60000, 63999, 'CE'], [64000, 64999, 'PI'],
  [65000, 65999, 'MA'], [66000, 68899, 'PA'], [68900, 68999, 'AP'], [69000, 69299, 'AM'],
  [69300, 69399, 'RR'], [69400, 69899, 'AM'], [69900, 69999, 'AC'], [70000, 72799, 'DF'],
  [72800, 72999, 'GO'], [73000, 73699, 'DF'], [73700, 76799, 'GO'], [76800, 76999, 'RO'],
  [77000, 77999, 'TO'], [78000, 78899, 'MT'], [79000, 79999, 'MS'], [80000, 87999, 'PR'],
  [88000, 89999, 'SC'], [90000, 99999, 'RS'],
]

/** UF pelo CEP (8 dígitos) — null se fora das faixas. */
export function ufDoCep(cep: string): string | null {
  const n = Number(digitos(cep).slice(0, 5))
  if (!n) return null
  return FAIXAS_CEP.find(([a, b]) => n >= a && n <= b)?.[2] ?? null
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
  // Endereço no Brasil: a FNRH acha a cidade pelo estado; CEP de outro estado = "cidade_id não informado".
  const enderecoNoBrasil = pais ? ehBrasil(pais) : brasileiro
  if (enderecoNoBrasil) {
    const estado = texto(g.guestState ?? g.state)
    const uf = ufDoEstado(estado)
    const cep = digitos(texto(g.guestZip ?? g.zip ?? g.zipCode ?? g.postalCode))
    if (!estado) faltando.push('estado (UF)')
    if (!cep) faltando.push('CEP')
    else if (cep.length !== 8) faltando.push('CEP inválido')
    else {
      const ufCep = ufDoCep(cep)
      if (uf && ufCep && uf !== ufCep) faltando.push(`estado (${uf}) não bate com o CEP (${ufCep})`)
    }
  }
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
