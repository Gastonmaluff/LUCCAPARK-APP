export type AvailabilityStatus = 'available' | 'reserved' | 'blocked' | 'consult'
export type PaymentStatus = 'paid' | 'payAtExit' | 'pending'
export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'qr' | 'other' | ''
export type UserRole = 'admin' | 'socio' | 'encargado_eventos' | 'recepcion' | 'cantina'
export type VisitTone = 'ok' | 'warn' | 'danger'
export type VisitTimeStatus = 'ok' | 'warning' | 'expired' | 'unlimited'
export type EventStatus = 'inquiry' | 'reserved' | 'confirmed' | 'active' | 'finished' | 'cancelled'
export type EventType = 'birthday' | 'private_event' | 'other'
export type EventCapacityStatus = 'ok' | 'near-limit' | 'over-limit'
export type CanteenCategory = 'Bebidas' | 'Snacks' | 'Comidas' | 'Combos' | 'Helados' | 'Otros'
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
  defaultPrice?: number | null
}

export interface CreateVisitInput {
  childName: string
  childBirthDate?: string
  childAgeRange?: string
  childExactAge?: number | null
  childAgeCalculated?: number | null
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
  cardType?: 'debit' | 'credit' | ''
  amountCharged?: number | null
  parkChargeAmount?: number | null
  parkPaymentStatus?: 'pending' | 'paid'
  parkPaidAt?: Date | null
  parkPaymentMethod?: PaymentMethod
  defaultAmount?: number | null
  customAmount?: boolean
  notes?: string
}

export interface ActiveVisit {
  id: string
  childId: string
  childName: string
  childBirthDate?: string
  childAgeRange?: string
  childExactAge?: number | null
  childAgeCalculated?: number | null
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
  cardType?: 'debit' | 'credit' | ''
  amountCharged?: number | null
  parkChargeAmount?: number | null
  parkPaymentStatus?: 'pending' | 'paid'
  parkPaidAt?: Date | null
  parkPaymentMethod?: PaymentMethod
  defaultAmount?: number | null
  customAmount?: boolean
  notes?: string
  status: 'active'
  createdAt?: Date | null
  updatedAt?: Date | null
  createdBy?: string | null
  updatedBy?: string | null
}

export interface CustomerProfile {
  id: string
  name: string
  phone?: string
  email?: string
  notes?: string
  marketingConsent: boolean
  marketingConsentAt?: Date | null
  createdAt?: Date | null
  updatedAt?: Date | null
}

export interface ChildProfile {
  id: string
  name: string
  birthDate?: string
  gender?: string
  ageRange?: string
  mainCustomerId?: string
  mainCustomerName?: string
  mainCustomerPhone?: string
  customerId?: string
  customerName?: string
  customerPhone?: string
  notes?: string
  visitCount: number
  eventGuestCount: number
  lastVisitAt?: Date | null
  lastSource?: 'visit' | 'event' | ''
  marketingConsent: boolean
  marketingConsentAt?: Date | null
  createdAt?: Date | null
  updatedAt?: Date | null
}

export interface ChargeVisitInput {
  paymentMethod: Exclude<PaymentMethod, ''>
  amountCharged?: number | null
}

export interface AppUserProfile {
  id: string
  uid: string
  displayName: string
  email: string
  role: UserRole
  isActive: boolean
  createdAt?: Date | null
  updatedAt?: Date | null
}

export interface PaymentRecord {
  id: string
  totalPaid: number
  paymentMethod?: PaymentMethod
  cardType?: 'debit' | 'credit' | ''
  paidAt?: Date | null
  createdAt?: Date | null
  source: 'reception_entry' | 'reception_exit' | 'canteen' | 'event_payment' | 'legacy' | string
  concepts?: 'park' | 'canteen' | 'event' | 'both' | string
  description?: string
  accountType?: string
  childName?: string
  customerName?: string
  eventName?: string
  visitId?: string
  canteenOrderId?: string
  canteenOrderIds?: string[]
  eventId?: string
  parkAmountPaid?: number
  canteenAmountPaid?: number
  eventAmountPaid?: number
  createdBy?: string | null
}

