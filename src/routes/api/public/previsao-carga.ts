import { createFileRoute } from "@tanstack/react-router";
import { calculateLoadForecast } from "@/lib/previsao-carga.server";

export const Route = createFileRoute("/api/public/previsao-carga")({ server:{ handlers:{ POST:async({request})=>{
  const provided=request.headers.get("x-cron-secret"), expected=process.env.CRON_SHARED_SECRET;
  if(!expected||provided!==expected)return new Response("Unauthorized",{status:401});
  try{return Response.json(await calculateLoadForecast(["Botafogo","Ipanema"]));}catch(error){console.error("[previsao-carga]",error);return Response.json({error:"Falha ao calcular previsão"},{status:500});}
} } } });