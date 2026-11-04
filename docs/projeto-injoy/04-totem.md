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
- **Layout (identidade do site injoyhoteis.com):**
  - **Cores do site:** grafite `#26292B`, petróleo `#14708A` / `#0F5C72` (botões), ciano `#33ADC9`
    (o "j" do logo), névoa `#F5F8F9` (fundo), linha `#E0E6E9`. Ficam como variáveis no `TotemApp`.
  - **Fontes do site:** Jost (títulos), Inter (texto) e Montserrat em maiúsculas (botões). Ficam em
    `public/totem/fonts` (OFL), sem depender do Google Fonts nem da internet do saguão.
  - **Boas-vindas:** foto do pôr do sol na baía de Botafogo (a mesma da capa do site,
    `public/totem/rio-por-do-sol.jpg`) em tela cheia, logo oficial branco, "Bem-vindo à Injoy" e os
    dois cartões grandes (check-in/check-out, ou código/documento no tablet só de check-in).
  - **Durante o fluxo:** coluna grafite à esquerda com logo, relógio, título e as etapas desenhadas
    como o "j" do logo (barra ciano até a etapa atual, que leva o ponto); painel claro à direita com a
    ação.
  - **Logo:** `public/totem/logo-injoy-branco.png` (fundo escuro) e `logo-injoy.png` (fundo claro),
    extraídos do site.
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

### Pareamento por QR code
O gestor gera o código em **Área do Gestor › Totem** e a tela mostra também um **QR code** com o link
`https://<endereço do app>/totem?parear=CODIGO` (`src/lib/totem/pareamento.ts`). Três jeitos de conectar:
1. **Câmera do Android:** apontar para o QR abre o totem já conectado. Atenção: o link abre no
   navegador padrão. Se o totem roda no Fully Kiosk, use o jeito 2 (cada navegador guarda o seu token).
2. **Dentro do totem (Fully Kiosk):** na tela "Configurar este totem", tocar em **Ler QR code** e
   mostrar o QR para a câmera da frente. Usa o leitor nativo do Android (`BarcodeDetector`) quando
   existe, senão o jsQR.
3. Digitar o código de 8 letras/números.

As bibliotecas de QR ficam em `public/vendor/` (`qrcode-generator` MIT e `jsqr` Apache-2.0),
carregadas só quando precisa (`src/lib/script-externo.ts`), sem mexer no `package.json`/`bun.lock`.

