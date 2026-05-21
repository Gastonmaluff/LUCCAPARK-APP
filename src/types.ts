export type AvailabilityStatus = 'available' | 'reserved' | 'blocked' | 'consult'
export type PaymentStatus = 'paid' | 'payAtExit' | 'pending'
export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'qr' | 'other' | ''
export type VisitTone = 'ok' | 'warn' | 'danger'
export type VisitTimeStatus = 'ok' | 'warning' | 'expired' | 'unlimited'
export type EventStatus = 'inquiry' | 'reserved' | 'confirmed' | 'active' | 'finished' | 'cancelled'
export type EventType = 'birthday' | 'private_event' | 'other'
export type EventCapacityStatus = 'ok' | 'near-limit' | 'over-limit'
export type CanteenCategory = 'Bebidas' | 'Snacks' | 'Comidas' | 'Combos' | 'Otros'
export type CanteenAccountType = 'visit' | 'event' | 'free'
export type CanteenOrderStatus = 'open' | 'paid' | 'cancelled'

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

export interface CanteenProduct {
  id: string
  name: string
  category: CanteenCategory
  price: number
  stock: number | null
  minStock: number | null
  isActive: boolean
  createdAt?: Date | null
  updatedAt?: Date | null
}

export interface CanteenOrderItem {
  productId: string
  productName: string
  category: CanteenCategory
  unitPrice: number
  quantity: number
  subtotal: number
}

export interface CanteenOrder {
  id: string
  type: CanteenAccountType
  visitId?: string
  eventId?: string
  accountName: string
  customerName?: string
  customerPhone?: string
  items: CanteenOrderItem[]
  total: number
  status: CanteenOrderStatus
  paymentStatus: 'pending' | 'paid'
  paymentMethod?: PaymentMethod
  notes?: string
  createdAt?: Date | null
  updatedAt?: Date | null
  paidAt?: Date | null
  createdBy?: string | null
  updatedBy?: string | null
}

export interface UpsertCanteenProductInput {
  id?: string
  name: string
  category: CanteenCategory
  price: number
  stock?: number | null
  minStock?: number | null
  isActive: boolean
}

export interface CreateCanteenOrderInput {
  type: CanteenAccountType
  visitId?: string
  eventId?: string
  accountName: string
  customerName?: string
  customerPhone?: string
  items: CanteenOrderItem[]
  notes?: string
  chargeNow: boolean
  paymentMethod?: Exclude<PaymentMethod, ''>
}

export interface DailyClosing {
  id: string
  date: string
  totals: {
    totalCollected: number
    visitsCollected: number
    canteenCollected: number
    eventsCollected: number
  }
  paymentMethodsSummary: Record<Exclude<PaymentMethod, ''>, number>
  visitsSummary: {
    registered: number
    finished: number
    active: number
    pendingPayment: number
  }
  canteenSummary: {
    paidOrders: number
    openOrders: number
    cancelledOrders: number
    paidTotal: number
  }
  eventsSummary: {
    activeEvents: number
    eventsToday: number
    guestsRegistered: number
  }
  openAccountsCount: number
  pendingAmount: number
  notes?: string
  createdAt?: Date | null
  createdBy?: string | null
}
