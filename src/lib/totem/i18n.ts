import type { Motivo } from "./regras";

export type Idioma = "pt" | "en" | "es";

export const IDIOMAS: Array<{ id: Idioma; rotulo: string; curto: string }> = [
  { id: "pt", rotulo: "Português", curto: "PT" },
  { id: "en", rotulo: "English", curto: "EN" },
  { id: "es", rotulo: "Español", curto: "ES" },
];

const pt = {
  boasVindas: "Bem-vindo ao IN.JOY",
  oQueFazer: "O que você quer fazer?",
  checkin: "Fazer check-in",
  checkinSub: "Receba a senha da porta do seu quarto",
  checkout: "Fazer check-out",
  checkoutSub: "Encerre a estadia e devolva o quarto",
  voltar: "Voltar",
  inicio: "Início",
  continuar: "Continuar",
  conferindo: "Conferindo…",
  porCodigo: "Tenho o código da reserva",
  porDocumento: "Usar nome e documento",
  codigo: "Código da reserva",
  codigoAjuda: "Está no e-mail de confirmação (Booking, Airbnb ou site).",
  sobrenome: "Sobrenome",
  sobrenomeAjuda: "O sobrenome de quem fez a reserva.",
  nome: "Nome completo",
  documento: "Número do documento",
  documentoAjuda: "CPF ou passaporte informado na reserva.",
  quarto: "Número do quarto",
  ola: (n: string) => (n ? `Olá, ${n}!` : "Olá!"),
  seuQuarto: (q: string[]) => (q.length > 1 ? `Quartos ${q.join(", ")}` : `Quarto ${q[0] ?? ""}`),
  saidaEm: (d: string) => `Saída em ${d}`,
  confirmarCheckin: "Confirmar check-in e receber a senha",
  gerandoSenha: "Gerando sua senha…",
  suaSenha: "Sua senha",
  comoAbrir: "Digite os números no teclado da porta e aperte # no final.",
  ativacao: "A senha pode levar até 2 minutos para funcionar.",
  validaAte: (d: string) => `Válida até ${d}.`,
  outrasPortas: "Portas da entrada",
  mesmaSenha: "mesma senha",
  portaSemSenha: "a equipe abre para você",
  anoteSenha: "Tire uma foto desta tela ou anote a senha antes de sair.",
  pronto: "Pronto",
  confirmarCheckout: "Confirmar check-out",
  saindo: "Encerrando…",
  checkoutFeito: "Check-out concluído",
  obrigado: "Obrigado pela estadia! A senha da porta foi desativada.",
  comoFoi: "Como foi a sua estadia?",
  comentario: "Quer deixar um comentário? (opcional)",
  enviar: "Enviar avaliação",
  pular: "Pular",
  avaliacaoEnviada: "Obrigado pela avaliação!",
  naoEncontrada: "Não encontramos a reserva com esses dados.",
  naoEncontradaDica: "Confira se digitou igual ao e-mail da reserva. Depois de algumas tentativas o totem pausa por 10 minutos.",
  naoEncontradaCheckout: "Não encontramos hóspede com esse quarto e sobrenome.",
  bloqueado: "Muitas tentativas. O totem está pausado por alguns minutos.",
  bloqueadoDica: "Fale com a nossa equipe para continuar agora.",
  naoDeuCerto: "Não deu para concluir pelo totem",
  falarEquipe: "Fale com a nossa equipe",
  ligar: (t: string) => `Ligue ou mande mensagem: ${t}`,
  erro: "Algo deu errado",
  tentarDeNovo: "Tentar de novo",
  pareamentoTitulo: "Configurar este totem",
  pareamentoAjuda: "Na Área do Gestor › Totem, gere o código de pareamento e digite aqui.",
  pareamentoCodigo: "Código de pareamento",
  parear: "Conectar totem",
  aindaAqui: "Ainda está aí? Voltando ao início…",
  motivo: (m: Motivo, fmtData: (d: string) => string, fmtValor: (v: number) => string): string => {
    switch (m.codigo) {
      case "reserva_cancelada": return "Esta reserva está cancelada.";
      case "ja_saiu": return "Esta reserva já fez check-out.";
      case "ja_hospedado": return "O check-in desta reserva já foi feito.";
      case "chegada_outro_dia": return m.data ? `A chegada desta reserva é em ${fmtData(m.data)}.` : "A chegada desta reserva não é hoje.";
      case "antes_do_horario": return `O check-in começa às ${m.hora}.`;
      case "sem_quarto": return "Ainda não há quarto definido para a sua reserva.";
      case "quarto_nao_limpo": return `O quarto ${m.quarto} ainda está sendo preparado.`;
      case "sem_fechadura": return `O quarto ${m.quarto} não tem fechadura digital.`;
      case "saldo_aberto": return `Há um valor em aberto de ${fmtValor(m.valor)}.`;
      case "nao_hospedado": return "Não há check-in ativo para este quarto.";
    }
  },
};

