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
  pattern: EnginePattern; /** Freelancer: só conta para a cobertura do dia, sem regras de padrão. */ freelance?: boolean; days: { data: string; status: DayStatus; hora_entrada?: string | null; hora_saida?: string | null; origem?: "gerado" | "manual" }[];
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
  // 5x2 revezamento: ciclo de 14 dias que começa no domingo de folga (semana A = domingo a sábado
  // com folga no domingo; semana B = domingo trabalhado). Mesma regra da prévia do cadastro.
  const cycle=resolveRevezamento(pattern);
  const idx=mod(civilDayDiff(date,revezamentoAnchor(pattern.data_base)),14);
  const off=idx<7?cycle.semanaDomingoFolga:cycle.semanaDomingoTrabalho;
  return !off.includes(dow);
}

export const DIAS_SEMANA=["domingo","segunda","terça","quarta","quinta","sexta","sábado"] as const;
export const MAX_DIAS_SEGUIDOS_REVEZAMENTO=5;
/** Domingo de folga que ancora o ciclo (o próprio data_base, ou o domingo anterior a ele). */
export const revezamentoAnchor=(dataBase:string)=>addCivilDays(dataBase,-civilDow(dataBase));
export type RevezamentoCycle={
  /** Dias da semana (0=domingo) de folga na semana em que folga no domingo. */
  semanaDomingoFolga:number[];
  /** Dias da semana de folga na semana em que trabalha no domingo. */
  semanaDomingoTrabalho:number[];
  /** true quando o cadastro quebrava alguma regra e o gerador escolheu as folgas válidas mais próximas. */
  ajustado:boolean;
  configurado:{semanaDomingoFolga:number[];semanaDomingoTrabalho:number[]};
  problemasDoCadastro:string[];
  maiorSequencia:number;
};
const lexLess=(x:number[],y:number[])=>{for(let i=0;i<x.length;i++){if(x[i]!==y[i])return x[i]<y[i];}return false;};
const uniqSorted=(xs:number[])=>[...new Set(xs.filter(x=>Number.isInteger(x)&&x>=0&&x<=6))].sort((a,b)=>a-b);
function cycleFlags(a:number[],b:number[]){return Array.from({length:14},(_,i)=>(i<7?a:b).includes(i%7));}
function longestCyclicStreak(off:boolean[]){if(off.every(o=>!o))return off.length;let best=0,run=0;for(let i=0;i<off.length*2;i++){if(off[i%off.length])run=0;else{run++;best=Math.max(best,run);}}return Math.min(best,off.length);}
/** Regras do 5x2 revezamento (camareira de Ipanema) aplicadas a um ciclo de 2 semanas. */
export function revezamentoProblemas(a:number[],b:number[]):string[]{
  const problems:string[]=[];
  if(!a.includes(0))problems.push("não folga no domingo na semana de domingo de folga");
  if(b.includes(0))problems.push("folga em dois domingos seguidos");
  if(a.length!==2||b.length!==2)problems.push("não tem exatamente 2 folgas por semana");
  const off=cycleFlags(a,b);
  for(let i=0;i<14;i++){if(!off[i]||!off[(i+1)%14])continue;const dow=i%7;if(dow===5)problems.push("folga sexta e sábado juntos");if(dow===6)problems.push("folga sábado e domingo juntos");}
  const streak=longestCyclicStreak(off);
  if(streak>MAX_DIAS_SEGUIDOS_REVEZAMENTO)problems.push(`trabalha ${streak} dias seguidos (máximo ${MAX_DIAS_SEGUIDOS_REVEZAMENTO})`);
  return [...new Set(problems)];
}
/**
 * Lê o cadastro (folga fixa + segunda folga da semana em que trabalha domingo) e devolve o ciclo usado
 * pelo gerador. Se o cadastro quebrar alguma regra, escolhe o ciclo válido mais parecido, mantendo
 * primeiro as folgas fixas, depois o maior número de dias iguais e por fim a menor sequência de trabalho.
 */
