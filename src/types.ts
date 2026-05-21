export type AvailabilityStatus = 'available' | 'reserved' | 'blocked' | 'consult'
export type PaymentStatus = 'paid' | 'payAtExit' | 'pending'
export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'qr' | 'other' | ''
export type VisitTone = 'ok' | 'warn' | 'danger'
export type VisitTimeStatus = 'ok' | 'warning' | 'expired' | 'unlimited'
export type EventStatus = 'inquiry' | 'reserved' | 'confirmed' | 'active' | 'finished' | 'cancelled'
export type EventType = 'birthday' | 'private_event' | 'other'
export type EventCapacityStatus = 'ok' | 'near-limit' | 'over-limit'

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

export interface LuccaEvent {
  id: string
  title: string
  birthdayChildName: string
  customerName: string
  customerPhone?: string
  date: string
  startTime: string
  endTime: string
  contractedChildrenCount: number
  registeredGuestsCount: number
  status: EventStatus
  eventType: EventType
  notes?: string
  tvModeEnabled: boolean
  tvTitle?: string
  tvMessage?: string
  tvBannerImageUrl?: string
  showGuestCounterOnTv: boolean
  showEventNameOnTv: boolean
  hideSensitiveInfoOnTv: boolean
  createdAt?: Date | null
  updatedAt?: Date | null
  createdBy?: string | null
  updatedBy?: string | null
}

export interface CreateEventInput {
  title: string
  birthdayChildName: string
  customerName: string
  customerPhone?: string
  date: string
  startTime: string
  endTime: string
  contractedChildrenCount: number
  status: EventStatus
  eventType: EventType
  notes?: string
}

export interface EventGuest {
  id: string
  eventId: string
  childName: string
  childBirthDate?: string
  childAgeRange?: string
  childGender?: string
  responsibleName: string
  responsiblePhone?: string
  notes?: string
  checkedInAt: Date
  guestNumber: number
  isExtra: boolean
  source: 'event'
  eventName: string
  eventDate: string
  birthdayChildName: string
  createdAt?: Date | null
  updatedAt?: Date | null
  createdBy?: string | null
}

export interface CreateEventGuestInput {
  event: LuccaEvent
  childName: string
  childBirthDate?: string
  childAgeRange?: string
  childGender?: string
  responsibleName: string
  responsiblePhone?: string
  notes?: string
}

export interface UpdateEventTvInput {
  tvModeEnabled: boolean
  tvTitle?: string
  tvMessage?: string
  tvBannerImageUrl?: string
  showGuestCounterOnTv: boolean
  showEventNameOnTv: boolean
  hideSensitiveInfoOnTv: boolean
}
