export type ForecastReservation = {
  roomNumber: string;
  checkIn: string;
  checkOut: string;
  status: string;
  arrivalTime: string | null;
};

export type ForecastTask = {
  quarto: string;
  tarefa: "GERAL" | "GERAL - CHECK-IN" | "TROCA + ARRUMAÇÃO" | "ARRUMAÇÃO" | "REVISÃO";
  chegada: string | null;
};

const DAY_MS = 86_400_000;
const excluded = new Set(["canceled", "cancelled", "cancelada", "no_show"]);
const dayDiff = (date: string, start: string) =>
  Math.floor((new Date(`${date}T12:00:00Z`).getTime() - new Date(`${start}T12:00:00Z`).getTime()) / DAY_MS);

export function predictHousekeepingTasks(reservations: ForecastReservation[], rooms: string[], date: string): ForecastTask[] {
  const valid = reservations.filter((reservation) => !excluded.has(reservation.status.toLowerCase()));
  const tasks: ForecastTask[] = [];
  for (const roomNumber of rooms) {
    const roomReservations = valid.filter((reservation) => reservation.roomNumber === roomNumber);
    const departure = roomReservations.find((reservation) => reservation.checkOut === date);
    const arrival = roomReservations.find((reservation) => reservation.checkIn === date);
    if (departure && arrival) { tasks.push({ quarto: roomNumber, tarefa: "GERAL - CHECK-IN", chegada: arrival.arrivalTime }); continue; }
    if (departure) { tasks.push({ quarto: roomNumber, tarefa: "GERAL", chegada: null }); continue; }
    const inHouse = roomReservations.find((reservation) => reservation.checkIn < date && reservation.checkOut > date);
    if (inHouse) {
      const troca = dayDiff(date, inHouse.checkIn) > 0 && dayDiff(date, inHouse.checkIn) % 3 === 0;
      tasks.push({ quarto: roomNumber, tarefa: troca ? "TROCA + ARRUMAÇÃO" : "ARRUMAÇÃO", chegada: null }); continue;
    }
    if (arrival) tasks.push({ quarto: roomNumber, tarefa: "REVISÃO", chegada: arrival.arrivalTime });
  }
  return tasks;
}