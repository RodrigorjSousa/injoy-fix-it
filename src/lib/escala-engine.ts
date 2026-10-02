export type CivilDate = `${number}-${number}-${number}`;
export type PatternKind = "12x36" | "5x2_fixo" | "5x2_revezamento" | "6x1";
export type DayStatus = "trabalho" | "folga" | "falta" | "atestado" | "ferias" | "extra";

export type EnginePattern = {
  tipo: PatternKind;
  data_base: string | null;
  folgas_fixas: number[];
  folga_semana_a: number | null;
  folga_semana_b: number | null;
  hora_entrada?: string | null;
  hora_saida?: string | null;
};
export type GeneratedDay = { data: string; status: "trabalho" | "folga" };
export type ValidationPerson = {
  id: string; nome: string; setor: "manutencao" | "recepcao" | "camareiras";
  unidade: "Botafogo" | "Ipanema"; turno: "manha" | "noite" | "dia";
  pattern: EnginePattern; days: { data: string; status: DayStatus; hora_entrada?: string | null; hora_saida?: string | null; origem?: "gerado" | "manual" }[];
};
export type ScheduleIssue = { id: string; severity: "error" | "warning"; code: string; message: string; date?: string; unidade?: "Botafogo" | "Ipanema"; personId?: string };

const DAY_MS = 86_400_000;
export const parseCivilDate = (value: string) => { const [y,m,d] = value.split("-").map(Number); return new Date(Date.UTC(y,m-1,d)); };
export const formatCivilDate = (date: Date): string => `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}-${String(date.getUTCDate()).padStart(2,"0")}`;
export const addCivilDays = (value: string, amount: number) => { const d=parseCivilDate(value); d.setUTCDate(d.getUTCDate()+amount); return formatCivilDate(d); };
export const civilDayDiff = (a: string, b: string) => Math.round((parseCivilDate(a).getTime()-parseCivilDate(b).getTime())/DAY_MS);
export const civilDow = (value: string) => parseCivilDate(value).getUTCDay();
export const monthBounds = (year:number, monthZero:number) => ({ start: `${year}-${String(monthZero+1).padStart(2,"0")}-01`, end: formatCivilDate(new Date(Date.UTC(year,monthZero+1,0))) });
export const civilRange = (start:string,end:string) => { const result:string[]=[]; for(let d=start;d<=end;d=addCivilDays(d,1)) result.push(d); return result; };
const mod=(n:number,m:number)=>((n%m)+m)%m;

export function worksOnDate(pattern: EnginePattern, date: string): boolean {
  const dow=civilDow(date);
  if(pattern.tipo==="5x2_fixo") return !pattern.folgas_fixas.includes(dow);
  if(!pattern.data_base) return false;
  const diff=civilDayDiff(date,pattern.data_base);
  if(pattern.tipo==="12x36") return mod(diff,2)===0;
  if(pattern.tipo==="6x1") return mod(diff,7)!==0;
  const sunday=addCivilDays(date,7-dow);
  const week=Math.floor(civilDayDiff(sunday,pattern.data_base)/7);
  const weekA=mod(week,2)===0;
  const off=new Set(pattern.folgas_fixas);
  off.add(weekA ? (pattern.folga_semana_a ?? 0) : (pattern.folga_semana_b ?? 1));
  return !off.has(dow);
}

export function generatePatternMonth(pattern: EnginePattern, year:number, monthZero:number): GeneratedDay[] {
  const {start,end}=monthBounds(year,monthZero);
  return civilRange(start,end).map(data=>({data,status:worksOnDate(pattern,data)?"trabalho":"folga"}));
}

const isWork=(status:DayStatus)=>status==="trabalho"||status==="extra";
const minutes=(time?:string|null)=>{ if(!time)return null; const [h,m]=time.split(":").map(Number); return h*60+m; };
export function calculateEndTime(start:string,hours:number):string { const total=(minutes(start)??0)+Math.round(hours*60); return `${String(Math.floor(mod(total,1440)/60)).padStart(2,"0")}:${String(mod(total,60)).padStart(2,"0")}`; }

