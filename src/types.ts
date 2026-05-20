export type AvailabilityStatus = 'available' | 'reserved' | 'blocked' | 'consult'
export type PaymentStatus = 'paid' | 'payAtExit' | 'pending'
export type VisitTone = 'ok' | 'warn' | 'danger'

export interface PackagePlan {
  name: string
  summary: string
  duration: string
  children: string
  features: string[]
  tone: 'orange' | 'green' | 'turquoise' | 'yellow'
}

export interface CalendarDay {
  day: number
  status?: AvailabilityStatus
  faded?: boolean
}

export interface ActiveVisitDemo {
  childName: string
  responsible: string
  checkIn: string
  remaining: string
  paymentStatus: PaymentStatus
  tone: VisitTone
}

export interface EventDemo {
  name: string
  client: string
  date: string
  time: string
  capacity: number
  checkedIn: number
  status: 'confirmed' | 'pending' | 'blocked'
}

export interface ReservationDemo {
  id: string
  childName: string
  client: string
  date: string
  time: string
  packageName: string
  status: 'consulta' | 'reservado' | 'confirmado' | 'cancelado'
}

export interface CanteenProductDemo {
  name: string
  category: string
  price: string
  stock: number
  lowStock?: boolean
}

export interface OpenAccountDemo {
  name: string
  source: 'visita' | 'evento' | 'libre'
  total: string
  items: number
}
