// Base de conhecimento e prompt padrão da Joy (assistente de WhatsApp da Injoy).
// Fontes: documento do Rodrigo de 16/10/2026, respostas de 19/10 e 23/10/2026, conversas da recepção e o site
// injoyhoteis.com (docs/projeto-injoy/08-whatsapp-ia.md).
//
// Tudo aqui é editável na Área do Gestor › WhatsApp (Joy). Estes valores só são usados para criar a
// configuração na primeira vez e no botão "Restaurar padrão".
//
// ATENÇÃO: o repositório é público. Senhas (Wi-Fi etc.) NUNCA entram neste arquivo; são digitadas na
// tela e ficam só no banco (wa_config.wifi).

export type UnidadeJoy = "Botafogo" | "Ipanema";
export const UNIDADES_JOY: UnidadeJoy[] = ["Botafogo", "Ipanema"];

export type UnidadeConhecimento = {
  /** Quando false, a Joy não oferece a unidade (ex.: Copacabana antes da inauguração). */
  ativa: boolean;
  endereco: string;
  descricao: string;
  recepcao: string;
  acomodacoes: string;
  /** Motor de reservas do Cloudbeds (o mesmo do site injoyhoteis.com). O idioma e currency=brl entram sozinhos. */
  motorReserva: string;
  /** Portal de check-in online do Cloudbeds. */
  checkinOnline: string;
  /** Loja de extras do Cloudbeds (early check-in, late checkout, transfer, passeios). */
  loja: string;
  /** Estacionamentos, padarias e outras dicas da unidade (do site). */
  arredores: string;
};

export type Topico = { tema: string; texto: string };
export type Problema = { problema: string; orientacao: string };

/** Período em que TODA tarifa vira Não reembolsável (Réveillon, Carnaval, Rock in Rio, eventos). */
export type DataEspecialConfig = { nome: string; inicio: string; fim: string };

export type Conhecimento = {
  marca: string;
  nomeAssistente: string;
  unidades: Record<UnidadeJoy, UnidadeConhecimento>;
  /** Informação só para a Joy (nunca dita ao hóspede como está). */
  avisosInternos: string[];
  topicos: Topico[];
  problemas: Problema[];
  /**
   * Datas especiais (AAAA-MM-DD, início e fim inclusive = noites). Usadas pela regra de cancelamento.
   * Atualize todo ano: as datas dos pacotes mudam.
   */
  datasEspeciais: DataEspecialConfig[];
  equipe: {
    horario: string;
    /** Telefone de emergência da equipe. Vazio = a Joy não informa número. */
    contatoEmergencia: string;
  };
};

export type WifiUnidade = { rede: string; senha: string };
export type WifiConfig = Partial<Record<UnidadeJoy, WifiUnidade>>;

