// Base de conhecimento e prompt padrão da Joy (assistente de WhatsApp da Injoy).
// Fonte: documento do Rodrigo de 16/10/2026 + respostas de 19/10/2026 (docs/projeto-injoy/08-whatsapp-ia.md).
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
  /** Motor de reservas do Cloudbeds (o mesmo do site injoyhoteis.com). */
  motorReserva: string;
  /** Portal de check-in online do Cloudbeds. */
  checkinOnline: string;
};

export type Topico = { tema: string; texto: string };
export type Problema = { problema: string; orientacao: string };

export type Conhecimento = {
  marca: string;
  nomeAssistente: string;
  unidades: Record<UnidadeJoy, UnidadeConhecimento>;
  /** Informação só para a Joy (nunca dita ao hóspede como está). */
  avisosInternos: string[];
  topicos: Topico[];
  problemas: Problema[];
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
      endereco: "Rua Estácio Coimbra, 80 - Botafogo, Rio de Janeiro - RJ",
      descricao: "Vila residencial segura, perto do metrô.",
      recepcao: "Recepção no local das 09:00 às 21:00.",
      acomodacoes: "Suítes (sem cozinha) e Estúdios/Apartamentos (com cozinha).",
      motorReserva: "https://hotels.cloudbeds.com/reservation/vKBCEM",
      checkinOnline: "https://guest.cloudbeds.com/974/guest",
    },
    Ipanema: {
      ativa: true,
      endereco: "Rua Joana Angélica, 247 - Ipanema, Rio de Janeiro - RJ",
      descricao:
        "A passos da praia. Unidade 100% online, sem recepção física (o atendimento é feito pela equipe de Botafogo).",
      recepcao: "Sem recepção física. Atendimento remoto pela equipe.",
      acomodacoes: "Estúdios, Lofts e Mezaninos (todos com cozinha compacta).",
      motorReserva: "https://hotels.cloudbeds.com/reservation/tGU9aM",
      checkinOnline: "https://guest.cloudbeds.com/5698/guest",
    },
  },
  avisosInternos: [
    "A Injoy Copacabana inaugura em dezembro de 2026. Até lá, ofereça apenas Botafogo ou Ipanema.",
  ],
  topicos: [
    {
      tema: "Horários de check-in e check-out",
      texto:
        "Check-in a partir das 14h e check-out até as 11h. Os dois são expressos e funcionam 24h. Não há elevadores nas unidades (acesso por escadas).",
    },
    {
      tema: "Códigos de acesso (portão e porta)",
      texto:
        "O acesso é por fechadura eletrônica. O hóspede recebe os códigos da equipe até as 17h do dia anterior ao check-in, DESDE QUE tenha feito o check-in online e enviado as fotos dos documentos de todos os hóspedes. A Joy nunca envia códigos, senhas de porta nem o número da acomodação.",
    },
    {
      tema: "Guarda-volumes",
      texto:
        "Gratuito antes do check-in e depois do check-out (até as 17h). O hóspede precisa levar cadeado próprio.",
    },
    {
      tema: "Café da manhã e restaurante",
      texto:
        "A Injoy não serve café da manhã e não tem restaurante. Para dicas de onde comer, use a ferramenta de arredores.",
    },
    {
      tema: "Pets",
      texto:
        "Pet friendly: aceitamos cães de todos os portes. Taxa de R$ 60,00 por pet por diária (máximo 2 pets). É obrigatório avisar antes e ter carteira de vacinação. Gatos exigem caução extra de R$ 500. As Suítes Standard e a Suíte Twin NÃO aceitam pets.",
    },
    {
      tema: "Silêncio e festas",
      texto: "Silêncio obrigatório a partir das 22h. Festas são proibidas.",
    },
    { tema: "Fumo", texto: "É proibido fumar dentro das acomodações (multa de R$ 250,00)." },
    {
      tema: "Visitas",
      texto:
        "Permitidas até as 20h, com envio prévio de documento. Visitas não podem pernoitar se ultrapassarem o limite de pessoas da acomodação.",
    },
    {
      tema: "Água quente",
      texto:
        "A água quente vem de um boiler central e pode demorar um pouco a chegar ao chuveiro. Oriente a deixar a água correr alguns instantes.",
    },
    {
      tema: "Wi-Fi",
      texto:
        "Só para quem está hospedado ou faz check-in hoje ou amanhã, com a reserva identificada. Use a ferramenta consultar_wifi; nunca invente rede ou senha.",
    },
    {
      tema: "Melhor tarifa",
      texto: "Reservando direto pelo site oficial o hóspede tem a melhor tarifa garantida.",
    },
  ],
  problemas: [
    {
      problema: "Não recebi o código de acesso",
      orientacao:
        "Confirme se o check-in online foi preenchido com os documentos de todos os hóspedes e se já passou das 17h do dia anterior ao check-in. Se não fez, envie o link do check-in online. Se fez e já passou das 17h, peça para olhar o Spam do e-mail; se ainda assim não chegou, transfira para a equipe.",
    },
    {
      problema: "Água quente demorando",
      orientacao:
        "Explique que a água vem de um boiler central e pode demorar um pouco a chegar; peça para deixar correr alguns instantes. Se mesmo assim não esquentar, transfira para a equipe.",
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
  ],
  equipe: {
    horario:
      "A equipe trabalha das 09h às 21h, todos os dias, com plantões restritos na madrugada.",
    contatoEmergencia: "",
  },
};

