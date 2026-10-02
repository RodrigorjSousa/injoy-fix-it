import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertCircle, ArrowUpRight, CalendarClock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { currency } from "@/lib/financeiro";
import { todaySP } from "@/lib/tz";

export function FinanceiroAlertas(){
 const {data,isLoading}=useQuery({queryKey:["financeiro-alertas",todaySP()],queryFn:async()=>{const today=todaySP();const d=new Date(`${today}T12:00:00`);d.setDate(d.getDate()+3);const until=d.toISOString().slice(0,10);const {data,error}=await supabase.from("fin_lancamentos").select("id,descricao,valor,data_vencimento,status").eq("tipo","despesa").eq("status","a_pagar").lte("data_vencimento",until).order("data_vencimento");if(error)throw error;return(data??[]).filter(item=>item.data_vencimento);}});
 if(isLoading)return <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"><Loader2 className="h-5 w-5 animate-spin text-primary"/><p className="text-sm font-semibold">Carregando alertas financeiros…</p></div>;
 if(!data?.length)return <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-success"><AlertCircle className="h-5 w-5"/><div><p className="text-xs font-bold uppercase">Alertas</p><p className="text-sm font-semibold">Nenhum alerta</p></div></div>;
 const overdue=data.filter(item=>(item.data_vencimento??"")<todaySP());const upcoming=data.filter(item=>(item.data_vencimento??"")>=todaySP());
 return <Link to="/gestor/financeiro" className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive transition-colors hover:bg-destructive/15"><AlertCircle className="h-5 w-5 shrink-0"/><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase">Alertas financeiros</p><p className="text-sm font-semibold">{overdue.length?`${overdue.length} vencida(s) · `:""}{upcoming.length} vencendo em até 3 dias</p><p className="truncate text-xs">Total: {currency.format(data.reduce((sum,item)=>sum+Number(item.valor),0))}</p></div><CalendarClock className="h-5 w-5"/><ArrowUpRight className="h-4 w-4"/></Link>;
}