export type ExpenseCategory =
  | 'canteen_purchase'
  | 'decoration'
  | 'cleaning'
  | 'maintenance'
  | 'wages'
  | 'services'
  | 'operations'
  | 'other'

export interface ExpenseRecord {
  id: string
  date: string
  spentAt?: Date | null
  category: ExpenseCategory
  description: string
  amount: number
  paymentMethod: Exclude<PaymentMethod, ''>
  cardType?: 'debit' | 'credit' | ''
  type: 'general' | 'event'
  eventId?: string
  eventName?: string
  receiptUrl?: string
  notes?: string
  status?: 'active' | 'void'
  createdAt?: Date | null
  createdBy?: string | null
  updatedAt?: Date | null
  updatedBy?: string | null
}

export interface FinancialClosureRecord {
  id: string
  dateFrom: string
  dateTo: string
  generatedAt?: Date | null
  generatedBy?: string | null
  totalCollected: number
  totalExpenses: number
  netResult: number
  pendingAmount: number
  pdfUrl?: string
  totalsSnapshot?: Record<string, unknown>
}

export interface LuccaTask {
  id: string
  title: string
  description?: string
  assignedTo?: string
  assignedToName?: string
  createdBy?: string | null
  createdByName?: string
  createdAt?: Date | null
  dueAt?: Date | null
  priority: 'low' | 'medium' | 'high'
  status: 'pending' | 'in_progress' | 'completed'
  eventId?: string
  eventName?: string
  notes?: string
  completedAt?: Date | null
  completedBy?: string | null
  updatedAt?: Date | null
  updatedBy?: string | null
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
  totalAmount?: number | null
  depositAmount?: number | null
  pendingAmount?: number | null
  eventPaidAmount?: number | null
  financialStatus?: 'unpaid' | 'deposit' | 'partial' | 'paid' | 'pending' | string
  notes?: string
  tvModeEnabled: boolean
  tvDisplayEnabled?: boolean
  tvImageUrl?: string
  tvImageUpdatedAt?: Date | null
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
  totalAmount?: number | null
  depositAmount?: number | null
  pendingAmount?: number | null
  notes?: string
}

export interface EventGuest {
  id: string
  eventId: string
  childId?: string
  customerId?: string
  childName: string
  childBirthDate?: string
  childExactAge?: number | null
  childAgeCalculated?: number | null
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
  childExactAge?: number | null
  childAgeCalculated?: number | null
  childAgeRange?: string
  childGender?: string
  responsibleName: string
  responsiblePhone?: string
  notes?: string
}

export interface UpdateEventTvInput {
  tvModeEnabled: boolean
  tvDisplayEnabled?: boolean
  tvImageUrl?: string
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
  salePrice?: number
  unitCost?: number | null
  stock: number | null
  minStock: number | null
  imageUrl?: string
  isActive: boolean
  createdAt?: Date | null
  updatedAt?: Date | null
}

export interface CanteenOrderItem {
  productId: string
  productName: string
  category: CanteenCategory
  unitPrice: number
  unitCost?: number | null
  quantity: number
  subtotal: number
  costSubtotal?: number
}

export interface CanteenOrder {
  id: string
  type: CanteenAccountType
  visitId?: string
  eventId?: string
  childId?: string
  childName?: string
  customerId?: string
  accountName: string
  customerName?: string
  customerPhone?: string
  items: CanteenOrderItem[]
  total: number
  costTotal?: number
  estimatedProfit?: number
  status: CanteenOrderStatus
  paymentStatus: 'pending' | 'paid'
  paymentMethod?: PaymentMethod
  cardType?: 'debit' | 'credit' | ''
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
  unitCost?: number | null
  stock?: number | null
  minStock?: number | null
  imageUrl?: string
  isActive: boolean
}

export interface CreateCanteenOrderInput {
  type: CanteenAccountType
  visitId?: string
  eventId?: string
  childId?: string
  childName?: string
  customerId?: string
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