type Textos = typeof pt;

const en: Textos = {
  boasVindas: "Welcome to IN.JOY",
  oQueFazer: "What would you like to do?",
  checkin: "Check in",
  checkinSub: "Get the door code for your room",
  checkout: "Check out",
  checkoutSub: "End your stay and hand back the room",
  voltar: "Back",
  inicio: "Start",
  continuar: "Continue",
  conferindo: "Checking…",
  porCodigo: "I have my booking code",
  porDocumento: "Use name and ID",
  codigo: "Booking code",
  codigoAjuda: "It's in your confirmation e-mail (Booking, Airbnb or our website).",
  sobrenome: "Last name",
  sobrenomeAjuda: "The last name of the person who booked.",
  nome: "Full name",
  documento: "ID or passport number",
  documentoAjuda: "The document number given in the booking.",
  quarto: "Room number",
  ola: (n) => (n ? `Hi, ${n}!` : "Hi!"),
  seuQuarto: (q) => (q.length > 1 ? `Rooms ${q.join(", ")}` : `Room ${q[0] ?? ""}`),
  saidaEm: (d) => `Check-out on ${d}`,
  confirmarCheckin: "Confirm check-in and get my code",
  gerandoSenha: "Creating your code…",
  suaSenha: "Your door code",
  comoAbrir: "Type the numbers on the door keypad and press # at the end.",
  ativacao: "The code can take up to 2 minutes to start working.",
  validaAte: (d) => `Valid until ${d}.`,
  outrasPortas: "Entrance doors",
  mesmaSenha: "same code",
  portaSemSenha: "our team will open it",
  anoteSenha: "Take a photo of this screen or write the code down before you go.",
  pronto: "Done",
  confirmarCheckout: "Confirm check-out",
  saindo: "Checking out…",
  checkoutFeito: "You're checked out",
  obrigado: "Thanks for staying with us! Your door code has been turned off.",
  comoFoi: "How was your stay?",
  comentario: "Anything you'd like to tell us? (optional)",
  enviar: "Send rating",
  pular: "Skip",
  avaliacaoEnviada: "Thanks for your rating!",
  naoEncontrada: "We couldn't find a booking with these details.",
  naoEncontradaDica: "Type them exactly as in your booking e-mail. After a few tries the kiosk pauses for 10 minutes.",
  naoEncontradaCheckout: "We couldn't find a guest with this room and last name.",
  bloqueado: "Too many attempts. The kiosk is paused for a few minutes.",
  bloqueadoDica: "Contact our team to continue now.",
  naoDeuCerto: "This can't be finished at the kiosk",
  falarEquipe: "Contact our team",
  ligar: (t) => `Call or message: ${t}`,
  erro: "Something went wrong",
  tentarDeNovo: "Try again",
  pareamentoTitulo: "Set up this kiosk",
  pareamentoAjuda: "In Área do Gestor › Totem, create a pairing code and type it here.",
  pareamentoCodigo: "Pairing code",
  parear: "Connect kiosk",
  aindaAqui: "Still there? Going back to the start…",
  motivo: (m, fmtData, fmtValor) => {
    switch (m.codigo) {
      case "reserva_cancelada": return "This booking is cancelled.";
      case "ja_saiu": return "This booking is already checked out.";
      case "ja_hospedado": return "This booking is already checked in.";
      case "chegada_outro_dia": return m.data ? `This booking arrives on ${fmtData(m.data)}.` : "This booking doesn't arrive today.";
      case "antes_do_horario": return `Check-in starts at ${m.hora}.`;
      case "sem_quarto": return "A room hasn't been assigned to your booking yet.";
      case "quarto_nao_limpo": return `Room ${m.quarto} is still being prepared.`;
      case "sem_fechadura": return `Room ${m.quarto} doesn't have a digital lock.`;
      case "saldo_aberto": return `There is an outstanding balance of ${fmtValor(m.valor)}.`;
      case "nao_hospedado": return "There's no active check-in for this room.";
    }
  },
};

