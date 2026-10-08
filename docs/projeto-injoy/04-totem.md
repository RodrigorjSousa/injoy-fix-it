# PROJETO INJOY — Totem (auto check-in, check-out e avaliação)

Leia antes o `00-CONTEXTO-GERAL.md`.

## Objetivo
Um totem (tablet fixo) na unidade para o hóspede:
1. fazer o **check-in sozinho** e receber a senha da porta;
2. fazer o **check-out**;
3. **avaliar a estadia**, alimentando a Bonificação e as notas de qualidade.

Ipanema não tem recepção fixa, então o totem é especialmente útil lá.

## O que já existe e pode ser reaproveitado
- **Check-in digital com fechaduras Tuya:** `src/routes/_authenticated/check-in-digital.tsx`,
  `src/lib/tuya-devices.ts` (resolve fechadura do quarto + portão/porta de vidro da unidade),
  tabela `tuya_devices` e a edge function `supabase/functions/tuya-password`. Hoje há um piloto no
  quarto 005 de Botafogo.
- **Check-out no Cloudbeds:** `src/lib/cloudbeds-checkout.functions.ts` (`cloudbedsCheckoutRoom`)
  muda a reserva `checked_in` → `checked_out`. Foi pensado para Ipanema e hoje é usado pelo gestor e
  pelas camareiras.
- **Reservas e pagamentos:** `src/lib/cloudbeds-reservas.functions.ts` e
  `reservation-payment.functions.ts` (`/postPayment`: dinheiro, crédito, débito e Pix).
- **Avaliações / Bonificação:** `registros_bonificacao` + RPC `registrar_bonificacao_conjunta`
  (notas de funcionários, limpeza e geral, mais elogio).

## Pontos de atenção
- O totem fica sem login de funcionário. Vai precisar de um modo quiosque seguro: um usuário
  técnico ou um token do aparelho, com funções SECURITY DEFINER limitadas ao que o totem pode fazer.
- Antes de liberar a senha da porta, conferir a identidade do hóspede (nome, documento ou código da
  reserva).
- Credenciais do Cloudbeds e da Tuya ficam só no servidor (server functions e edge functions), nunca
  no navegador.

## Estado atual
Entrega 1 (branch `totem-checkin-checkout`, migração `0041_totem_checkin_checkout.sql`):
check-in e check-out pelo totem + avaliação rápida no check-out.

### Como funciona
- **Tela do hóspede:** `/totem` (`src/routes/totem.tsx`, `src/components/totem/totem-app.tsx`), fora de
  `_authenticated` e sem o menu da equipe. Idiomas PT/EN/ES (`src/lib/totem/i18n.ts`); volta sozinha ao
  início depois de 1–3 min sem toque e sempre recomeça em português.
- **Modo quiosque:** o gestor cadastra o totem em **Área do Gestor › Totem** (`gestor/totem.tsx`) e gera um
  código de pareamento de 8 caracteres (RPC `totem_gerar_pareamento`, vale 15 min e uma única vez). O
  tablet troca esse código por um token próprio (só o sha256 fica no banco, em
  `totem_dispositivos.token_hash`). "Desconectar tablet" apaga o hash.
- **Servidor:** `src/lib/totem.functions.ts` (server functions sem login, sempre com o token) e
  `src/lib/totem/totem.server.ts` (chave de serviço, Cloudbeds e Tuya). As regras puras ficam em
  `src/lib/totem/regras.ts`, com testes em `regras.test.ts`. A confirmação refaz toda a conferência.
- **Check-in:** a reserva é identificada por **código (Cloudbeds ou canal) + sobrenome** ou por
  **nome completo + documento** do Cloudbeds. A senha só sai se:
  - a chegada for hoje (ou ontem, se ainda for antes das 6h);
  - já tiver passado de `hora_checkin`;
  - o quarto estiver atribuído;
  - o quarto estiver `clean`/`inspected` em `room_housekeeping`, se `exige_quarto_limpo`;
  - não houver saldo em aberto, se `bloqueia_saldo_aberto`;
  - o quarto tiver fechadura em `tuya_devices`.

  Se tudo bater, o totem gera uma senha Tuya válida até `hora_checkout` do dia da saída e grava em
  `tuya_password_logs` com `reservation_id`. Depois faz `putReservation status=checked_in` no Cloudbeds.
  Se o Cloudbeds recusar, a senha é entregue mesmo assim e a recepção recebe um recado. Se o hóspede já
  está hospedado e tem senha válida, o totem mostra a mesma senha de novo.
- **Check-out:** número do quarto + sobrenome. O totem faz `postRoomCheckOut`, revoga as senhas do quarto
  (só as da própria reserva ou as antigas sem reserva), grava em `cloudbeds_checkout_logs`, manda recado
  para a recepção e abre a avaliação de 1 a 5 estrelas com comentário (`totem_avaliacoes`). A avaliação só
  é aceita até 30 min depois do check-out feito no mesmo totem.
- **Proteção:** depois de 5 identificações erradas em 10 minutos, o totem pausa. Todo uso fica em
  `totem_eventos` e aparece no histórico da tela do gestor.

