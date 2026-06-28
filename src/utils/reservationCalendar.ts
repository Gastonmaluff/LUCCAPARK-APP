export interface ReservationCalendarDayLike {
  dateKey: string
  isCurrentMonth: boolean
}

export const canSelectReservationCalendarDay = (day: ReservationCalendarDayLike, todayKey: string) =>
  day.isCurrentMonth && day.dateKey >= todayKey

export const getReservationCalendarDayStatus = (day: ReservationCalendarDayLike, todayKey: string) => {
  if (!day.isCurrentMonth) {
    return 'outside'
  }

  if (day.dateKey < todayKey) {
    return 'past'
  }

  if (day.dateKey === todayKey) {
    return 'today'
  }

  return 'future'
}

export const getReservationCalendarAvailabilityLabel = (day: ReservationCalendarDayLike, todayKey: string) =>
  canSelectReservationCalendarDay(day, todayKey) ? 'Disponible' : 'No disponible'
