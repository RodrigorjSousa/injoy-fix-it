import { cloudbedsFetch, type CloudbedsProperty } from "@/lib/cloudbeds/client.server";
import { predictHousekeepingTasks, type ForecastReservation } from "@/lib/cloudbeds/housekeeping-rules";
import { addCivilDays } from "@/lib/escala-engine";
import { todaySP } from "@/lib/tz";

type Unit = "Botafogo" | "Ipanema";
type Raw = Record<string, unknown>;
const text = (value: unknown) => typeof value === "string" ? value.trim() : value == null ? "" : String(value);
const dateOnly = (value: unknown) => text(value).slice(0, 10);
const minutes = (value: string | null | undefined) => { if (!value) return null; const [h, m] = value.slice(0, 5).split(":").map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null; };
const duration = (start: string | null, end: string | null) => { const a=minutes(start),b=minutes(end); if(a===null||b===null)return 0; return b>=a?b-a:1440-a+b; };
const hourSP = () => Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
const arrival = (value: unknown) => text(value).match(/\b(\d{1,2}):(\d{2})\b/)?.slice(1).join(":") ?? null;

// Sem checkOutTo: hóspedes que saem depois do horizonte continuam no quarto
// durante a janela e precisam contar como ARRUMAÇÃO/TROCA.
async function fetchPages(property: CloudbedsProperty, from: string, to: string) {
  const page = async (pageNumber: number) => {
    const qs = new URLSearchParams({ checkInFrom: addCivilDays(from, -365), checkInTo: to, checkOutFrom: from, includeGuestsDetails: "true", includeAllRooms: "true", pageSize: "100", pageNumber: String(pageNumber) });
    const response = await cloudbedsFetch(property, `/getReservations?${qs}`);
    if (!response.ok) throw new Error(`Cloudbeds indisponível (${response.status})`);
    return response.json() as Promise<{ success?: boolean; data?: Raw[]; total?: number | string; count?: number | string }>;
  };
  const first = await page(1); if (first.success === false) throw new Error("Cloudbeds retornou erro");
  const rows = [...(first.data ?? [])]; const pages = Math.min(50, Math.ceil(Number(first.total ?? first.count ?? rows.length) / 100));
  for (let current = 2; current <= pages; current++) { const next = await page(current); rows.push(...(next.data ?? [])); }
  return rows;
}

function normalize(raw: Raw[]): ForecastReservation[] {
  return raw.flatMap((record) => {
    const status = text(record.status); const topIn = dateOnly(record.reservationCheckIn ?? record.startDate); const topOut = dateOnly(record.reservationCheckOut ?? record.endDate);
    const rooms = Array.isArray(record.rooms) ? record.rooms as Raw[] : [];
    const guestRooms = Object.values((record.guestList as Raw | undefined) ?? {}).flatMap((guest) => { const g=guest as Raw; return [...(Array.isArray(g.rooms)?g.rooms:[]), ...(Array.isArray(g.unassignedRooms)?g.unassignedRooms:[])] as Raw[]; });
    const source = rooms.length ? rooms : guestRooms;
    return source.flatMap((room) => { const roomNumber=text(room.roomName ?? room.roomNumber ?? room.assignedRoomNumber); if(!roomNumber)return []; return [{ roomNumber, checkIn:dateOnly(room.roomCheckIn ?? room.checkInDate ?? room.startDate) || topIn, checkOut:dateOnly(room.roomCheckOut ?? room.checkOutDate ?? room.endDate) || topOut, status:text(room.roomStatus)||status, arrivalTime:arrival(room.estimatedArrivalTime ?? room.arrivalTime ?? record.estimatedArrivalTime ?? record.arrivalTime) }]; });
  });
}