export function resolveRevezamento(pattern:Pick<EnginePattern,"folgas_fixas"|"folga_semana_a"|"folga_semana_b">):RevezamentoCycle{
  const fixed=uniqSorted(pattern.folgas_fixas??[]);
  const a=uniqSorted([...fixed,pattern.folga_semana_a??0]);
  const b=uniqSorted([...fixed,pattern.folga_semana_b??1]);
  const problems=revezamentoProblemas(a,b);
  const configurado={semanaDomingoFolga:a,semanaDomingoTrabalho:b};
  if(problems.length===0)return {semanaDomingoFolga:a,semanaDomingoTrabalho:b,ajustado:false,configurado,problemasDoCadastro:[],maiorSequencia:longestCyclicStreak(cycleFlags(a,b))};
  const diff=(x:number[],y:number[])=>x.filter(v=>!y.includes(v)).length+y.filter(v=>!x.includes(v)).length;
  let best:{a:number[];b:number[];score:number[]}|null=null;
  for(let x=1;x<=6;x++)for(let y=1;y<=6;y++)for(let z=y+1;z<=6;z++){
    const ca=[0,x],cb=[y,z];
    if(revezamentoProblemas(ca,cb).length)continue;
    const fixedLost=fixed.filter(f=>f!==0&&!(ca.includes(f)&&cb.includes(f))).length;
    const score=[fixedLost,diff(a,ca)+diff(b,cb),longestCyclicStreak(cycleFlags(ca,cb))];
    if(!best||lexLess(score,best.score))best={a:ca,b:cb,score};
  }
  const chosen=best??{a,b};
  return {semanaDomingoFolga:chosen.a,semanaDomingoTrabalho:chosen.b,ajustado:true,configurado,problemasDoCadastro:problems,maiorSequencia:longestCyclicStreak(cycleFlags(chosen.a,chosen.b))};
}
export const descreverRevezamento=(c:Pick<RevezamentoCycle,"semanaDomingoFolga"|"semanaDomingoTrabalho">)=>
  `Semana com domingo de folga: ${c.semanaDomingoFolga.map(d=>DIAS_SEMANA[d]).join(" e ")}. Semana com domingo de trabalho: ${c.semanaDomingoTrabalho.map(d=>DIAS_SEMANA[d]).join(" e ")}.`;

export function generatePatternMonth(pattern: EnginePattern, year:number, monthZero:number): GeneratedDay[] {
  const {start,end}=monthBounds(year,monthZero);
  return civilRange(start,end).map(data=>({data,status:worksOnDate(pattern,data)?"trabalho":"folga"}));
}

const isWork=(status:DayStatus)=>status==="trabalho"||status==="extra";
/** Férias, atestado e falta: a semana não entra nas regras de folga do revezamento. */
const isAbsence=(status:DayStatus)=>status==="ferias"||status==="atestado"||status==="falta";
const minutes=(time?:string|null)=>{ if(!time)return null; const [h,m]=time.split(":").map(Number); return h*60+m; };
export function calculateEndTime(start:string,hours:number):string { const total=(minutes(start)??0)+Math.round(hours*60); return `${String(Math.floor(mod(total,1440)/60)).padStart(2,"0")}:${String(mod(total,60)).padStart(2,"0")}`; }

