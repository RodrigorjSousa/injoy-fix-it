# PROJETO INJOY — WhatsApp humanizado com IA

Leia antes o `00-CONTEXTO-GERAL.md`.

## Objetivo
Atender hóspedes e interessados pelo WhatsApp com IA, em tom humano e com a linguagem da IN.JOY,
e passar para uma pessoa quando for preciso. A IA usa o que o sistema já sabe: reservas e dados do
Cloudbeds, check-in e check-out, totem e regras das unidades.

## Regras definidas pelo Rodrigo
- **Nenhuma mensagem real a hóspede sai sem autorização do Rodrigo.** Até ele liberar, a IA só
  sugere respostas (modo rascunho) ou roda com números de teste.
- Ipanema não tem recepção: quem atende é a recepção de Botafogo. A passagem para humano vai sempre
  para a recepção de Botafogo (e para o gestor, se for o caso).

## O que já existe no código (levantamento de 13/10/2026)
Não existe integração com WhatsApp. Só há links e textos para copiar:
- **Escala:** `src/routes/_authenticated/gestor/escala.tsx` abre `wa.me/?text=` (equipe) e
  `wa.me/<telefone>?text=` (pessoa) para compartilhar a escala.
- **Check-in digital (recepção):** `src/components/recepcao/check-in-digital-modal.tsx`, botão
  "Copiar mensagem para WhatsApp" com a senha da porta e as instruções (tecla #). O texto pode virar
  o modelo da mensagem de boas-vindas.
- **Totem:** `totem_dispositivos.telefone_suporte` ("Telefone/WhatsApp mostrado ao hóspede"),
  editado em Área do Gestor › Totem.

Peças reaproveitáveis:
- **Webhook público:** padrão de `src/routes/api/public/cloudbeds-webhook.ts` (rota
  `/api/public/...` com GET/POST). Serve para receber as mensagens do WhatsApp.
- **IA:** `src/lib/transcribe.functions.ts` já chama o gateway do Lovable
  (`ai.gateway.lovable.dev`, `LOVABLE_API_KEY`). A mesma chave dá acesso a modelos de texto e à
  transcrição de áudio (hóspede que manda áudio).
- **Dados para a IA responder:** `src/lib/cloudbeds-reservas.functions.ts`,
  `supabase/functions/_shared/cloudbeds-quarto.ts`, `src/lib/totem/totem.server.ts` (horários de
  check-in/check-out e regras por unidade), `tuya_password_logs` (senha da porta).
- **Avisar a equipe:** push (`src/lib/push-sender.server.ts`).

## Opções de integração (pesquisa de 13/10/2026; conferir preços antes de contratar)

### Custos da Meta (valem para as opções A e B)
- Cobrança **por mensagem** desde 01/07/2025.
- **Desde 01/10/2026** as respostas livres dentro da janela de 24 h (mensagens de serviço) passaram a
  ser cobradas acima de **1.000 por número por mês**; templates de utilidade dentro da janela também.
  Mensagens recebidas continuam grátis. Antes de contratar, confirmar a tabela oficial da Meta para o
  Brasil.
- Valores aproximados para o Brasil em 2026: marketing R$ 0,31–0,38; utilidade R$ 0,04–0,05;
  autenticação R$ 0,15–0,19 por mensagem.
- Faturamento em reais (BRL) liberado para o Brasil no 2º semestre de 2026. A moeda de uma conta não
  muda depois.
- Ordem de grandeza para a IN.JOY (31 quartos): algo como 1.500 respostas por mês dá ~500 acima da
  franquia × ~R$ 0,05 ≈ R$ 25/mês, mais os templates enviados fora da janela (lembrete de chegada,
  senha, pedido de avaliação) a ~R$ 0,05 cada. Custo da IA à parte (medir no piloto).

### A. API oficial direto na Meta (WhatsApp Cloud API)
- Sem mensalidade de intermediário; paga só a Meta.
- Exige Meta Business verificado, número dedicado à API e templates aprovados para iniciar conversa.
- **Coexistência:** dá para ligar o número que já usa o app WhatsApp Business. O app continua
  funcionando (a recepção vê e responde tudo), o que é enviado pela API aparece no app e o que a
  recepção manda pelo app chega ao nosso webhook. Condições: o app precisa ser aberto pelo menos a
  cada 13 dias; contas novas podem não ser elegíveis; WhatsApp para Windows não funciona como
  aparelho vinculado.
- Risco: configuração inicial mais técnica (Meta for Developers, token, webhook).

### B. Provedor oficial (BSP) — ex.: 360dialog, Twilio, Zenvia, Blip
- Mesma API oficial, com onboarding e suporte do provedor.
- 360dialog: ~€ 49/mês por número (plano Regular), repassando as tarifas da Meta sem acréscimo.
- Zenvia/Blip: painel de atendimento pronto, preço sob consulta (em geral bem mais caro).
- Risco: mais um fornecedor e mensalidade.

### C. API não oficial (WhatsApp Web por QR code) — ex.: Z-API, Evolution API
- Z-API: R$ 99,99/mês por número. Evolution API: código aberto, mas precisa de servidor próprio.
- Não usa a API da Meta e vai contra os termos do WhatsApp: **risco de banimento do número**, que
  pode ser o número que os hóspedes já conhecem. Não recomendado para o número principal.

### Regra da Meta sobre IA (desde 15/01/2026)
A Meta proíbe na API **chatbots de uso geral** (tipo ChatGPT). Assistente de atendimento de um
negócio (reservas, dúvidas da estadia, suporte) é permitido. Por isso a IA da IN.JOY deve se limitar
ao hotel e ter sempre a saída para uma pessoa.

## Proposta de arquitetura (a decidir)
1. Webhook `/api/public/whatsapp-webhook` recebe as mensagens e grava em tabelas próprias
   (conversas, mensagens, passagem para humano).
2. A IA monta a resposta com o contexto da reserva (busca pelo telefone no Cloudbeds) e um guia de
   tom da IN.JOY.
3. **Fase 1 — rascunho:** a IA só sugere; a recepção aprova ou edita numa tela do app. Nada sai
   sozinho.
4. **Fase 2 — automático para perguntas simples** (horários, endereço, wi-fi, como usar o totem),
   com regra de passar para humano em reclamação, pagamento, cancelamento, pedido fora do comum ou
   quando a IA não tiver certeza.
5. **Fase 3 — mensagens ativas** com templates (pré-chegada, senha da porta, avaliação), só depois
   de autorizadas.

## Estado atual
- 13/10/2026: levantamento do que existe e das opções de integração. Nenhum código ainda. Aguardando
  decisão do Rodrigo sobre o caminho (A, B ou C), o número e por qual fase começar.

## Ideias e pendências
- Guia de tom da IN.JOY (exemplos de mensagens reais da recepção ajudam muito).
- Perguntas frequentes por unidade (endereço, acesso, horários, wi-fi, estacionamento, bagagem).
- Ligar ao fluxo do totem: mandar o link/instruções do Express check-in na véspera da chegada.