export function validateSchedule(people: ValidationPerson[], holidays: string[] = [], publishedChanges: {date:string;personId:string}[] = []): ScheduleIssue[] {
  const issues:ScheduleIssue[]=[]; const holidaySet=new Set(holidays);
  for(const person of people){
    const sorted=[...person.days].sort((a,b)=>a.data.localeCompare(b.data));
    let streak=0;
    for(let i=0;i<sorted.length;i++){
      const day=sorted[i]; const prev=sorted[i-1];
      if(isWork(day.status)&&(!prev||civilDayDiff(day.data,prev.data)===1&&isWork(prev.status))) streak++; else streak=isWork(day.status)?1:0;
      if(streak===7) issues.push({id:`streak-${person.id}-${day.data}`,severity:"error",code:"seven_days",message:`${person.nome} está com mais de 6 dias seguidos de trabalho.`,date:day.data,unidade:person.unidade,personId:person.id});
      if(person.pattern.tipo==="12x36"&&prev&&civilDayDiff(day.data,prev.data)===1&&isWork(day.status)&&isWork(prev.status)) issues.push({id:`12x36-${person.id}-${day.data}`,severity:"error",code:"12x36_consecutive",message:`${person.nome} tem dois plantões seguidos no 12x36.`,date:day.data,unidade:person.unidade,personId:person.id});
      if((person.pattern.tipo==="5x2_fixo"||person.pattern.tipo==="6x1")&&prev&&isWork(prev.status)&&isWork(day.status)&&prev.hora_saida&&day.hora_entrada){ const end=minutes(prev.hora_saida); const start=minutes(day.hora_entrada); if(end!==null&&start!==null){const rest=(1440-end)+start;if(rest<660)issues.push({id:`rest-${person.id}-${day.data}`,severity:"error",code:"rest_11h",message:`${person.nome} tem menos de 11 horas de descanso.`,date:day.data,unidade:person.unidade,personId:person.id});}}
      if(isWork(day.status)&&holidaySet.has(day.data)&&(person.pattern.tipo==="5x2_fixo"||person.pattern.tipo==="6x1")) issues.push({id:`holiday-${person.id}-${day.data}`,severity:"warning",code:"holiday_work",message:`${person.nome} trabalha em feriado.`,date:day.data,unidade:person.unidade,personId:person.id});
    }
    if(person.setor==="camareiras"&&person.pattern.tipo==="5x2_revezamento"){
      for(const day of sorted){ if(day.status!=="folga")continue; const dow=civilDow(day.data); const next=sorted.find(d=>d.data===addCivilDays(day.data,1)); if(next?.status==="folga"&&dow===5) issues.push({id:`fri-sat-${person.id}-${day.data}`,severity:"error",code:"friday_saturday_off",message:`${person.nome} tem folga seguida na sexta e sábado.`,date:day.data,unidade:person.unidade,personId:person.id}); if(next?.status==="folga"&&dow===6) issues.push({id:`sat-sun-${person.id}-${day.data}`,severity:"error",code:"saturday_sunday_off",message:`${person.nome} tem folga seguida no sábado e domingo.`,date:day.data,unidade:person.unidade,personId:person.id}); }
      const sundays=sorted.filter(d=>civilDow(d.data)===0); for(let i=1;i<sundays.length;i++) if(isWork(sundays[i].status)===isWork(sundays[i-1].status)) issues.push({id:`sunday-${person.id}-${sundays[i].data}`,severity:"error",code:"sunday_alternation",message:`${person.nome} não está alternando os domingos.`,date:sundays[i].data,unidade:person.unidade,personId:person.id});
      const mondayStarts=sorted.filter(d=>parseCivilDate(d.data).getUTCDay()===1); for(const mon of mondayStarts){const week=sorted.filter(d=>d.data>=mon.data&&d.data<=addCivilDays(mon.data,6));if(week.length===7&&week.filter(d=>d.status==="folga").length!==2)issues.push({id:`week-${person.id}-${mon.data}`,severity:"error",code:"weekly_days_off",message:`${person.nome} não tem exatamente 2 folgas na semana.`,date:mon.data,unidade:person.unidade,personId:person.id});}
    }
  }
  const allDates=[...new Set(people.flatMap(p=>p.days.map(d=>d.data)))];
  for(const date of allDates) for(const unidade of ["Botafogo","Ipanema"] as const){ const cams=people.filter(p=>p.setor==="camareiras"&&p.unidade===unidade).flatMap(p=>p.days.filter(d=>d.data===date&&isWork(d.status))); if(!cams.length)issues.push({id:`uncovered-cam-${unidade}-${date}`,severity:"warning",code:"uncovered",message:`Camareiras sem cobertura em ${unidade}.`,date,unidade}); for(const turno of ["manha","noite"] as const){const rec=people.filter(p=>p.setor==="recepcao"&&p.unidade===unidade&&p.turno===turno).flatMap(p=>p.days.filter(d=>d.data===date&&isWork(d.status)));if(!rec.length)issues.push({id:`uncovered-rec-${unidade}-${turno}-${date}`,severity:"warning",code:"uncovered",message:`Recepção ${turno==="manha"?"da manhã":"da noite"} sem cobertura em ${unidade}.`,date,unidade});}}
  for(const change of publishedChanges) issues.push({id:`published-${change.personId}-${change.date}`,severity:"warning",code:"published_change",message:"Escala alterada depois da publicação.",date:change.date,personId:change.personId});
  return issues;
}

export function mergeGeneratedWithManual<T extends { colaborador_id:string; data:string; turno:string; origem:"gerado"|"manual" }>(generated:T[],existing:T[]):T[]{const manual=existing.filter(d=>d.origem==="manual");const keys=new Set(manual.map(d=>`${d.colaborador_id}|${d.data}|${d.turno}`));return [...manual,...generated.filter(d=>!keys.has(`${d.colaborador_id}|${d.data}|${d.turno}`))];}
