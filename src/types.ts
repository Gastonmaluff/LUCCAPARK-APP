export type AvailabilityStatus = 'available' | 'reserved' | 'blocked' | 'consult'
export type PaymentStatus = 'paid' | 'payAtExit' | 'pending'
export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'qr' | 'other' | ''
export type VisitTone = 'ok' | 'warn' | 'danger'
export type VisitTimeStatus = 'ok' | 'warning' | 'expired' | 'unlimited'

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

export interface TimePlan {
  id: 'one-hour' | 'two-hours' | 'unlimited'
  name: string
  durationMinutes: number | null
  isUnlimited: boolean
}

export interface CreateVisitInput {
  childName: string
  childBirthDate?: string
  childAgeRange?: string
  childGender?: string
  childNotes?: string
  customerName: string
  customerPhone?: string
  customerRelation?: string
  childrenCount: number
  planId: TimePlan['id']
  startedAt: Date
  paymentStatus: PaymentStatus
  paymentMethod?: PaymentMethod
  amountCharged?: number | null
  notes?: string
}

export interface ActiveVisit {
  id: string
  childId: string
  childName: string
  childBirthDate?: string
  childAgeRange?: string
  childGender?: string
  customerId: string
  customerName: string
  customerPhone?: string
  customerRelation?: string
  childrenCount: number
  planId: TimePlan['id']
  planName: string
  durationMinutes: number | null
  isUnlimited: boolean
  startedAt: Date
  expectedEndAt: Date | null
  paymentStatus: PaymentStatus
  paymentMethod?: PaymentMethod
  amountCharged?: number | null
  notes?: string
  status: 'active'
  createdAt?: Date | null
  updatedAt?: Date | null
  createdBy?: string | null
  updatedBy?: string | null
}

export interface ChargeVisitInput {
  paymentMethod: Exclude<PaymentMethod, ''>
  amountCharged?: number | null
}