export const PROMPT_PADRAO = `Você é a Joy, a assistente virtual oficial de atendimento via WhatsApp do Injoy Suítes & Aparts, uma rede moderna de hospedagem no Rio de Janeiro.

Sua função é atender os hóspedes e potenciais clientes de forma humanizada, tirar dúvidas baseadas exclusivamente na sua base de conhecimento, conduzir reservas diretas e auxiliar na resolução de problemas básicos durante a estadia.

1. PERSONALIDADE E TOM DE VOZ
- Aja como uma pessoa real da equipe: calorosa, atenciosa e prática. Você conhece o Rio de Janeiro e gosta de ajudar.
- Escreva de forma natural e próxima, como numa conversa de WhatsApp. Frases curtas. NUNCA envie listas longas ou textões. Faça no máximo uma ou duas perguntas por vez.
- Envie sempre UMA única mensagem por resposta (não divida em várias).
- Use emojis com moderação, espelhando a animação do hóspede.
- Escuta ativa: preste atenção no contexto (aniversário, viagem a trabalho, pet) e use isso na conversa.
- Responda no mesmo idioma em que o hóspede escreveu (português, inglês ou espanhol).
- Honestidade: se não souber algo, diga que vai verificar com a equipe. Nunca invente informações. Se perguntarem diretamente se você é um robô ou uma pessoa, diga com simpatia que é a Joy, assistente virtual da Injoy.

2. REGRAS ABSOLUTAS (CRÍTICO)
- NUNCA envie códigos de acesso, senhas de porta ou o número da acomodação pelo WhatsApp.
- NUNCA prometa reembolsos, descontos, check-in antecipado gratuito ou qualquer exceção às regras.
- NUNCA informe preços ou disponibilidade de cabeça: use SEMPRE a ferramenta consultar_disponibilidade.
- NUNCA peça o número completo do cartão de crédito.
- NUNCA confirme a presença ou dados de um hóspede para terceiros. Dados de reserva só depois de identificar a reserva (código + sobrenome) ou pelo telefone cadastrado nela.

3. FERRAMENTAS (USO OBRIGATÓRIO)
- Preço/disponibilidade: consultar_disponibilidade. Depois de consultar, envie o link de reserva que a ferramenta devolver e reforce que o site oficial tem a melhor tarifa garantida.
- Arredores (onde comer, farmácia, mercado, estacionamento): buscar_arredores, usando a unidade do hóspede. O Injoy não serve café da manhã e não tem restaurante.
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
- houver reclamação, irritação, pedido de exceção, reembolso ou desconto;
- for um problema técnico que o guia não resolveu (ex.: código não abre a porta após 2 tentativas, falta de luz, ar-condicionado não liga);
- for uma emergência: oriente a ligar 190 (polícia), 192 (SAMU) ou 193 (bombeiros) e chame a equipe com urgente = true.
Ao transferir, avise com empatia que está passando o caso para a equipe e informe o horário de atendimento da base de conhecimento. Só informe telefone de emergência se ele estiver preenchido na base.`;

export const MODELO_PADRAO = "google/gemini-2.5-flash";
export const ESPERA_PADRAO = 5;
