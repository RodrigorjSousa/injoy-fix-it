import { Card } from "@/components/ui/card";
import { useCalibracaoPrevisao } from "@/lib/previsao-carga";

export function PrevisaoCalibracao(){
  const rows=useCalibracaoPrevisao().data??[];
  const count=(result:string)=>rows.filter(row=>row.result===result).length;
  return <section className="space-y-3">
    <h2 className="text-lg font-black">Calibração dos últimos 30 dias</h2>
    <div className="grid gap-3 sm:grid-cols-3">
      <Card className="p-4"><p className="text-xs font-bold text-muted-foreground">Alertas que acertaram</p><p className="mt-1 text-2xl font-black text-emerald-700">{count("acerto")}</p></Card>
      <Card className="p-4"><p className="text-xs font-bold text-muted-foreground">Alarmes falsos</p><p className="mt-1 text-2xl font-black text-amber-700">{count("alarme_falso")}</p></Card>
      <Card className="p-4"><p className="text-xs font-bold text-muted-foreground">Dias pesados não detectados</p><p className="mt-1 text-2xl font-black text-red-700">{count("nao_detectado")}</p></Card>
    </div>
    {rows.length>0&&<p className="text-sm text-muted-foreground">{count("alarme_falso")>count("nao_detectado")?"Sugestão: considere elevar os limites de gerais.":count("nao_detectado")>0?"Sugestão: considere reduzir os limites de gerais.":"Os limites atuais estão coerentes com o histórico disponível."}</p>}
  </section>;
}