export function validateSchedule(people: ValidationPerson[], holidays: string[] = [], publishedChanges: {date:string;personId:string}[] = []): ScheduleIssue[] {
  const issues:ScheduleIssue[]=[]; const holidaySet=new Set(holidays);
  for(const person of people){
    if(person.freelance)continue;
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
      const sundays=sorted.filter(d=>civilDow(d.data)===0); for(let i=1;i<sundays.length;i++) if(!isAbsence(sundays[i].status)&&!isAbsence(sundays[i-1].status)&&isWork(sundays[i].status)===isWork(sundays[i-1].status)) issues.push({id:`sunday-${person.id}-${sundays[i].data}`,severity:"error",code:"sunday_alternation",message:`${person.nome} não está alternando os domingos.`,date:sundays[i].data,unidade:person.unidade,personId:person.id});
      const sundayStarts=sorted.filter(d=>civilDow(d.data)===0); for(const sun of sundayStarts){const week=sorted.filter(d=>d.data>=sun.data&&d.data<=addCivilDays(sun.data,6));if(week.length===7&&!week.some(d=>isAbsence(d.status))&&week.filter(d=>d.status==="folga").length!==2)issues.push({id:`week-${person.id}-${sun.data}`,severity:"error",code:"weekly_days_off",message:`${person.nome} não tem exatamente 2 folgas na semana (domingo a sábado).`,date:sun.data,unidade:person.unidade,personId:person.id});}
      let run=0; let prevDate:string|null=null; for(const day of sorted){ if(isWork(day.status)&&prevDate&&civilDayDiff(day.data,prevDate)===1&&run>0) run++; else run=isWork(day.status)?1:0; prevDate=day.data; if(run===MAX_DIAS_SEGUIDOS_REVEZAMENTO+1) issues.push({id:`max5-${person.id}-${day.data}`,severity:"error",code:"max_5_days",message:`${person.nome} está com mais de ${MAX_DIAS_SEGUIDOS_REVEZAMENTO} dias seguidos de trabalho.`,date:day.data,unidade:person.unidade,personId:person.id}); }
    }
  }
  const allDates=[...new Set(people.flatMap(p=>p.days.map(d=>d.data)))];
  for(const date of allDates) for(const unidade of ["Botafogo","Ipanema"] as const){ const cams=people.filter(p=>p.setor==="camareiras"&&p.unidade===unidade).flatMap(p=>p.days.filter(d=>d.data===date&&isWork(d.status))); if(!cams.length)issues.push({id:`uncovered-cam-${unidade}-${date}`,severity:"warning",code:"uncovered",message:`Camareiras sem cobertura em ${unidade}.`,date,unidade}); for(const turno of ["manha","noite"] as const){const rec=people.filter(p=>p.setor==="recepcao"&&p.unidade===unidade&&p.turno===turno).flatMap(p=>p.days.filter(d=>d.data===date&&isWork(d.status)));if(!rec.length)issues.push({id:`uncovered-rec-${unidade}-${turno}-${date}`,severity:"warning",code:"uncovered",message:`Recepção ${turno==="manha"?"da manhã":"da noite"} sem cobertura em ${unidade}.`,date,unidade});}}
  for(const change of publishedChanges) issues.push({id:`published-${change.personId}-${change.date}`,severity:"warning",code:"published_change",message:"Escala alterada depois da publicação.",date:change.date,personId:change.personId});
  return issues;
}

export function mergeGeneratedWithManual<T extends { colaborador_id:string; data:string; turno:string; origem:"gerado"|"manual" }>(generated:T[],existing:T[]):T[]{const manual=existing.filter(d=>d.origem==="manual");const keys=new Set(manual.map(d=>`${d.colaborador_id}|${d.data}|${d.turno}`));return [...manual,...generated.filter(d=>!keys.has(`${d.colaborador_id}|${d.data}|${d.turno}`))];}

/**
 * Férias: todos os dias do período ficam como "ferias" para quem sai, e a freelancer cobre só os dias
 * em que a pessoa trabalharia. Vale o que já está na escala (trabalho/folga, inclusive trocas manuais);
 * dias ainda não gerados (ou já marcados como férias) seguem o padrão da pessoa.
 */
export function planejarFerias(pattern:EnginePattern,inicio:string,fim:string,existentes:{data:string;status:DayStatus}[]=[]):{diasFerias:string[];diasCobertura:string[]}{
  if(fim<inicio)return {diasFerias:[],diasCobertura:[]};
  const byDate=new Map(existentes.map(d=>[d.data,d.status]));
  const diasFerias=civilRange(inicio,fim);
  const diasCobertura=diasFerias.filter(data=>{const st=byDate.get(data);if(st==="trabalho"||st==="extra")return true;if(st==="folga")return false;return worksOnDate(pattern,data);});
  return {diasFerias,diasCobertura};
}