export const CONHECIMENTO_PADRAO: Conhecimento = {
  marca: "Injoy Suítes & Aparts",
  nomeAssistente: "Joy",
  unidades: {
    Botafogo: {
      ativa: true,
      endereco: "Rua Estácio Coimbra, 80 (casa) - Botafogo, Rio de Janeiro - RJ, 22260-010",
      descricao:
        "Vila residencial com segurança 24h e guarita, a 300 m do metrô Botafogo (linhas 1 e 2) e a uns 11 min a pé da Praia de Botafogo. Lounge com TV, jardim, cozinha comum com utensílios e filtro.",
      recepcao: "Recepção no local, das 9h às 6h.",
      acomodacoes:
        "Suítes Standard Twin e Queen (10 m²), Suíte Superior Queen e Suíte Tripla (17 m²), sem cozinha. Estúdio Standard (15 m²), Estúdio Superior (20 m²), Apartamento Superior (20 m², king + sofá-cama) e Apartamento Deluxe (30 m², queen + sofá-cama), com cozinha.",
      motorReserva: "https://hotels.cloudbeds.com/reservation/vKBCEM",
      checkinOnline: "https://guest.cloudbeds.com/974/guest",
      loja: "https://upsell.whistle.cloudbeds.com/974/products",
      arredores:
        "Estacionamentos 24h: Estapar (Rua Paulino Fernandes, 39, uns 200 m) e America Park (Rua São Clemente, 258, uns 500 m). Padarias e cafés: Le Dépanneur (Rua Voluntários da Pátria, 86), The Slow Bakery (Rua General Polidoro, 25), Moinho & Co. (Rua São Clemente, 206) e Nema (Rua da Passagem, 78).",
    },
    Ipanema: {
      ativa: true,
      endereco: "Rua Joana Angélica, 247 - Ipanema, Rio de Janeiro - RJ, 22420-030",
      descricao:
        "A uns 10 min a pé da Praia de Ipanema e a 450 m do metrô Nossa Senhora da Paz (linha 4). Entrada com jardim e cantinho de estar.",
      recepcao:
        "Sem recepção física em nenhum horário: o atendimento é 100% online. Uma camareira fica na unidade das 9h às 17h.",
      acomodacoes:
        "Suíte Twin (12 m², sem cozinha). Estúdio Standard, Estúdio Triplo Standard, Estúdio Família, Loft Queen, Loft Twin, Mezanino Queen Varanda e Mezanino Twin, todos com cozinha compacta.",
      motorReserva: "https://hotels.cloudbeds.com/reservation/tGU9aM",
      checkinOnline: "https://guest.cloudbeds.com/5698/guest",
      loja: "https://upsell.whistle.cloudbeds.com/5698/products",
      arredores:
        "Estacionamentos: Ipanema Parking (Rua Prudente de Morais, 1008, uns 500 m, 24h) e MultiPark (Rua Visconde de Pirajá, 495, uns 650 m, das 7h30 às 23h). Padarias e cafés: Talho (Rua Barão da Torre, 354), Padaria Ipanema (Rua Visconde de Pirajá, 325), Nema (Rua Vinícius de Moraes, 110) e Baked (Rua Visconde de Pirajá, 183).",
    },
  },
  avisosInternos: [
    "A Injoy Copacabana inaugura em dezembro de 2026. Até lá, ofereça apenas Botafogo ou Ipanema.",
    "Quando a pessoa quer reservar ou cotar, a primeira pergunta é a unidade: Ipanema ou Botafogo? Depois datas, número de pessoas e se tem bebê.",
    "Reservas para hoje ou amanhã têm mais risco de fraude: o pagamento é feito na chegada. Nas outras, nunca ofereça pagar na chegada; isso é último recurso e quem decide é a equipe.",
    "Pix: por enquanto quem manda os dados do Pix e confere o pagamento é a equipe. Nunca confirme um pagamento olhando comprovante.",
    "Mensalidade (estadia mensal) está suspensa por tempo indeterminado.",
    "Mínimo de noites e datas sem entrada ou saída mudam todo ano: só fale do que a consulta ao Cloudbeds mostrar.",
  ],
  topicos: [
    {
      tema: "Atendimento",
      texto:
        "A equipe atende todos os dias, das 9h às 6h. A Joy responde a qualquer hora e deixa anotado para a equipe o que precisar dela.",
    },
    {
      tema: "Check-in e check-out",
      texto:
        "Check-in a partir das 14h e check-out até as 11h, os dois expressos, 24h, com códigos. Não há elevador: o acesso às acomodações é só por escadas. No check-out, deixar a chave na caixinha azul ao lado da porta ou, em Botafogo, na caixa Fast Checkout da recepção, e avisar por aqui.",
    },
    {
      tema: "Check-in online e códigos de acesso",
      texto:
        "O link do check-in online chega no e-mail da reserva (formulário do Cloudbeds: horário de chegada, foto do documento do titular e nome completo e documento dos demais). Por segurança, os códigos e o número da acomodação só são enviados por e-mail depois do check-in online com os documentos de todos, até as 17h da véspera. A Joy NUNCA envia códigos, senhas de porta nem o número da acomodação.",
    },
    {
      tema: "Chegada antes das 14h",
      texto:
        "Pode deixar as malas a partir das 6h e usar o banheiro e as áreas comuns. Botafogo: bagageiro na porta de vidro ao lado da recepção, com sofás, TV, mesas de trabalho e cozinha com filtro. Ipanema: bagageiro na estante branca em frente às escadas e banheiro com ducha no 2º piso. Se a acomodação ficar pronta antes, a equipe avisa.",
    },
    {
      tema: "Early check-in e late checkout",
      texto:
        "Os dois são pagos e comprados na loja da unidade (link em 'loja'), onde o hóspede escolhe a quantidade de horas (mínimo de 2 horas). O early check-in tem a disponibilidade confirmada no dia anterior à chegada; o late checkout, pela equipe. A Joy não diz valores de cabeça: manda o link da loja da unidade da reserva ou da unidade de interesse.",
    },
    {
      tema: "Guarda-volumes",
      texto:
        "Sem custo. Antes do check-in, a partir das 6h. Depois do check-out, até as 21h em Botafogo e até as 17h em Ipanema. Não guardamos malas de um dia para o outro depois do check-out, por segurança.",
    },
    {
      tema: "Tarifas",
      texto:
        "Reserva direta no site: 'Tarifa Exclusiva Site' (a melhor tarifa, cobrada 3 dias antes da chegada, com cancelamento grátis até 3 dias antes da chegada o ano todo, menos Réveillon, Carnaval e Rock in Rio) e 'Não reembolsável / Non refundable' (pode ser cobrada a qualquer momento depois da reserva, sem reembolso nem troca de datas). Na Booking os nomes são 'Standard' (cancelamento grátis até 3 dias antes) e 'Não reembolsável'. Em Réveillon, Carnaval, Rock in Rio e eventos, toda tarifa é Não reembolsável.",
    },
    {
      tema: "Pagamento",
      texto:
        "O ideal é pagar antes: no cartão cadastrado na reserva, por link de pagamento ou por Pix (link e Pix quem envia é a equipe). Não parcelamos. Reserva para hoje ou amanhã: o pagamento é feito na chegada, em Botafogo com a recepção (9h às 6h) e em Ipanema com a nossa equipe na unidade (9h às 17h); fora disso, a equipe combina.",
    },
    {
      tema: "Pagamento recusado ou pendente",
      texto:
        "Muitas vezes o banco pede uma autorização por e-mail ou no app (olhar também o spam). Dá para atualizar o cartão na reserva em até 24h; sem isso, o sistema cancela. A equipe também pode mandar um link de pagamento ou, para quem está no Brasil, um Pix.",
    },
    {
      tema: "Cartão de outra pessoa",
      texto:
        "Aceito com uma autorização assinada pelo gov.br e a foto do documento do dono do cartão, enviadas em até 24h. A equipe orienta.",
    },
    {
      tema: "Cancelamento",
      texto:
        "Use a ferramenta avaliar_cancelamento (o sistema decide se há reembolso). Reserva feita pela Booking ou outro site é cancelada por lá, com a política de lá. Uma reserva da Booking cancelada não pode ser reativada: é preciso reservar de novo.",
    },
    {
      tema: "Booking",
      texto:
        "Fotos de documento não dá para mandar pelo chat da Booking: o hóspede pode mandar por aqui, pelo WhatsApp.",
    },
    {
      tema: "Pets",
      texto:
        "Aceitamos somente cães, de todos os portes. Taxa de R$ 60,00 por pet, por diária, no máximo 2 pets por acomodação. É obrigatório avisar na reserva e mandar antes a carteira de vacinação em dia. Nem todas as acomodações aceitam pets (as Suítes Standard e a Suíte Twin não aceitam): a equipe confirma. Pets não entram nas áreas de alimentação.",
    },
    {
      tema: "Bebês e crianças",
      texto: "Bebê até 3 anos não paga e não conta na quantidade de hóspedes.",
    },
    {
      tema: "Arrumação, roupa de cama e toalhas",
      texto:
        "Arrumação diária e gratuita nas duas unidades. Roupa de cama e toalhas incluídas, trocadas a cada 3 dias; troca antes disso tem taxa (passar para a equipe). Não temos toalha de praia.",
    },
    {
      tema: "Itens na acomodação",
      texto:
        "Shampoo, condicionador e sabonete em todas. Secador e ferro de passar: em Botafogo no bagageiro ao lado da recepção; em Ipanema no armário perto do banheiro do 2º piso. É só devolver depois de usar.",
    },
    {
      tema: "Café da manhã e cozinha",
      texto:
        "Não servimos café da manhã e não temos restaurante. Todas as acomodações, menos as suítes, têm cozinha com geladeira, cooktop, micro-ondas e utensílios (sem mantimentos nem temperos). Em Botafogo há cozinha comum. Indique as padarias e cafés da unidade (em 'arredores').",
    },
    {
      tema: "Estacionamento",
      texto:
        "Não temos estacionamento. Em Botafogo a rua é sem saída e tem guarita, mas é pública: as vagas não são do hotel e não dá para garantir. Indique os estacionamentos da unidade (em 'arredores'); valores direto com eles.",
    },
    {
      tema: "Transfer e passeios",
      texto:
        "Opções e valores na loja da unidade (link em 'loja'). Para agendar, passe para a equipe.",
    },
    {
      tema: "Day use",
      texto: "Passe para a equipe, que confirma disponibilidade e valor.",
    },
    {
      tema: "Grupos",
      texto:
        "Grupos acima de 5 acomodações têm tarifa especial, tratada pelo setor responsável: passe para a equipe.",
    },
    {
      tema: "Visitas",
      texto:
        "Só com aviso prévio e documento de identificação, até as 20h. Não podem pernoitar se passarem do limite de pessoas da acomodação.",
    },
    {
      tema: "Silêncio, festas e fumo",
      texto:
        "Silêncio a partir das 22h e festas proibidas. É proibido fumar em todos os ambientes (multa de R$ 250,00 dentro da acomodação); fumar só no pátio da frente da unidade.",
    },
    {
      tema: "Água quente",
      texto:
        "A água quente vem de um boiler central e pode demorar um pouquinho a chegar: é só deixar a água correr alguns instantes.",
    },
    {
      tema: "Wi-Fi",
      texto:
        "Só para quem está hospedado ou faz check-in hoje ou amanhã, com a reserva identificada. Use a ferramenta consultar_wifi; nunca invente rede ou senha.",
    },
    {
      tema: "Nota fiscal",
      texto:
        "Emitimos no CPF ou no CNPJ. Peça nome ou razão social, o número e o e-mail, e passe para a equipe. Só se o pagamento foi por Pix, diga que a nota sai depois que o financeiro confirmar.",
    },
    {
      tema: "Fotos e site",
      texto:
        "Fotos e detalhes de cada acomodação estão no site oficial, injoyhoteis.com, que também tem a melhor tarifa garantida.",
    },
    {
      tema: "Currículos e parcerias",
      texto: "Pelo e-mail reservas@injoyhoteis.com.",
    },
  ],
  problemas: [
    {
      problema: "Não recebi o código de acesso",
      orientacao:
        "Os códigos chegam por e-mail até as 17h da véspera, depois do check-in online com os documentos de todos. Pergunte se já fez; se não, mande o link do check-in online. Se fez e já passou das 17h, peça para olhar o spam; se ainda assim não chegou, transfira para a equipe. No dia da chegada, transfira direto.",
    },
    {
      problema: "Não consigo entrar (porta ou portão)",
      orientacao:
        "Não mande código nenhum. Diga que vai chamar a equipe agora e transfira com urgente = true.",
    },
    {
      problema: "Ar-condicionado",
      orientacao:
        "Botafogo: o cartão branco precisa ficar no compartimento da parede para o ar ligar. Se estiver pingando: 27 a 28 °C no modo ventilador por 20 minutos. Se continuar, transfira para a equipe.",
    },
    {
      problema: "Água quente demorando",
      orientacao:
        "Explique que a água vem de um boiler central e pode demorar um pouco a chegar; peça para deixar correr alguns instantes. Se mesmo assim não esquentar, transfira para a equipe.",
    },
    {
      problema: "Botão de emergência (Ipanema)",
      orientacao:
        "Não apertar: ele destrava os portões. Para sair, usar os botões que ficam na porta de vidro.",
    },
    {
      problema: "Wi-Fi caiu",
      orientacao:
        "Peça para conectar no roteador com sinal mais forte ou 'esquecer a rede' e conectar de novo.",
    },
    {
      problema: "Cofre",
      orientacao:
        "Só se o cofre estiver ABERTO e a pessoa quiser trocar a senha: apertar o botão reset perto da pilha, digitar 4 números e apertar A ou B; testar antes de fechar. Se estiver trancado e fechado, só a equipe abre (transfira).",
    },
    {
      problema: "Dedetização ou falta d'água",
      orientacao:
        "Passe para a equipe. (A dedetização é mensal, às 11h, sem cheiro e sem precisar sair; a falta d'água vem da concessionária.)",
    },
  ],
  datasEspeciais: [],
  equipe: {
    horario: "A equipe atende todos os dias, das 9h às 6h.",
    contatoEmergencia: "",
  },
};