### Entrega 2: balcão Express com 2 tablets (migração `0042_totem_modo.sql`)
- **Equipamento:** Xiaomi Redmi Pad Pro 12.1 (8 GB/256 GB) em **paisagem**. A tela foi desenhada para
  1280×800 (a resolução que o navegador usa nesse tablet) e não rola.
- **Função de cada tablet:** `totem_dispositivos.modo` pode ser `checkin`, `checkout` ou `ambos`. O gestor
  escolhe em Área do Gestor › Totem. O servidor recusa a ação que não for a do tablet (`exigirModo`).
  - Tablet de check-in: abre direto em "Como você quer encontrar sua reserva?".
  - Tablet de check-out: abre direto no número do quarto.
- **Layout:**
  - **Coluna da esquerda:** marca IN JOY (igual à placa do hall), relógio, título, etapas 1-2-3, ajuda
    e idioma.
  - **Painel da direita:** a ação.
  - **Teclado:** desenhado na própria tela. O teclado do Android nunca abre e não cobre o formulário.
  - **Inatividade:** depois de um tempo sem toque aparece "Ainda está aí?" com contagem de 15 s e o
    totem volta ao início.
- **Trava de quiosque (no app):**
  - No aparelho pareado, qualquer endereço do app (login da equipe, painel...) redireciona para
    `/totem` (`__root.tsx`, chave `injoy.totem.token`).
  - Na tela do totem: sem "voltar", sem menu de toque longo, sem zoom, tela sempre acesa (Wake Lock)
    e tela cheia ao primeiro toque.
  - Para liberar o aparelho, use **Desconectar tablet** na Área do Gestor. Em até 10 minutos (ou no
    próximo uso) o tablet perde o token e volta à tela de pareamento.
- **Só o tablet usa o totem:** as funções do totem exigem o token do aparelho. Quem abrir `/totem` em
  outro celular ou computador vê só a tela de pareamento, que pede um código que só o gestor gera.

### Configurar cada tablet (uma vez)
1. Ligue o tablet, conecte ao Wi-Fi da unidade e atualize o sistema. Não é preciso conta Google pessoal.
2. Instale o **Fully Kiosk Browser** pela Play Store. A licença *Plus* é paga por aparelho e libera o
   modo quiosque completo.
3. No Fully Kiosk, em **Settings**:
   - *Web Content Settings › Start URL*: `https://<endereço do app>/totem`
   - *Web Content Settings*: desligar **Pull to Refresh**
   - *Kiosk Mode*: ligar, com **Kiosk Exit PIN** (anote e guarde com a gerência), ligar
     **Disable Status Bar** e **Disable Navigation Bar**
   - *Web Content Settings › URL Whitelist*: `https://<endereço do app>/totem*`
   - *Device Management*: **Keep Screen On**, **Launch on Boot**, **Screen Orientation: Landscape**
4. No Android (HyperOS):
   - *Bateria › Fully Kiosk*: **Sem restrições**
   - *Apps › Fully Kiosk*: **Início automático** ligado
   - Brilho fixo de cerca de 70% e som de notificações desligado
5. Na Área do Gestor › Totem: cadastre "Check-in Express" (modo Só check-in) e "Check-out Express"
   (modo Só check-out) e preencha o telefone de ajuda.
6. Para cada tablet, clique em **Gerar código de pareamento** e digite o código no tablet.
7. Instalação física: suporte com trava antifurto e cabo de energia sempre ligado (passando por dentro
   do móvel). Se o HyperOS oferecer "Proteção da bateria"/limite de carga, ligue.

Alternativa sem licença: Chrome › menu › **Instalar app** em `/totem` e depois Configurações ›
Segurança › **Fixar app**. Funciona, mas o hóspede consegue sair segurando Voltar + Visão geral.

### Entrega 3: pagamento, documentos e comprovante (migrações 0045 e 0046)
Fluxo do check-in: encontrar a reserva → **pagamento** (se houver saldo) → **documentos** → senha (na tela
e impressa). Fluxo do check-out: encontrar a estadia → **pagamento** (se houver saldo) → confirmar a
saída → avaliação (comprovante impresso).

- **Pagamento: Stone Connect 2.0, "Pagamento Direto"** (`src/lib/totem/stone.server.ts` e
  `cobranca.server.ts`).
  - **Cobrança:** o servidor cria o pedido na API Pagar.me v5 para o número de série da maquininha do
    tablet (S920 ou Q92). A maquininha abre a tela sozinha, com crédito, débito ou Pix.
  - **Confirmação:** vem pelo webhook `/api/public/pagarme-webhook`. O servidor não confia no corpo do
    webhook e relê o pedido na API antes de aprovar. Como resiliência, a tela também consulta a cada
    15 s.
  - **Lançamento no Cloudbeds:** com o pagamento aprovado, o servidor faz `postPayment` uma única vez
    (trava em `cloudbeds_lancando_em`) e grava em `reservation_payments`. Se o Cloudbeds recusar, a
    recepção recebe um recado e o gestor vê "Não lançado no Cloudbeds".
  - **Valor:** sempre recalculado no servidor (saldo do Cloudbeds menos o que o totem recebeu nas
    últimas 6 h), para não cobrar duas vezes.
  - **Pedidos sem pagamento:** um pedido sem pagamento expira em 5 minutos e é cancelado na
    maquininha. Também é cancelado se o hóspede trocar de forma de pagamento ou sair da tela.
