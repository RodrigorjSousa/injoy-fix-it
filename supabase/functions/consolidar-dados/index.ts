import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apiKey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const apiKeyIpanema = Deno.env.get('CLOUDBEDS_API_KEY_IPANEMA')
    const apiKeyBotafogo = Deno.env.get('CLOUDBEDS_API_KEY_BOTAFOGO')

    const hojeStr = new Date().toISOString().split('T')[0]

    const processarPropriedade = async (apiKey: string | undefined, nomeUnidade: string) => {
      if (!apiKey) return { quartos: [] as any[], dashboard: null as any }

      const janelaInicio = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0]
      const janelaFim = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0]

      const authHeaders = { Authorization: `Bearer ${apiKey}` }

      // Busca reservas paginadas — Cloudbeds limita pageSize a 100.
      // Sem paginação, hóspedes de estadia longa (checkin > 100 reservas atrás)
      // ficam de fora e o quarto aparece como "Quarto Vazio".
      const fetchReservasPagina = async (
        pageNumber: number,
        checkInFrom: string,
        checkInTo: string,
        statusFilter = '',
      ) => {
        const url =
          `https://hotels.cloudbeds.com/api/v1.2/getReservations?checkInFrom=${checkInFrom}` +
          `&checkInTo=${checkInTo}&includeGuestsDetails=true&pageSize=100&pageNumber=${pageNumber}` +
          statusFilter
        const r = await fetch(url, { headers: authHeaders })
        return r.json().catch(() => ({}))
      }

      const fetchTodasReservas = async (
        checkInFrom: string,
        checkInTo: string,
        statusFilter = '',
      ) => {
        const primeira = await fetchReservasPagina(1, checkInFrom, checkInTo, statusFilter)
        if (!primeira?.success) return [] as any[]
        const total = Number(primeira.total ?? primeira.count ?? 0)
        const acc: any[] = Array.isArray(primeira.data) ? [...primeira.data] : []
        const totalPaginas = Math.min(Math.ceil(total / 100), 50) // hard cap de segurança
        if (totalPaginas > 1) {
          const pags = await Promise.all(
            Array.from({ length: totalPaginas - 1 }, (_, i) =>
              fetchReservasPagina(i + 2, checkInFrom, checkInTo, statusFilter),
            ),
          )
          for (const p of pags) {
            if (p?.success && Array.isArray(p.data)) acc.push(...p.data)
          }
        }
        return acc
      }

      const [roomsRes, dashRes, reservasWindow, reservasCheckedIn] = await Promise.all([
        fetch('https://hotels.cloudbeds.com/api/v1.2/getHousekeepingStatus', { headers: authHeaders }),
        fetch('https://hotels.cloudbeds.com/api/v1.2/getDashboard', { headers: authHeaders }),
        // Janela padrão: reservas do dia (arrivals/departures/short-stay)
        fetchTodasReservas(janelaInicio, janelaFim),
        // Hóspedes atualmente hospedados — checkin nos últimos 365 dias, filtro status
        fetchTodasReservas(
          new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          janelaFim,
          '&status=checked_in',
        ),
      ])

      const roomsJson = await roomsRes.json().catch(() => ({}))
      const dashJson = await dashRes.json().catch(() => ({}))

      const houseData = roomsJson?.data
      const todosQuartos: any[] = Array.isArray(houseData)
        ? houseData
        : Array.isArray(houseData?.rooms)
          ? houseData.rooms
          : []

      // Deduplica por reservationID unindo as duas consultas
      const mapReservas = new Map<string, any>()
      for (const r of [...reservasWindow, ...reservasCheckedIn]) {
        const id = String(r?.reservationID ?? r?.reservationId ?? r?.id ?? '')
        if (!id) continue
        if (!mapReservas.has(id)) mapReservas.set(id, r)
      }
      const reservasRaw: any[] = Array.from(mapReservas.values())

      // Normaliza reservas: EXPANDE por quarto atribuído.
      // Reservas multi-quarto (mesmo hóspede aluga 107 + 109) precisam gerar
      // uma entrada por quarto, senão só o primeiro quarto exibe o hóspede
      // e os demais aparecem como "Quarto Vazio".
      const reservas = reservasRaw.flatMap((r: any) => {
        const guestListObj = r.guestList ?? {}
        const guestsAll: any[] = Object.values(guestListObj)
        const mainGuestId = r.guestID
        const mainGuest = guestListObj?.[mainGuestId] ?? guestsAll[0] ?? {}

        // Coleta todos os quartos únicos citados por qualquer hóspede da reserva
        const roomsMap = new Map<string, any>()
        for (const g of guestsAll.length ? guestsAll : [mainGuest]) {
          const assigned: any[] = Array.isArray(g?.rooms) ? g.rooms : []
          const unassigned: any[] = Array.isArray(g?.unassignedRooms) ? g.unassignedRooms : []
          for (const info of [...assigned, ...unassigned]) {
            const num = String(
              info?.roomName ?? info?.roomNumber ?? info?.assignedRoomNumber ?? '',
            ).trim()
            if (num && !roomsMap.has(num)) roomsMap.set(num, info)
          }
        }
        // Fallback: reserva sem quartos vinculados → uma entrada única sem quarto
        if (roomsMap.size === 0) roomsMap.set('', {})

        const checkInDate = String(r.startDate ?? r.checkInDate ?? '').slice(0, 10)
        const checkOutDate = String(r.endDate ?? r.checkOutDate ?? '').slice(0, 10)

        return Array.from(roomsMap.keys()).map((roomNumber) => {
          // Hóspede exibido no quarto: o primeiro guest cujas rooms contêm esse quarto,
          // senão o principal (fallback para reservas sem split explícito).
          const guestForRoom = guestsAll.find((g: any) => {
            const rs: any[] = [
              ...(Array.isArray(g?.rooms) ? g.rooms : []),
              ...(Array.isArray(g?.unassignedRooms) ? g.unassignedRooms : []),
            ]
            return rs.some((info) =>
              String(info?.roomName ?? info?.roomNumber ?? info?.assignedRoomNumber ?? '').trim() ===
                roomNumber,
            )
          }) ?? mainGuest

          // Pax do quarto: nº de hóspedes cujas rooms incluem esse quarto.
          // Se a reserva não faz split por hóspede, usa o total da reserva.
          const paxNoQuarto = guestsAll.filter((g: any) => {
            const rs: any[] = [
              ...(Array.isArray(g?.rooms) ? g.rooms : []),
              ...(Array.isArray(g?.unassignedRooms) ? g.unassignedRooms : []),
            ]
            return rs.some((info) =>
              String(info?.roomName ?? info?.roomNumber ?? info?.assignedRoomNumber ?? '').trim() ===
                roomNumber,
            )
          }).length
          const totalReserva = (parseInt(r.adults ?? 1, 10) || 0) + (parseInt(r.children ?? 0, 10) || 0)
          const numberOfGuests = paxNoQuarto > 0 ? paxNoQuarto : totalReserva

          return {
            ...r,
            _roomNumber: roomNumber,
            _checkInDate: checkInDate,
            _checkOutDate: checkOutDate,
            guestFirstName: guestForRoom?.guestFirstName ?? '',
            guestLastName: guestForRoom?.guestLastName ?? '',
            guestDocumentNumber: guestForRoom?.guestDocumentNumber ?? r.guestDocumentNumber ?? '',
            guestDocumentType: guestForRoom?.guestDocumentType ?? '',
            guestTaxID: guestForRoom?.taxID ?? r.taxID ?? '',
            guestCountry: guestForRoom?.guestCountry ?? r.guestCountry ?? '',
            numberOfGuests,
          }
        })
      }).filter((r: any) => {
        const s = String(r.status ?? '').toLowerCase()
        return s !== 'canceled' && s !== 'cancelled' && s !== 'no_show'
      })


      const quartos = todosQuartos.map((room: any) => {
        const numQuarto = String(room.roomName ?? room.roomNumber ?? '').trim()

        const reservaSaindoHoje = reservas.find(
          (r: any) => r._roomNumber === numQuarto && r._checkOutDate === hojeStr,
        )
        const reservaEntrandoHoje = reservas.find(
          (r: any) =>
            r._roomNumber === numQuarto &&
            r._checkInDate === hojeStr &&
            String(r.status).toLowerCase() !== 'checked_out',
        )
        const hospedeAtualInHouse = reservas.find(
          (r: any) =>
            r._roomNumber === numQuarto &&
            String(r.status).toLowerCase() === 'checked_in' &&
            (!r._checkOutDate || r._checkOutDate > hojeStr),
        )
        // Fallback: reserva confirmada/pending com estadia sobreposta a hoje
        // (cobre atrasos de check-in em que o Cloudbeds ainda não marcou como checked_in).
        const reservaAtivaSobreposta = !hospedeAtualInHouse && !reservaEntrandoHoje && !reservaSaindoHoje
          ? reservas.find((r: any) => {
              if (r._roomNumber !== numQuarto) return false
              const st = String(r.status ?? '').toLowerCase()
              if (st === 'checked_out' || st === 'canceled' || st === 'cancelled' || st === 'no_show') return false
              return r._checkInDate && r._checkOutDate &&
                r._checkInDate <= hojeStr && r._checkOutDate > hojeStr
            })
          : null

        let tarefaSugerida = 'VERIFICAÇÃO'
        let corLegenda = 'CINZA'
        let blinkTroca = false

        const calcularTroca = (checkInISO: string, checkOutISO: string | null | undefined) => {
          const dataCheckin = new Date(checkInISO)
          const dataHoje = new Date(hojeStr)
          const diff = Math.floor(
            (dataHoje.getTime() - dataCheckin.getTime()) / (1000 * 60 * 60 * 24),
          )
          const diaDeTroca = diff > 0 && diff % 3 === 0
          const coincideCheckout = !!checkOutISO && checkOutISO === hojeStr
          return {
            tarefa: diaDeTroca ? 'TROCA + ARRUMAÇÃO' : 'ARRUMAÇÃO',
            blink: diaDeTroca && coincideCheckout,
          }
        }

        if (reservaSaindoHoje && reservaEntrandoHoje) {
          tarefaSugerida = 'GERAL - CHECK-IN'
          corLegenda = 'CINZA'
        } else if (reservaSaindoHoje && !reservaEntrandoHoje) {
          tarefaSugerida = 'GERAL'
          corLegenda = 'CINZA'
        } else if (hospedeAtualInHouse) {
          corLegenda = 'VERDE'
          const t = calcularTroca(hospedeAtualInHouse._checkInDate, hospedeAtualInHouse._checkOutDate)
          tarefaSugerida = t.tarefa
          blinkTroca = t.blink
        } else if (!hospedeAtualInHouse && reservaEntrandoHoje) {
          tarefaSugerida = 'REVISÃO'
          const temPendencia =
            parseFloat(reservaEntrandoHoje.balanceDue ?? reservaEntrandoHoje.balance ?? 0) > 0 ||
            !(reservaEntrandoHoje.guestDocumentNumber || reservaEntrandoHoje.guestTaxID || reservaEntrandoHoje.guestDocumentType)

          corLegenda = temPendencia ? 'AZUL FRACO' : 'AZUL FORTE'
        } else if (reservaAtivaSobreposta) {
          corLegenda = 'VERDE'
          const t = calcularTroca(reservaAtivaSobreposta._checkInDate, reservaAtivaSobreposta._checkOutDate)
          tarefaSugerida = t.tarefa
          blinkTroca = t.blink
        } else if (String(room.housekeepingStatus ?? '').toLowerCase() === 'dirty') {
          tarefaSugerida = 'ARRUMAÇÃO'
        }


        const cond = String(room.roomCondition ?? '').toLowerCase()
        const blocked =
          room.roomBlocked === true || cond === 'out_of_service' || cond === 'maintenance'

        let status = 'dirty'
        if (blocked) status = 'maintenance'
        else if (cond === 'clean' || cond === 'inspected') status = 'clean'
        else if (cond === 'dirty') status = 'dirty'
        else status = String(room.housekeepingStatus ?? 'dirty').toLowerCase()

        const resAtiva = hospedeAtualInHouse || reservaEntrandoHoje || reservaAtivaSobreposta || reservaSaindoHoje
        const guestName = resAtiva
          ? `${resAtiva.guestFirstName ?? ''} ${resAtiva.guestLastName ?? ''}`.trim() || 'Hóspede'
          : 'Quarto Vazio'
        const pax = resAtiva ? resAtiva.numberOfGuests || 0 : 0
        const pendingAmount = resAtiva
          ? (() => {
              const v = parseFloat(String(resAtiva.balanceDue ?? resAtiva.balance ?? 0))
              return Number.isFinite(v) && v > 0 ? Number(v.toFixed(2)) : 0
            })()
          : 0
        const hasPendingPayment = pendingAmount > 0
        // Docs completos se qualquer identificação estiver preenchida:
        // documento (passaporte/RG), taxID (CPF) ou tipo de documento cadastrado.
        // Cloudbeds só popula guestDocumentNumber quando digitado manualmente;
        // reservas de OTAs (Booking, Expedia) usam apenas taxID/CPF ou country.
        const docNum = String(resAtiva?.guestDocumentNumber ?? '').trim()
        const docType = String(resAtiva?.guestDocumentType ?? '').trim().replace(/^-$/, '')
        const taxId = String(resAtiva?.guestTaxID ?? '').trim()
        let hasPendingDocs = resAtiva
          ? !(docNum || taxId || docType)
          : false
        // Regra customizada: se a reserva está confirmada e sem saldo pendente,
        // consideramos a documentação liberada (ignora alerta falso do Cloudbeds).
        const statusReserva = String(resAtiva?.status ?? '').toLowerCase()
        if (
          hasPendingDocs &&
          (statusReserva === 'confirmed' || statusReserva === 'checked_in') &&
          pendingAmount <= 0
        ) {
          hasPendingDocs = false
        }


        // Hora estimada de chegada (do check-in online do hóspede no Cloudbeds).
        // Extrai HH:MM sem converter fuso — Cloudbeds retorna hora local do hotel.
        const formatHora = (v: unknown): string => {
          if (v === null || v === undefined) return ''
          const s = String(v).trim()
          if (!s) return ''
          if (s.includes('T')) {
            const parte = s.split('T')[1]
            if (parte && parte.length >= 5) return parte.substring(0, 5)
          }
          const hm = s.match(/(\d{1,2}):(\d{2})/)
          if (hm) return `${hm[1].padStart(2, '0')}:${hm[2]}`
          return ''
        }
        const arrivalTime = resAtiva
          ? formatHora(
              (resAtiva as any).estimatedArrivalTime ??
                (resAtiva as any).estimatedTimeArrival ??
                (resAtiva as any).arrivalTime ??
                (resAtiva as any).checkInTime,
            ) || null
          : null

        return {
          property: nomeUnidade,
          room_number: numQuarto,
          room_type: String(room.roomTypeName ?? room.roomType ?? ''),
          status,
          condition: blocked ? 'maintenance' : 'normal',
          assigned_task: tarefaSugerida,
          color_code: corLegenda,
          guest_name: guestName,
          pax,
          has_pending_payment: hasPendingPayment,
          pending_payment_amount: pendingAmount,
          has_pending_docs: hasPendingDocs,
          blink_troca: blinkTroca,
          arrival_time: arrivalTime,
        }

      })

      return { quartos, dashboard: dashJson, reservas }
    }



    const [ipanema, botafogo] = await Promise.all([
      processarPropriedade(apiKeyIpanema, 'Ipanema'),
      processarPropriedade(apiKeyBotafogo, 'Botafogo'),
    ])

    const nowIso = new Date().toISOString()

    // Normalização de número de quarto: banco local grava "APT 001",
    // Cloudbeds retorna "001". Padroniza para "APT xxx" para que o mapa
    // de preservação encontre o registro existente.
    const normalizarNumero = (num: string) => {
      const clean = String(num ?? '').trim()
      if (!clean) return clean
      return clean.toUpperCase().startsWith('APT ') ? clean : `APT ${clean}`
    }

    const consolidados = [...ipanema.quartos, ...botafogo.quartos].map((q) => ({
      ...q,
      room_number: normalizarNumero(q.room_number),
    }))

    // Busca status/condition atuais para preservar o que as camareiras marcaram no app.
    // O app é a fonte da verdade do status de limpeza; Cloudbeds só alimenta dados de reserva.
    const { data: existentes } = await supabaseClient
      .from('room_housekeeping')
      .select('property, room_number, status, condition')

    const mapaExistente = new Map<string, { status: string | null; condition: string | null }>()
    for (const r of existentes ?? []) {
      mapaExistente.set(`${r.property}::${normalizarNumero(r.room_number)}`, {
        status: r.status,
        condition: r.condition,
      })
    }

    // Aplica preservação ANTES das métricas — os valores finais gravados
    // no banco são a fonte da verdade para os contadores da Gestão.
    const finais = consolidados
      .filter((q) => q.room_number)
      .map((q) => {
        const key = `${q.property}::${q.room_number}`
        const atual = mapaExistente.get(key)
        // Se o quarto já existe no banco, PRESERVA status e condition locais
        // (definidos pelas camareiras no app). Só usa os do Cloudbeds em inserts novos.
        // Exceção: se o Cloudbeds indica bloqueio de manutenção, aplica — isso vem de OS registrada.
        const preservarStatus = atual ? atual.status ?? q.status : q.status
        const preservarCondition = atual
          ? q.condition === 'maintenance'
            ? 'maintenance'
            : atual.condition ?? q.condition
          : q.condition
        return { ...q, status: preservarStatus, condition: preservarCondition }
      })

    // Métricas do dashboard — usa os valores FINAIS (já preservados) do banco,
    // nunca o status bruto do Cloudbeds.
    for (const [unidade, dados] of [
      ['Ipanema', ipanema] as const,
      ['Botafogo', botafogo] as const,
    ]) {
      const d = dados.dashboard?.data ?? {}
      console.log(`[consolidar-dados] dashboard ${unidade} keys:`, Object.keys(d))

      const quartosUnidade = finais.filter((q) => q.property === unidade)
      const limpos = quartosUnidade.filter((q) => q.status === 'clean').length
      const sujos = quartosUnidade.filter((q) => q.status === 'dirty').length
      const manut = quartosUnidade.filter((q) => q.status === 'maintenance').length
      const total = quartosUnidade.length

      // Reservas ativas hoje (check-in <= hoje < check-out) ou já em check-in
      const reservasAtivas = (dados.reservas ?? []).filter((r: any) => {
        const s = String(r.status ?? '').toLowerCase()
        if (s === 'canceled' || s === 'cancelled' || s === 'no_show') return false
        const ci = String(r.checkInDate ?? r.startDate ?? '').slice(0, 10)
        const co = String(r.checkOutDate ?? r.endDate ?? '').slice(0, 10)
        if (s === 'checked_in') return !co || co >= hojeStr
        if (ci && co) return ci <= hojeStr && co >= hojeStr
        return ci === hojeStr
      })

      // Ocupação: prefere dashboard, senão calcula do estoque de quartos
      const ocupados = reservasAtivas.filter((r: any) => String(r.status).toLowerCase() === 'checked_in').length
      const ocupacaoDash = parseFloat(
        d.percentageOccupied ?? d.occupancy ?? d.occupancyPercentage ?? 'NaN',
      )
      const ocupacao = Number.isFinite(ocupacaoDash) && ocupacaoDash > 0
        ? ocupacaoDash
        : total > 0 ? (ocupados / total) * 100 : 0

      // Disponíveis para venda: limpos e não bloqueados; fallback do dashboard se houver
      const dashAvail = parseInt(String(d.roomsAvailable ?? d.availableRooms ?? '0'), 10)
      const availableRooms = dashAvail > 0 ? dashAvail : Math.max(limpos - manut, 0)

      // Saldo pendente: soma de balanceDue das reservas ativas
      const pendingBalance = reservasAtivas.reduce((sum: number, r: any) => {
        const v = parseFloat(String(r.balanceDue ?? r.balance ?? 0))
        return sum + (Number.isFinite(v) && v > 0 ? v : 0)
      }, 0)

      // Docs pendentes: usa a mesma regra aplicada aos quartos (após validação de
      // reserva confirmada + saldo zero), garantindo consistência com os badges.
      const pendingDocs = quartosUnidade.filter((q) => q.has_pending_docs === true).length

      // Nota de avaliação (Cloudbeds Guest Reviews) — homologação: valores fixos por unidade
      const ratingUnidade = unidade === 'Botafogo' ? 8.6 : 7.8

      await supabaseClient.from('hotel_metrics').upsert(
        {
          property: unidade,
          date: hojeStr,
          occupancy_percentage: Number(ocupacao.toFixed(2)),
          clean_rooms: limpos,
          dirty_rooms: sujos,
          maintenance_rooms: manut,
          pending_balance: Number(pendingBalance.toFixed(2)),
          available_rooms: availableRooms,
          pending_docs_count: pendingDocs,
          rating: ratingUnidade,
          updated_at: nowIso,
        },
        { onConflict: 'property,date' },
      )
    }

    for (const q of finais) {
      await supabaseClient.from('room_housekeeping').upsert(
        { ...q, updated_at: nowIso },
        { onConflict: 'property,room_number' },
      )
    }


    return new Response(
      JSON.stringify({ success: true, count: consolidados.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