const es: Textos = {
  boasVindas: "Bienvenido a IN.JOY",
  oQueFazer: "¿Qué quieres hacer?",
  checkin: "Hacer check-in",
  checkinSub: "Recibe la clave de la puerta de tu habitación",
  checkout: "Hacer check-out",
  checkoutSub: "Termina tu estadía y entrega la habitación",
  voltar: "Volver",
  inicio: "Inicio",
  continuar: "Continuar",
  conferindo: "Verificando…",
  porCodigo: "Tengo el código de la reserva",
  porDocumento: "Usar nombre y documento",
  codigo: "Código de la reserva",
  codigoAjuda: "Está en el e-mail de confirmación (Booking, Airbnb o nuestro sitio).",
  sobrenome: "Apellido",
  sobrenomeAjuda: "El apellido de quien hizo la reserva.",
  nome: "Nombre completo",
  documento: "Número de documento",
  documentoAjuda: "DNI o pasaporte informado en la reserva.",
  quarto: "Número de habitación",
  ola: (n) => (n ? `¡Hola, ${n}!` : "¡Hola!"),
  seuQuarto: (q) => (q.length > 1 ? `Habitaciones ${q.join(", ")}` : `Habitación ${q[0] ?? ""}`),
  saidaEm: (d) => `Salida el ${d}`,
  confirmarCheckin: "Confirmar check-in y recibir la clave",
  gerandoSenha: "Creando tu clave…",
  suaSenha: "Tu clave",
  comoAbrir: "Marca los números en el teclado de la puerta y presiona # al final.",
  ativacao: "La clave puede tardar hasta 2 minutos en funcionar.",
  validaAte: (d) => `Válida hasta ${d}.`,
  outrasPortas: "Puertas de entrada",
  mesmaSenha: "misma clave",
  portaSemSenha: "nuestro equipo la abre",
  anoteSenha: "Saca una foto de esta pantalla o anota la clave antes de irte.",
  pronto: "Listo",
  confirmarCheckout: "Confirmar check-out",
  saindo: "Finalizando…",
  checkoutFeito: "Check-out realizado",
  obrigado: "¡Gracias por tu estadía! La clave de la puerta fue desactivada.",
  comoFoi: "¿Cómo fue tu estadía?",
  comentario: "¿Quieres dejar un comentario? (opcional)",
  enviar: "Enviar evaluación",
  pular: "Omitir",
  avaliacaoEnviada: "¡Gracias por tu evaluación!",
  naoEncontrada: "No encontramos la reserva con estos datos.",
  naoEncontradaDica: "Escríbelos igual que en el e-mail de la reserva. Tras algunos intentos el tótem se pausa por 10 minutos.",
  naoEncontradaCheckout: "No encontramos un huésped con esta habitación y apellido.",
  bloqueado: "Demasiados intentos. El tótem está en pausa por unos minutos.",
  bloqueadoDica: "Habla con nuestro equipo para continuar ahora.",
  naoDeuCerto: "No se puede terminar en el tótem",
  falarEquipe: "Habla con nuestro equipo",
  ligar: (t) => `Llama o escribe: ${t}`,
  erro: "Algo salió mal",
  tentarDeNovo: "Intentar de nuevo",
  pareamentoTitulo: "Configurar este tótem",
  pareamentoAjuda: "En Área do Gestor › Totem, genera el código y escríbelo aquí.",
  pareamentoCodigo: "Código de emparejamiento",
  parear: "Conectar tótem",
  aindaAqui: "¿Sigues ahí? Volviendo al inicio…",
  motivo: (m, fmtData, fmtValor) => {
    switch (m.codigo) {
      case "reserva_cancelada": return "Esta reserva está cancelada.";
      case "ja_saiu": return "Esta reserva ya hizo check-out.";
      case "ja_hospedado": return "El check-in de esta reserva ya fue hecho.";
      case "chegada_outro_dia": return m.data ? `La llegada de esta reserva es el ${fmtData(m.data)}.` : "La llegada de esta reserva no es hoy.";
      case "antes_do_horario": return `El check-in empieza a las ${m.hora}.`;
      case "sem_quarto": return "Tu reserva todavía no tiene habitación asignada.";
      case "quarto_nao_limpo": return `La habitación ${m.quarto} todavía se está preparando.`;
      case "sem_fechadura": return `La habitación ${m.quarto} no tiene cerradura digital.`;
      case "saldo_aberto": return `Hay un saldo pendiente de ${fmtValor(m.valor)}.`;
      case "nao_hospedado": return "No hay check-in activo para esta habitación.";
    }
  },
};

export const TEXTOS: Record<Idioma, Textos> = { pt, en, es };

const LOCALE: Record<Idioma, string> = { pt: "pt-BR", en: "en-GB", es: "es-ES" };

export function formatadores(idioma: Idioma) {
  const locale = LOCALE[idioma];
  return {
    data: (d: string) =>
      d
        ? new Date(`${d}T12:00:00Z`).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
        : "",
    dataHora: (iso: string) =>
      new Date(iso).toLocaleString(locale, {
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      }),
    valor: (v: number) => v.toLocaleString(locale, { style: "currency", currency: "BRL" }),
  };
}