export async function calculateLoadForecast(units: Unit[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const start=todaySP(), end=addCivilDays(start,7), inserted:string[]=[];
  for (const unit of units) {
    const property=unit.toLowerCase() as CloudbedsProperty;
    const [raw, configResult, historyResult, daysResult] = await Promise.all([
      fetchPages(property,start,end), supabaseAdmin.from("previsao_carga_config").select("*").eq("unidade",unit).single(),
      supabaseAdmin.from("room_housekeeping_history").select("task_name,started_at,ended_at").eq("property",unit).gte("started_at",new Date(Date.now()-60*86400000).toISOString()),
      supabaseAdmin.from("escala_dias").select("*,escala_colaboradores!escala_dias_colaborador_id_fkey!inner(nome,vinculo,escala_padroes(intervalo_minutos))").eq("unidade",unit).eq("setor","camareiras").gte("data",start).lte("data",end),
    ]);
    if (configResult.error) throw configResult.error; if(historyResult.error)throw historyResult.error; if(daysResult.error)throw daysResult.error;
    const reservations=normalize(raw); const rooms=[...new Set(reservations.map(r=>r.roomNumber))]; const config=configResult.data;
    const aliases:Record<string,string>={"GERAL":"geral_minutos","GERAL - CHECK-IN":"geral_checkin_minutos","TROCA + ARRUMAÇÃO":"troca_arrumacao_minutos","ARRUMAÇÃO":"arrumacao_minutos"};
    const measured=new Map<string,number>();
    for(const task of Object.keys(aliases)){const samples=(historyResult.data??[]).filter(row=>text(row.task_name).toUpperCase()===task).map(row=>(new Date(row.ended_at??"").getTime()-new Date(row.started_at??"").getTime())/60000).filter(n=>n>=5&&n<=180).sort((a,b)=>a-b);if(samples.length>=20)measured.set(task,samples[Math.floor(samples.length/2)]);}
    for(let offset=0;offset<=7;offset++){
      const date=addCivilDays(start,offset), tasks=predictHousekeepingTasks(reservations,rooms,date); const counts=(name:string)=>tasks.filter(t=>t.tarefa===name).length;
      const taskMinutes=(name:string)=>measured.get(name)??Number(config[aliases[name] as keyof typeof config]);
      const load=Math.round(counts("GERAL")*taskMinutes("GERAL")+counts("GERAL - CHECK-IN")*taskMinutes("GERAL - CHECK-IN")+counts("TROCA + ARRUMAÇÃO")*taskMinutes("TROCA + ARRUMAÇÃO")+counts("ARRUMAÇÃO")*taskMinutes("ARRUMAÇÃO"));
      const scheduled=(daysResult.data??[]).filter(row=>row.data===date&&(row.status==="trabalho"||row.status==="extra"));
      const capacityDetails=scheduled.map(row=>{const extra=row.status==="extra";const collaborator=(Array.isArray(row.escala_colaboradores)?row.escala_colaboradores[0]:row.escala_colaboradores) as {nome?:string;escala_padroes?:{intervalo_minutos?:number|null}[]}|null;const pattern=collaborator?.escala_padroes?.find(item=>item.intervalo_minutos!=null);const gross=extra?Number(row.horas_contratadas??0)*60:duration(row.hora_entrada,row.hora_saida);const interval=extra?0:Number(pattern?.intervalo_minutos??0);return {nome:collaborator?.nome??"Camareira",tipo:extra?"freelancer":"fixa",minutos_brutos:gross,intervalo_minutos:interval,minutos_liquidos:Math.max(0,Math.round((gross-interval)*(1-Number(config.margem_pct)/100)))};});
      const capacity=capacityDetails.reduce((sum,item)=>sum+item.minutos_liquidos,0), pct=capacity>0?Math.round(load/capacity*100):load>0?999:0, generals=counts("GERAL")+counts("GERAL - CHECK-IN");
      const level=capacity===0&&load>0||pct>Number(config.limite_vermelho_pct)||generals>=config.limite_vermelho_gerais?"vermelho":pct>=Number(config.limite_amarelo_pct)||generals>=config.limite_amarelo_gerais?"amarelo":"verde";
      const arrivals=tasks.flatMap(task=>task.chegada?[task.chegada]:[]).sort();
      const {data:previous}=await supabaseAdmin.from("previsao_carga").select("nivel").eq("unidade",unit).eq("data",date).order("calculado_em",{ascending:false}).limit(1).maybeSingle();
      const {data:snapshot,error:snapshotError}=await supabaseAdmin.from("previsao_carga").insert({unidade:unit,data:date,horizonte_dias:offset,qtd_geral:counts("GERAL"),qtd_geral_checkin:counts("GERAL - CHECK-IN"),qtd_troca_arrumacao:counts("TROCA + ARRUMAÇÃO"),qtd_arrumacao:counts("ARRUMAÇÃO"),qtd_checkins:reservations.filter(r=>r.checkIn===date).length,qtd_checkouts:reservations.filter(r=>r.checkOut===date).length,carga_minutos:load,capacidade_minutos:capacity,camareiras_escaladas:scheduled.filter(r=>r.status==="trabalho").length,freelancers_escalados:scheduled.filter(r=>r.status==="extra").length,ocupacao_carga_pct:pct,nivel:level,chegada_mais_cedo:arrivals[0]??null,detalhes:tasks,capacidade_detalhes:capacityDetails}).select("id").single();
      if(snapshotError)throw snapshotError; inserted.push(snapshot.id);
      const freelancers=scheduled.filter(r=>r.status==="extra").length;
      // Reforço já escalado: mantém o semáforo calculado, mas não insiste na contratação.
      const reforcoEscalado=freelancers>0;
      const alertType=level==="verde"||reforcoEscalado?null:offset===2?"d2":offset===1&&hourSP()>=16?"lembrete_d1":previous?.nivel&&previous.nivel!==level?"mudanca_nivel":null;
      if(alertType){const{error:alertError}=await supabaseAdmin.from("previsao_carga_alertas").insert({unidade:unit,data:date,nivel:level,previsao_id:snapshot.id,tipo:alertType});if(!alertError){const{data:settings}=await supabaseAdmin.from("app_settings").select("key,value").in("key",["push_dispatcher_url","push_dispatcher_secret"]);const setting=Object.fromEntries((settings??[]).map(item=>[item.key,item.value]));if(setting.push_dispatcher_url&&setting.push_dispatcher_secret)await fetch(String(setting.push_dispatcher_url),{method:"POST",headers:{"Content-Type":"application/json","x-dispatcher-secret":String(setting.push_dispatcher_secret)},body:JSON.stringify({event:"previsao_carga",data:{unidade:unit,data:date,nivel:level,tipo:alertType,gerais:generals,ocupacao_pct:pct}})}).catch(()=>undefined);}}
    }
  }
  return { inserted: inserted.length, calculatedAt:new Date().toISOString() };
}