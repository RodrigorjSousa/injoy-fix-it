// Lições tiradas das conversas reais da recepção (out/2025 a out/2026), revisadas pelo Rodrigo em 23/10/2026.
// Sem nomes, telefones nem códigos. Entram na aba Lições pelo botão "Importar lições sugeridas"
// (origem "conversas"); as que já existem (mesma situação) não são duplicadas.

export type LicaoSugerida = {
  tema: string;
  situacao: string;
  resposta_certa: string;
  motivo?: string;
};

export const LICOES_SUGERIDAS: LicaoSugerida[] = [
  {
    tema: "Cotação",
    situacao: "Tem quarto para dia 10 a 12, casal?",
    resposta_certa: "Oi! Aqui é a Joy, assistente virtual do Injoy ☺️ Prefere Ipanema ou Botafogo?",
    motivo:
      "A recepção sempre pergunta a unidade primeiro. Depois consulta o Cloudbeds e manda tipos, valores e o link.",
  },
  {
    tema: "Preço",
    situacao: "Esse valor é por pessoa?",
    resposta_certa: "É o valor total da acomodação para o período, não por pessoa ☺️",
  },
  {
    tema: "Café da manhã",
    situacao: "Tem café da manhã?",
    resposta_certa:
      "Não temos serviço de café da manhã, mas tem padarias e cafés ótimos pertinho. Quer que eu indique alguns?",
  },
  {
    tema: "Estacionamento",
    situacao: "Tem estacionamento? (Botafogo)",
    resposta_certa:
      "Não temos estacionamento. A rua é sem saída e tem guarita, mas é pública e as vagas não são do hotel, então não dá para garantir. Pertinho tem o Estapar (Rua Paulino Fernandes, 39) e o America Park (Rua São Clemente, 258), os dois 24h. Os valores são direto com eles.",
  },
  {
    tema: "Estacionamento",
    situacao: "Tem estacionamento? (Ipanema)",
    resposta_certa:
      "Não temos estacionamento, mas tem o Ipanema Parking (Rua Prudente de Morais, 1008, 24h) e o MultiPark (Rua Visconde de Pirajá, 495, das 7h30 às 23h). Os valores são direto com eles.",
  },
  {
    tema: "Pagamento",
    situacao: "Posso parcelar?",
    resposta_certa:
      "Não parcelamos. No site tem a Tarifa Exclusiva Site, cobrada 3 dias antes da chegada e com cancelamento grátis até lá, e a Não reembolsável, que pode ser cobrada logo após a reserva.",
  },
  {
    tema: "Early check-in",
    situacao: "Chego às 7h, posso entrar antes?",
    resposta_certa:
      "O check-in é a partir das 14h, mas você já pode deixar as malas com a gente desde as 6h e usar o banheiro e as áreas comuns. Se quiser entrar antes, tem o early check-in pago: é só escolher as horas no link da loja da unidade. A disponibilidade é confirmada no dia anterior à chegada ☺️",
    motivo: "Mandar o link da loja da unidade da reserva; nunca prometer early check-in grátis.",
  },
  {
    tema: "Bebê",
    situacao: "Esqueci, o bebê conta?",
    resposta_certa: "Bebê até 3 anos não paga e não conta na quantidade de hóspedes ☺️",
  },
  {
    tema: "Códigos de acesso",
    situacao: "Não recebi o código da porta (véspera da chegada)",
    resposta_certa:
      "Os códigos chegam por e-mail até as 17h da véspera, depois do check-in online com os documentos de todos. Você já preencheu? Se quiser, te mando o link.",
    motivo:
      "No dia da chegada, ou com o check-in online feito e passado das 17h, passar para a equipe.",
  },
  {
    tema: "Códigos de acesso",
    situacao: "Estou na porta e não consigo entrar",
    resposta_certa: "Vou chamar a equipe agora para te ajudar!",
    motivo: "Transferir como urgente, sem mandar código nenhum.",
  },
  {
    tema: "Itens",
    situacao: "Tem shampoo e secador?",
    resposta_certa:
      "Tem shampoo, condicionador e sabonete na acomodação. O secador e o ferro ficam no bagageiro ao lado da recepção em Botafogo e no armário perto do banheiro do 2º piso em Ipanema; é só devolver depois ☺️",
  },
  {
    tema: "Cancelamento",
    situacao: "Quero cancelar minha reserva",
    resposta_certa: "Claro, vou te ajudar. Me passa o número da reserva e o sobrenome do titular?",
    motivo:
      "Depois de identificar a reserva, usar avaliar_cancelamento: o sistema decide se há reembolso. Nunca prometer reembolso. Saúde, carta de crédito ou exceção: passar para a equipe.",
  },
  {
    tema: "Pagamento",
    situacao: "Meu pagamento não passou",
    resposta_certa:
      "Normalmente o banco pede uma autorização por e-mail ou pelo app, dá uma olhadinha até no spam. Se preferir, dá para atualizar o cartão na reserva em até 24h para não cancelar, ou a equipe te manda um link de pagamento.",
  },
  {
    tema: "Pets",
    situacao: "Aceitam gato?",
    resposta_certa:
      "Por enquanto aceitamos somente cães 🐶 Se for viajar com um cachorro, me conta que eu te explico como funciona!",
  },
  {
    tema: "Idioma",
    situacao: "Hello, do you have a room for tonight?",
    resposta_certa:
      "Hi! This is Joy, Injoy's virtual assistant ☺️ Would you prefer Ipanema or Botafogo?",
    motivo: "Responder no idioma do hóspede, na mesma ordem: unidade, pessoas, depois o Cloudbeds.",
  },
];
