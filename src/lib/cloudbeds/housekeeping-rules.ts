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
  return rooms.flatMap((roomNumber) => {
    const roomReservations = valid.filter((reservation) => reservation.roomNumber === roomNumber);
    const departure = roomReservations.find((reservation) => reservation.checkOut === date);
    const arrival = roomReservations.find((reservation) => reservation.checkIn === date);
    if (departure && arrival) return [{ quarto: roomNumber, tarefa: "GERAL - CHECK-IN" as const, chegada: arrival.arrivalTime }];
    if (departure) return [{ quarto: roomNumber, tarefa: "GERAL" as const, chegada: null }];
    const inHouse = roomReservations.find((reservation) => reservation.checkIn < date && reservation.checkOut > date);
    if (inHouse) {
      const troca = dayDiff(date, inHouse.checkIn) > 0 && dayDiff(date, inHouse.checkIn) % 3 === 0;
      return [{ quarto: roomNumber, tarefa: troca ? "TROCA + ARRUMAÇÃO" as const : "ARRUMAÇÃO" as const, chegada: null }];
    }
    if (arrival) return [{ quarto: roomNumber, tarefa: "REVISÃO" as const, chegada: arrival.arrivalTime }];
    return [];
  });
}