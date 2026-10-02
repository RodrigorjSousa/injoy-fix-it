import { usePrevisaoMedianas } from "@/lib/previsao-carga";

export function PrevisaoMedianas({unidade}:{unidade:string}){
  const rows=(usePrevisaoMedianas().data??[]).filter(row=>row.unidade===unidade);
  return <div className="rounded-md border bg-muted/30 p-3">
    <p className="mb-2 text-sm font-bold">Tempos reais dos últimos 60 dias</p>
    {rows.length?<div className="grid gap-2 sm:grid-cols-2">{rows.map(row=><p key={row.tarefa} className="text-xs"><strong>{row.tarefa}:</strong> {Math.round(Number(row.mediana_minutos))} min · {row.amostras} registros {row.amostras<20&&"(usando padrão abaixo)"}</p>)}</div>:<p className="text-xs text-muted-foreground">Ainda não há histórico suficiente; os tempos editáveis abaixo serão usados.</p>}
  </div>;
}