### Entrega 3: pagamento, documentos e comprovante (migrações 0059 e 0060)
Fluxo do check-in: encontrar a reserva → **pagamento** (se houver saldo) → **identificação** → senha (na tela
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
- **Identificação com uma foto** (`disparo.ts`, `documentos.server.ts`, tela em `totem-app.tsx`).
  Decisão do conselho (out/2026): câmera frontal, sem bandeja "scanner". Em 20/10/2026 a identificação
  virou **uma foto só**. A versão anterior, no estilo gov.br, pedia selfie com piscada e depois a foto
  com o documento, e no tablet não funcionava: a leitura completa do rosto em cada quadro era lenta, a
  piscada caía entre dois quadros e a exigência de rosto centralizado com 4 leituras perfeitas zerava
  a toda hora.
  - **Quem:** cada adulto da reserva, conforme o número de adultos do Cloudbeds, com os nomes conhecidos
    já preenchidos.
  - **Consentimento (LGPD):** antes da câmera, uma tela explica a foto e para que serve. Não há opção de
    "fazer na recepção" (a unidade não tem recepção): a foto é obrigatória para liberar a senha. O
    servidor só grava foto com `consentimento: true` e guarda a hora em `consentimento_em`. O leitor de
    rosto começa a carregar já nessa tela.
  - **Dados:** tipo do documento, nome e número (para o registro de hóspedes).
  - **Foto, segurando o documento ao lado do rosto:** guia do rosto + guia do documento (muda de lado
    conforme o rosto). Durante a espera a câmera só procura **um rosto**: quadro reduzido a 480 px,
    detector com entrada 224, sem landmarks nem "vetor do rosto". Em teste, ficou cerca de 3,5x mais
    rápida que a leitura antiga. Achou o rosto por 0,5 s, começa a **contagem 3-2-1** na tela e na voz,
    e a foto sai sozinha. Não exige centralizar nem piscar. Uma leitura falha durante a contagem (até
    1,2 s) não cancela. O botão **"Tirar foto"** aparece em 3 s, ou na hora se o leitor não ligar.
    Depois vem a prévia, com "Tirar outra" ou "Usar esta foto".
  - **Indício para a gerência:** calculado na foto já tirada, enquanto o hóspede confere a prévia.
    Mede a distância entre o rosto e a foto 3x4 do documento (`dist_foto_documento`), procurando a 3x4
    de novo, ampliada, no lado oposto ao rosto. Se demorar mais de 4 s depois de "Usar esta foto",
    segue sem o indício. Nunca bloqueia o check-in.
  - **Completo:** o adulto está ok quando tem a foto `rosto_documento` (`documentosFaltando`). As
    selfies antigas (`rosto`) continuam aparecendo na tela do gestor.
  - **O que vai para o servidor:** só a foto (JPEG sem espelhar, o texto do documento fica legível) e
    o indício `dist_foto_documento`. Nas fotos novas `vivacidade` e `dist_mesma_pessoa` vão nulos. O
    "vetor do rosto" não é guardado.
  - **Onde fica:** bucket privado `documentos-hospedes` e tabela `totem_documentos` (coluna `etapa`:
    `rosto_documento`; `rosto` só nos registros antigos), com anexo na reserva do Cloudbeds
    (`postReservationDocument`). Se o anexo falhar, a foto continua guardada e o gestor vê o erro.
  - **Limites:** não é biometria certificada, não tem prova de vida e não consulta base do governo. A
    foto serve para a equipe conferir à distância.
  - **Próximo passo (pendente):** identidade pela **FNRH Digital**. O hóspede faz o pré-check-in com a
    conta gov.br, pelo link que a Joy manda antes da chegada. A API do MTur (`POST /reservas` devolve o
    link de pré-check-in; `GET /reservas/{id}/hospedes` traz o status `PRECHECKIN_REALIZADO`) deixaria
    o totem pular a foto para quem já fez. Depende do acesso do Rodrigo (Cadastur + usuário da API).
- **Senha provisória (fase de testes, migração `0075`):** enquanto as fechaduras não estão todas
  integradas (os portões Tuya Wi-Fi serão trocados por TTLock), `totem_dispositivos.senha_provisoria`
  guarda uma senha fixa (`injoy2014`, colocada pela migração). Preenchida, o totem:
  - entrega essa senha para todas as portas, sem chamar a Tuya;
  - não bloqueia quarto sem fechadura cadastrada;
  - no check-out não tenta revogar senha;
  - mostra o selo "Modo teste" na tela;
  - registra "senha provisória (modo teste)" nos eventos.
  O gestor edita ou apaga em Área do Gestor › Totem. Apagar = volta a gerar senha na fechadura.
- **Voz guiando o hóspede** (`voz.ts`): fala o passo a passo de cada tela e as dicas da câmera
  ("olhe para a câmera", contagem 3-2-1...) no idioma escolhido (pt-BR, en-US, es-ES).
  - **Como sai o som:** o navegador do Fully Kiosk (Android WebView) não tem voz própria, então a
    fala usa `fully.textToSpeech` (JavaScript Interface, recurso **PLUS**). No computador, usa a voz
    do Chrome.
  - **Quando fala:** só depois que alguém toca na tela (não fala sozinho para o saguão vazio). As
    dicas da câmera passam por um filtro para não atropelar umas às outras (`Locutor`).
  - **A senha da porta nunca é falada** (outra pessoa poderia ouvir): a voz diz que ela está na tela
    e no comprovante.
  - **Controles:** botão de alto-falante na coluna da esquerda (o hóspede pode silenciar; volta a
    ligar no próximo atendimento) e a opção "Voz guiando o hóspede" por tablet (coluna
    `voz_ativa`, na 0059).
- **Comprovante** (`escpos.ts`): ESC/POS 80 mm, sem acentos, enviado ao app **RawBT**
  (`rawbt:base64,...`).
  - **Check-in:** senha em letras grandes, portas, validade, Wi-Fi, pagamento, telefone de ajuda e
    mensagem configurável.
  - **Check-out:** recibo.
  - **Impressão:** sai sozinha, e na senha há o botão "Imprimir de novo".
- **Área do Gestor › Totem:**
  - **Por tablet:** maquininha (liga/desliga e nº de série), documentos, impressora, Wi-Fi e mensagem.
  - **Listas:** pagamentos (com alerta de não lançado) e fotos de identificação (com os indícios em
    selos verdes/vermelhos e "Ver foto" por link temporário).

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
   - Aplique a `0059_totem_pagamento_documentos.sql`.
   - Crie pela ferramenta de armazenamento o bucket **privado** `documentos-hospedes`.
   - Aplique a `0060_totem_documentos_storage_policies.sql`.
5. **Área do Gestor › Totem:** em cada tablet, ligue "Cobrar saldo na maquininha", preencha o nº de série
   da maquininha que fica ao lado dele e configure impressora, Wi-Fi e mensagem.
6. **No tablet:**
   - Instale o **RawBT** e configure a impressora nele (de preferência por rede: IP da impressora,
     porta 9100).
   - No Fully Kiosk, permita a câmera (*Web Content Settings › Enable Webcam Access*) e a abertura de
     outros apps por link (necessária para o `rawbt:`).
   - Fully Kiosk: ative a licença **PLUS** e ligue *Advanced Web Settings › Enable JavaScript
     Interface*. No Android, em *Configurações › Idiomas › Saída de texto para fala*, use o mecanismo
     do Google e baixe as vozes de português (Brasil), inglês e espanhol.
   - Teste a impressão e a câmera.
   - Teste a identificação com uma pessoa de verdade e um RG/CNH real, na luz do balcão: a foto
     precisa sair sozinha depois do 3-2-1; anote se a foto 3x4 do documento é reconhecida (indício na
     tela do gestor).

#### Cuidados (LGPD)
- Foto do rosto é **dado biométrico** (dado sensível, art. 5º, II e art. 11 da LGPD). Por isso: tela de
  consentimento antes da câmera, só gestor/admin lê (políticas da 0060) e nenhum vetor de rosto
  guardado. Como não há recepção, quem não aceitar as fotos não conclui o check-in pelo totem; o
  telefone de ajuda continua na tela.
- Falta definir por quanto tempo guardar as fotos e colocar isso na política de privacidade. Depois
  disso dá para criar a limpeza automática (ainda não implementada).

### Entrega 4: portões TTLock + quartos Tuya (migração `0093`, nov/2026)
- **Botafogo:** os 2 portões viram teclados **TTLock MF03** com **gateway G2**. Os funcionários entram
  por rosto ou digital, cadastrados direto no teclado pelo app TTLock. Os quartos continuam **Tuya
  Zigbee**. Ipanema fica fora do totem por enquanto.
- **Cadastro:** a tabela `tuya_devices` ganhou a coluna `fornecedor` (`tuya` | `ttlock`). Para TTLock,
  `device_id` = **lockId** do app TTLock. Em Gestão › Fechaduras dá para escolher a marca.
- **Mesma senha em todas as portas:** a edge function `tuya-password` separa os aparelhos por
  fornecedor (`_shared/ttlock.ts`).
  - Escolhe uma senha de 6 dígitos e grava nos teclados TTLock (`/v3/keyboardPwd/add`, `addType=2`,
    pelo gateway). Se o teclado disser que a senha já existe (errcode -3007), troca o número.
  - Passa a mesma senha para as fechaduras Tuya.
  - Revogar apaga no TTLock (`/v3/keyboardPwd/delete`). Abrir remoto usa `/v3/lock/unlock`.
  - O status mostra online quando o teclado tem gateway.
  - Se um portão recusar a senha, o hóspede vê "a equipe abre para você" e a recepção recebe recado.
- **TTLock (euopen.ttlock.com):** aplicação **INJOY Totem**, aprovada em 03/11/2026, conta de
  desenvolvedor `servidorinjoy@gmail.com`.
  - Segredos da edge function: `TTLOCK_CLIENT_ID`, `TTLOCK_CLIENT_SECRET`, `TTLOCK_USERNAME`
    (conta do app TTLock dona dos teclados), `TTLOCK_PASSWORD`.
  - Testado em bancada: criar, senha repetida (-3007), apagar e detalhe. A senha abriu o teclado
    "PORTÃO GRADEADO - BOTAFOGO" (lockId 36396334).
- **Cota Tuya (IoT Core grátis):** 10 aparelhos "Controllable".
  - Em uso: o portão Tuya "PORTÃO GRADEADO" e os quartos 001, 002, 003, 005, 006, 107, 109, 110 e 111.
  - Sem cota: 112, 113, 114, 115, 117 e 118.
  - A vaga do portão Tuya volta quando ele for removido do app Tuya Smart. Aí dá para converter o 112.
- **Estado:** quartos cadastrados e ativos. O portão TTLock está cadastrado **inativo**: ligar quando o
  teclado for instalado e desligar o portão Tuya antigo. O segundo teclado TTLock (porta de vidro)
  entra pelo mesmo cadastro quando chegar.

### Entrega 5: segundo projeto Tuya (migração `0095`, nov/2026)
- **Por quê:** a cota grátis do IoT Core é de **10 fechaduras "Controllable" por conta**. Para mais 10,
  foi criada uma segunda conta de desenvolvedor com o projeto **"INJOY FECHADURAS 2"** (Western America,
  Smart Home, Smart Lock Open Service), ligada à mesma conta do app (`reservas@injoyhoteis.com`) em
  **link personalizado**.
- **Divisão:** projeto 1 = quartos 001, 002, 003, 005, 006, 107, 109, 110, 111 e 112 (os portões
  saíram do projeto). Projeto 2 = quartos 113, 114, 115, 117 e 118, com 5 vagas livres.
- **Sistema:** `tuya_devices.tuya_projeto` (1 ou 2). A edge function agrupa os aparelhos por TTLock,
  projeto 1 e projeto 2, chama cada grupo com as suas credenciais e junta as respostas. A mesma senha
  vale em todas as portas.
- **Segredos:** `TUYA_CLIENT_ID`/`TUYA_CLIENT_SECRET` (projeto 1; enquanto não existirem, vale o valor
  antigo fixo no código) e `TUYA2_CLIENT_ID`/`TUYA2_CLIENT_SECRET` (projeto 2, obrigatório).
- **Cuidados:**
  - Os dois testes grátis vencem a cada 6 meses e precisam ser renovados separadamente.
  - Ter duas contas para dobrar a cota pode contrariar as regras da Tuya. Se uma conta for
    bloqueada, só os quartos dela param.
  - Nos dois projetos o link é **personalizado**: fechadura nova no app precisa ser vinculada à mão.

### Entrega 6: quartos com senha fixa e senha provisória dos portões (migrações `0097` e `0098`, nov/2026)
- **Quartos sem fechadura integrada (108, 301, 401 e 501 de Botafogo):** têm teclado com senha manual.
  Entram em `tuya_devices` com `fornecedor = 'manual'` e `device_id = manual-botafogo-<quarto>`.
  - A senha fica em `senha_fixa` e é digitada pelo gestor em **Gestão › Fechaduras**. O repositório é
    público, então ela nunca vai em migração. Sem a senha cadastrada, o totem para em "sem fechadura digital".
  - No check-in, o totem mostra a senha fixa do quarto como senha principal e gera a senha dos portões
    (que aparece em "outras portas" e no comprovante). Regras puras em `portas.ts` (`montarSenha`, testes em
    `portas.test.ts`).
  - A edge function `tuya-password` nunca manda fechadura manual para a Tuya/TTLock: responde com a
    senha fixa (`senhaIds = "senha_fixa"`), não apaga nada e não abre remoto. Assim a senha de teste e o
    check-in da recepção também funcionam com esses quartos.
- **Senha provisória dos portões** (`senha-portoes.server.ts`, rota `/api/public/senha-portoes`, agendada
  a cada 15 min por `private.run_senha_portoes`). O totem fica dentro do hotel, então o hóspede precisa
  passar pelos dois portões antes de chegar nele.
  - **Quem:** reservas que chegam hoje ou amanhã, ainda não hospedadas, cujo titular já tem documento na
    reserva do Cloudbeds (check-in online feito). Reserva que já tem senha da estadia não recebe.
  - **O quê:** uma senha só para os portões integrados (TTLock/Tuya ativos, `tipo <> 'quarto'`), válida da
    `hora_checkin` do dia da chegada até a `hora_checkout` (12h) do dia seguinte. Fica em
    `tuya_password_logs` com `provisoria = true`. A edge function passou a respeitar início no futuro também
    no TTLock (antes começava na hora).
  - **Envio:** a senha é gravada no **campo personalizado da reserva** do Cloudbeds (código interno
    `campo_cloudbeds_senha`, padrão `codigo_portoes`) e o sistema confere relendo a reserva
    (`cloudbeds_campo_em`). O e-mail sai pelo **modelo de e-mail do Cloudbeds**, que mostra o campo.
  - **Atrasados:** senha criada depois do e-mail automático da véspera (`hora_email_codigos`, padrão 17:00)
    gera recado para a recepção mandar o modelo à mão pela reserva. Erro (ex.: gateway desligado) gera um
    recado por reserva a cada 6 h e é tentado de novo a cada 15 min.
  - **No totem:** o check-in apaga a senha provisória (`revogarSenhaProvisoria`) e entrega a senha da
    estadia. Se o hóspede não fizer o check-in, ela vence sozinha e a limpeza (`tuya-cleanup`) apaga.
  - **Ligar:** Área do Gestor › Totem › "Mandar senha provisória dos portões depois do check-in online"
    (um totem por unidade).

#### Para ativar a Entrega 6
1. Lovable: aplicar `0097_fechadura_manual_senha_portoes.sql` e depois `0098_senha_portoes_agendamento.sql`.
2. Gestão › Fechaduras: digitar a senha fixa dos quartos 108, 301, 401 e 501.
3. Cloudbeds › Configurações › Hóspedes › Campos personalizados: criar o campo **"Código dos portões"**,
   ligado à **Reserva**, do tipo texto, não obrigatório, **sem** aparecer no motor de reservas, com código
   interno `codigo_portoes`.
4. Cloudbeds › Configurações › E-mails: criar o modelo **"Códigos de acesso"** com o campo
   "Código dos portões" e agendar para **1 dia antes do check-in, às 17h**. Texto sugerido: "Digite o código
   e # no portão gradeado e na porta de vidro. Vale a partir das 14h do dia da chegada. Dentro do hotel, faça
   o check-in no totem para receber a senha do seu quarto."
5. Ligar o portão gradeado e a porta de vidro TTLock em Gestão › Fechaduras.
6. Área do Gestor › Totem: ligar a opção e conferir o código interno e o horário.
7. Teste com uma reserva de teste chegando amanhã: preencher o documento do titular no Cloudbeds e, em até
   15 min, conferir o evento no histórico do totem, o campo na reserva e o código no portão.

### Pendências / próximos passos
- Botafogo: os 19 quartos têm fechadura no sistema (15 integradas + 4 manuais). Quarto sem cadastro, ou
  manual sem a senha fixa, para em "sem fechadura digital" e manda o hóspede falar com a equipe.
- Ligar `totem_avaliacoes` à Bonificação (notas Geral/Funcionário/Limpeza).
- Pagamento: implementado com a Stone (Entrega 3), sem teste real ainda. Falta a homologação na Stone e
  os segredos.
- **Segurança (fora do totem):** a edge function `tuya-password` aceita chamadas com a chave pública
  (inclusive `action: "unlock"`), e o client_id/secret da Tuya está escrito no código de um repositório
  público. É preciso trocar o secret na Tuya, passar para secrets do Supabase e exigir a chave de serviço
  ou um usuário com papel na função.
- Os nomes de campo do Cloudbeds para documento (`guestDocumentNumber` etc.) foram tratados de forma
  tolerante. Confirmar no primeiro teste real se o login por documento encontra a reserva.
