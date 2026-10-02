import { createFileRoute, Link } from "@tanstack/react-router";
import { Fingerprint } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireGestor } from "@/lib/require-gestor";
import { usePendenciasPonto } from "@/lib/ponto";
import { PendenciasPonto } from "@/components/ponto/pendencias-ponto";
import { RelatorioPonto } from "@/components/ponto/relatorio-ponto";
import { CadastroFacial } from "@/components/ponto/cadastro-facial";
import { ConfigPonto } from "@/components/ponto/config-ponto";

export const Route = createFileRoute("/_authenticated/gestor/ponto")({
  beforeLoad: () => requireGestor(),
  head: () => ({
    meta: [
      { title: "Ponto Facial — Área do Gestor" },
      {
        name: "description",
        content: "Batidas, pendências, cadastro facial e relatório do ponto interno.",
      },
    ],
  }),
  component: GestorPonto,
});

function GestorPonto() {
  const pend = usePendenciasPonto();
  const qtd = pend.data?.length ?? 0;
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Badge variant="secondary" className="mb-2">
            <Fingerprint className="mr-1 h-3 w-3" />
            Equipe
          </Badge>
          <h1 className="text-2xl font-bold">Ponto Facial</h1>
          <p className="text-sm text-muted-foreground">
            Controle interno comparado com a escala. O ponto oficial continua na{" "}
            <Link to="/controle-ponto" className="underline">
              Pontomais
            </Link>
            .
          </p>
        </div>
      </header>
      <Tabs defaultValue="pendencias">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="pendencias">Pendências{qtd ? ` (${qtd})` : ""}</TabsTrigger>
          <TabsTrigger value="relatorio">Relatório</TabsTrigger>
          <TabsTrigger value="cadastro">Cadastro facial</TabsTrigger>
          <TabsTrigger value="config">Configurações</TabsTrigger>
        </TabsList>
        <TabsContent value="pendencias" className="mt-4">
          <PendenciasPonto />
        </TabsContent>
        <TabsContent value="relatorio" className="mt-4">
          <RelatorioPonto />
        </TabsContent>
        <TabsContent value="cadastro" className="mt-4">
          <CadastroFacial />
        </TabsContent>
        <TabsContent value="config" className="mt-4">
          <ConfigPonto />
        </TabsContent>
      </Tabs>
    </div>
  );
}
