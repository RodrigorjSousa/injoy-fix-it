import { describe, expect, it } from "vitest";
import { calculateEndTime, generatePatternMonth, mergeGeneratedWithManual, resolveRevezamento, revezamentoProblemas, validateSchedule, worksOnDate, type EnginePattern, type ValidationPerson } from "./escala-engine";
const p=(tipo:EnginePattern["tipo"],data_base:string|null,folgas_fixas:number[]=[])=>({tipo,data_base,folgas_fixas,folga_semana_a:0,folga_semana_b:1});
describe("escala-engine",()=>{
 it("mantém 12x36 em viradas de mês e ano",()=>{const a=p("12x36","2026-10-31");expect(worksOnDate(a,"2026-10-31")).toBe(true);expect(worksOnDate(a,"2026-11-01")).toBe(false);const b=p("12x36","2026-12-31");expect(worksOnDate(b,"2027-01-01")).toBe(false);});
 it("não escala manutenção no fim de semana",()=>{const days=generatePatternMonth(p("5x2_fixo",null,[0,6]),2026,9);expect(days.filter(d=>[0,6].includes(new Date(`${d.data}T00:00:00Z`).getUTCDay())).every(d=>d.status==="folga")).toBe(true);});
 it("reproduz o revezamento de Ipanema igual à prévia do cadastro",()=>{const x=p("5x2_revezamento","2026-10-04",[3]);const off=["2026-09-28","2026-09-30","2026-10-04","2026-10-07","2026-10-12","2026-10-14","2026-10-18","2026-10-21","2026-10-26","2026-10-28","2026-11-01"];expect(off.every(d=>!worksOnDate(x,d))).toBe(true);expect(["2026-10-05","2026-10-11","2026-10-19","2026-10-25"].every(d=>worksOnDate(x,d))).toBe(true);});
 it("ciclo da Maria: domingo sim/não, 2 folgas por semana, sem sex+sáb/sáb+dom e no máximo 5 dias seguidos",()=>{
  const check=(pattern:EnginePattern)=>{const days:ValidationPerson["days"]=[];for(let m=0;m<12;m++)for(const d of generatePatternMonth(pattern,2027,m))days.push(d);const person:ValidationPerson={id:"m",nome:"Maria",setor:"camareiras",unidade:"Ipanema",turno:"dia",pattern,days};return validateSchedule([person]).filter(i=>i.severity==="error");};
  for(let fixa=1;fixa<=6;fixa++)for(let b=1;b<=6;b++){const pattern={...p("5x2_revezamento","2026-10-04",[fixa]),folga_semana_b:b};expect(check(pattern)).toEqual([]);}
  expect(check({...p("5x2_revezamento","2026-10-04",[]),folga_semana_b:1})).toEqual([]);
  expect(check({...p("5x2_revezamento","2026-10-04",[5,6]),folga_semana_b:1})).toEqual([]);
 });
 it("cadastro válido não é alterado e cadastro inválido é ajustado mantendo a folga fixa",()=>{
  const ok=resolveRevezamento({folgas_fixas:[3],folga_semana_a:0,folga_semana_b:1});expect(ok.ajustado).toBe(false);expect(ok.semanaDomingoFolga).toEqual([0,3]);expect(ok.semanaDomingoTrabalho).toEqual([1,3]);
  const bad=resolveRevezamento({folgas_fixas:[6],folga_semana_a:0,folga_semana_b:5});expect(bad.ajustado).toBe(true);expect(bad.problemasDoCadastro.join(" ")).toMatch(/sábado e domingo|sexta e sábado/);expect(revezamentoProblemas(bad.semanaDomingoFolga,bad.semanaDomingoTrabalho)).toEqual([]);
  expect(revezamentoProblemas([0,1],[1,3])).toContain("trabalha 6 dias seguidos (máximo 5)");
 });
 it("detecta sexta+sábado, sábado+domingo e 7 dias",()=>{const pattern=p("5x2_revezamento","2026-10-04",[3]);const days:ValidationPerson["days"]=Array.from({length:12},(_,i)=>({data:`2026-10-${String(i+1).padStart(2,"0")}`,status:"trabalho"}));days[1].status="folga";days[2].status="folga";days[3].status="folga";const person:ValidationPerson={id:"1",nome:"Maria",setor:"camareiras",unidade:"Ipanema",turno:"dia",pattern,days};const codes=validateSchedule([person]).map(i=>i.code);expect(codes).toContain("friday_saturday_off");expect(codes).toContain("saturday_sunday_off");expect(validateSchedule([{...person,days:Array.from({length:7},(_,i)=>({data:`2026-10-${String(i+1).padStart(2,"0")}`,status:"trabalho" as const}))}]).map(i=>i.code)).toContain("seven_days");});
 it("preserva manual e calcula saída",()=>{type Row={colaborador_id:string;data:string;turno:string;origem:"gerado"|"manual"};const g:Row[]=[{colaborador_id:"1",data:"2026-10-01",turno:"dia",origem:"gerado"}];const m:Row[]=[{...g[0],origem:"manual"}];expect(mergeGeneratedWithManual(g,m)).toEqual(m);expect(calculateEndTime("20:00",12)).toBe("08:00");});
});