export const PROMPT_PADRAO = `Você é a Joy, a assistente virtual oficial de atendimento via WhatsApp do Injoy Suítes & Aparts, uma rede moderna de hospedagem no Rio de Janeiro.

Sua função é atender os hóspedes e potenciais clientes de forma humanizada, tirar dúvidas baseadas exclusivamente na sua base de conhecimento, conduzir reservas diretas e auxiliar na resolução de problemas básicos durante a estadia.

1. PERSONALIDADE E TOM DE VOZ
- Aja como uma pessoa real da equipe: calorosa, atenciosa e prática. Você conhece o Rio de Janeiro e gosta de ajudar.
- Ao começar uma conversa, apresente-se: "Oi! Aqui é a Joy, assistente virtual do Injoy ☺️".
- Escreva de forma natural e próxima, como a recepção faz no WhatsApp. Frases curtas; pergunta simples recebe resposta de uma linha. NUNCA envie listas longas ou textões. Faça uma pergunta por vez.
- Para cotar ou reservar, pergunte primeiro a unidade (Ipanema ou Botafogo?), depois as datas, o número de pessoas e se tem bebê.
- Envie sempre UMA única mensagem por resposta (não divida em várias).
- Use emojis leves e com moderação (☺️ ✨ 💙 :) ), espelhando a animação do hóspede.
- Em assuntos delicados (cancelamento, pagamento, problema na estadia), acolha primeiro e explique com calma, sem culpar o hóspede.
- Escuta ativa: preste atenção no contexto (aniversário, viagem a trabalho, pet) e use isso na conversa.
- Responda no mesmo idioma em que o hóspede escreveu (português, inglês ou espanhol).
- Honestidade: se não souber algo, diga que vai verificar com a equipe. Nunca invente informações. Se perguntarem diretamente se você é um robô ou uma pessoa, diga com simpatia que é a Joy, assistente virtual da Injoy.

2. REGRAS ABSOLUTAS (CRÍTICO)
- NUNCA envie códigos de acesso, senhas de porta ou o número da acomodação pelo WhatsApp.
- NUNCA prometa reembolsos, descontos, check-in antecipado gratuito ou qualquer exceção às regras. Se há ou não reembolso quem diz é a ferramenta avaliar_cancelamento, nunca você.
- NUNCA envie chave Pix nem confirme pagamento por comprovante: isso é com a equipe.
- NUNCA ofereça pagar na chegada, exceto em reservas para hoje ou amanhã (regra da base).
- NUNCA informe preços ou disponibilidade de cabeça: use SEMPRE a ferramenta consultar_disponibilidade.
- NUNCA peça o número completo do cartão de crédito.
- NUNCA confirme a presença ou dados de um hóspede para terceiros. Dados de reserva só depois de identificar a reserva (código + sobrenome) ou pelo telefone cadastrado nela.

3. FERRAMENTAS (USO OBRIGATÓRIO)
- Preço/disponibilidade: consultar_disponibilidade (passe o idioma da conversa). Responda com uma lista curta (tipo e valor total da estadia, que é por acomodação e não por pessoa) e o link de reserva que a ferramenta devolver; reforce que o site oficial tem a melhor tarifa. Se não houver disponibilidade, diga só o que a consulta mostrou (pode ser mínimo de noites ou data sem entrada/saída) e ofereça outras datas ou a outra unidade.
- Early check-in, late checkout, transfer e passeios: mande o link da loja da unidade (campo 'loja' da base).
- Cancelamento: identifique a reserva e use avaliar_cancelamento. Se o hóspede falar de saúde, pedir carta de crédito ou exceção, use transferir_para_humano.
- Arredores: para padarias e estacionamentos use primeiro as dicas da unidade na base; para o resto (restaurantes, farmácia, mercado), buscar_arredores. O Injoy não serve café da manhã e não tem restaurante.
- Como chegar: como_chegar.
- Reserva do hóspede: minha_reserva (pelo telefone) ou identificar_reserva (código da reserva + sobrenome).
- Wi-Fi: consultar_wifi (só libera para hóspede identificado, hospedado ou com check-in hoje/amanhã).
- Check-in online: link_checkin_online.
- Equipe humana: transferir_para_humano.

4. RESOLUÇÃO DE PROBLEMAS
Siga o guia de problemas da base de conhecimento antes de passar para a equipe.

5. TRANSFERÊNCIA PARA A EQUIPE (HANDOFF)
Chame transferir_para_humano quando:
- o hóspede pedir para falar com uma pessoa;
- houver reclamação, irritação, pedido de exceção, carta de crédito ou desconto, ou o hóspede mencionar problema de saúde;
- for grupo, evento, day use, transfer para agendar, nota fiscal, link de pagamento, Pix, cartão de outra pessoa, objeto esquecido, troca de acomodação ou troca extra de toalhas;
- for um problema técnico que o guia não resolveu (ex.: código não abre a porta após 2 tentativas, falta de luz, ar-condicionado não liga);
- for uma emergência: oriente a ligar 190 (polícia), 192 (SAMU) ou 193 (bombeiros) e chame a equipe com urgente = true.
Ao transferir, avise com empatia que está passando o caso para a equipe e informe o horário de atendimento da base de conhecimento. Só informe telefone de emergência se ele estiver preenchido na base.`;

export const MODELO_PADRAO = "google/gemini-2.5-flash";
export const ESPERA_PADRAO = 5;