- **Ticket de atendimento** (`ticket.server.ts`): depois dos dois fatores, o servidor devolve um ticket
  HMAC válido por 20 minutos, só para aquele totem e aquela reserva. Pagamento e documentos usam o
  ticket. A senha da porta refaz toda a conferência.
- **Documentos** (`documentos.server.ts`):
  - **Quem:** cada adulto da reserva, conforme o número de adultos do Cloudbeds, com os nomes conhecidos
    já preenchidos.
  - **Captura:** tipo do documento, número e foto pela câmera frontal do tablet, com moldura. O RG pede
    frente e verso.
  - **Onde fica:** bucket privado `documentos-hospedes` e tabela `totem_documentos`, com anexo na
    reserva do Cloudbeds (`postReservationDocument`). Se o anexo falhar, a foto continua guardada e o
    gestor vê o erro.
- **Comprovante** (`escpos.ts`): ESC/POS 80 mm, sem acentos, enviado ao app **RawBT**
  (`rawbt:base64,...`).
  - **Check-in:** senha em letras grandes, portas, validade, Wi-Fi, pagamento, telefone de ajuda e
    mensagem configurável.
  - **Check-out:** recibo.
  - **Impressão:** sai sozinha, e na senha há o botão "Imprimir de novo".
- **Área do Gestor › Totem:**
  - **Por tablet:** maquininha (liga/desliga e nº de série), documentos, impressora, Wi-Fi e mensagem.
  - **Listas:** pagamentos (com alerta de não lançado) e documentos (com "Ver foto" por link
    temporário).

#### Para ativar
1. **Stone:**
   - Peça ao gerente de conta a ativação do **Connect 2.0 – Pagamento Direto** para sistema próprio
     (Programa de Parceiros), com maquininha **S920 ou Q92**.
   - Você recebe a chave secreta Pagar.me (`sk_...`) e o `ServiceRefererName`.
   - Não há ambiente de teste: teste com vendas reais de valor baixo e cancele em seguida.
2. **Lovable › Secrets:**
   - `PAGARME_SECRET_KEY_BOTAFOGO` e `PAGARME_SECRET_KEY_IPANEMA` (ou só `PAGARME_SECRET_KEY`, se for a
     mesma conta)
   - `STONE_SERVICE_REFERER_NAME`
   - Opcional: `PAGARME_WEBHOOK_TOKEN`
   - Opcional: `TOTEM_TICKET_SECRET` (sem ele, o ticket usa a chave de serviço)
3. **Pagar.me › Configurações › Webhooks:** cadastre `https://<endereço do app>/api/public/pagarme-webhook`
   (com `?token=...` se definiu o token), com os eventos `charge.paid`, `charge.refunded`, `order.paid`
   e `order.canceled`.
4. **Migrações, na ordem:**
   - Aplique a `0045_totem_pagamento_documentos.sql`.
   - Crie pela ferramenta de armazenamento o bucket **privado** `documentos-hospedes`.
   - Aplique a `0046_totem_documentos_storage_policies.sql`.
5. **Área do Gestor › Totem:** em cada tablet, ligue "Cobrar saldo na maquininha", preencha o nº de série
   da maquininha que fica ao lado dele e configure impressora, Wi-Fi e mensagem.
6. **No tablet:**
   - Instale o **RawBT** e configure a impressora nele (de preferência por rede: IP da impressora,
     porta 9100).
   - No Fully Kiosk, permita a câmera (*Web Content Settings › Enable Webcam Access*) e a abertura de
     outros apps por link (necessária para o `rawbt:`).
   - Teste a impressão e a câmera.

#### Cuidados (LGPD)
- As fotos de documento são dados pessoais sensíveis. Só gestor/admin lê (políticas da 0046). Defina
  por quanto tempo guardar e, se quiser, peça uma limpeza automática (ainda não implementada).

### Pendências / próximos passos
- Só o quarto 005 de Botafogo tem fechadura cadastrada. Nos outros quartos o totem para em
  "sem fechadura digital" e manda o hóspede falar com a equipe.
- Ligar `totem_avaliacoes` à Bonificação (notas Geral/Funcionário/Limpeza).
- Pagamento: implementado com a Stone (Entrega 3), sem teste real ainda. Falta a homologação na Stone e
  os segredos.
- **Segurança (fora do totem):** a edge function `tuya-password` aceita chamadas com a chave pública
  (inclusive `action: "unlock"`), e o client_id/secret da Tuya está escrito no código de um repositório
  público. É preciso trocar o secret na Tuya, passar para secrets do Supabase e exigir a chave de serviço
  ou um usuário com papel na função.
- Os nomes de campo do Cloudbeds para documento (`guestDocumentNumber` etc.) foram tratados de forma
  tolerante. Confirmar no primeiro teste real se o login por documento encontra a reserva.
