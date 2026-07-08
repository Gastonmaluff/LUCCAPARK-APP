export type AvailabilityStatus = 'available' | 'reserved' | 'blocked' | 'consult'
export type PaymentStatus = 'paid' | 'payAtExit' | 'pending'
export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'qr' | 'other' | ''
export type UserRole = 'admin' | 'socio' | 'encargado_eventos' | 'recepcion' | 'cantina'
export type VisitTone = 'ok' | 'warn' | 'danger'
export type VisitTimeStatus = 'ok' | 'warning' | 'expired' | 'unlimited'
export type EventStatus = 'inquiry' | 'reserved' | 'confirmed' | 'active' | 'finished' | 'cancelled'
export type EventType = 'birthday' | 'private_event' | 'other'
export type EventCapacityStatus = 'ok' | 'near-limit' | 'over-limit'
export type CanteenCategory = string
export type CanteenAccountType = 'visit' | 'event' | 'free'
export type CanteenOrderStatus = 'open' | 'paid' | 'cancelled' | 'closed_empty' | 'void_requested' | 'voided' | 'refunded'
export type CanteenLineStatus = 'active' | 'void_requested' | 'voided' | 'courtesy' | 'waste'

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
  groupEntryId?: string
  childId?: string
  childName: string
  childBirthDate?: string
  childAgeRange?: string
  childExactAge?: number | null
  childAgeCalculated?: number | null
  childGender?: string
  childNotes?: string
  customerId?: string
  customerName: string
  customerPhone?: string
  customerRelation?: string
  customerDocumentNumber?: string
  customerDocumentNumberNormalized?: string
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
  promotionalAdjustment?: {
    type: 'percentage' | 'finalAmount'
    percentage?: number | null
    finalAmount?: number | null
    reason: string
  } | null
  babyFreeEntry?: {
    requested: boolean
    reason?: string
    overrideReason?: string
  } | null
  notes?: string
}

export interface VisitTimeExtension {
  id: string
  type: 'time_extension'
  minutes: 30 | 60
  amount: number
  previousEndTime?: Date | null
  newEndTime: Date
  createdAt?: Date | null
  createdBy?: string | null
  createdByName?: string
  createdByRole?: UserRole
  pricingSnapshot?: {
    amount: number
    key: 'extension30MinutePrice' | 'extension60MinutePrice'
    source: 'settings/visitPricing'
  }
}

export interface UnlimitedVisitPricing {
  type?: 'unlimited_checkout'
  startedAt?: Date | null
  endedAt?: Date | null
  elapsedMinutes?: number
  billableHours?: number
  hourlyRate?: number
  suggestedAmount?: number
  finalAmount?: number
  difference?: number
  reason?: string
  adjustedBy?: string | null
  adjustedByName?: string
  adjustedByRole?: UserRole | ''
  adjustedAt?: Date | null
  sourceIntegrity?: 'secure_backend'
}

export interface PromotionalAdjustmentAudit {
  type?: 'percentage' | 'final_amount'
  originalAmount?: number
  percentage?: number | null
  discountAmount?: number
  finalAmount?: number
  reason?: string
  adjustedBy?: string | null
  adjustedByName?: string
  adjustedByRole?: UserRole | ''
  adjustedAt?: Date | null
  sourceIntegrity?: 'secure_backend'
}

export interface BabyFreeEntryAudit {
  applied?: boolean
  mode?: 'auto' | 'manual'
  maxAgeMonths?: number | null
  ageMonthsAtEntry?: number | null
  birthDate?: string
  reason?: string
  appliedBy?: string | null
  appliedByName?: string
  appliedByRole?: UserRole | ''
  appliedAt?: Date | null
  sourceIntegrity?: 'secure_backend'
}

export interface ActiveVisit {
  id: string
  groupEntryId?: string
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
  customerDocumentNumber?: string
  customerDocumentNumberNormalized?: string
  guardianId?: string
  guardianDocumentNumber?: string
  guardianDocumentNumberNormalized?: string
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
  paidParkAmount?: number | null
  extensionChargeAmount?: number | null
  parkPaymentStatus?: 'pending' | 'paid' | 'partial'
  parkPaidAt?: Date | null
  parkPaymentMethod?: PaymentMethod
  defaultAmount?: number | null
  customAmount?: boolean
  isBaby?: boolean
  babyFreeEntry?: BabyFreeEntryAudit | null
  unlimitedPricing?: UnlimitedVisitPricing | null
  promotionalAdjustment?: PromotionalAdjustmentAudit | null
  notes?: string
  timeExtensions?: VisitTimeExtension[]
  status: 'active'
  createdAt?: Date | null
  updatedAt?: Date | null
  createdBy?: string | null
  createdByName?: string
  updatedBy?: string | null
}

export interface CustomerProfile {
  id: string
  name: string
  phone?: string
  relation?: string
  documentNumber?: string
  documentNumberNormalized?: string
  childrenIds?: string[]
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
  guardianId?: string
  guardianDocumentNumber?: string
  guardianDocumentNumberNormalized?: string
  guardianName?: string
  guardianPhone?: string
  customerId?: string
  customerName?: string
  customerPhone?: string
  notes?: string
  visitCount: number
  eventGuestCount: number
  eventReservationCount?: number
  lastVisitAt?: Date | null
  firstReservationAt?: Date | null
  lastReservationAt?: Date | null
  lastInteractionAt?: Date | null
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
  status?: 'paid' | 'valid' | 'active' | 'void' | 'voided' | 'cancelled' | 'refunded' | string
  source: 'reception_entry' | 'reception_exit' | 'canteen' | 'event_payment' | 'legacy' | string
  concepts?: 'park' | 'canteen' | 'event' | 'both' | string
  description?: string
  accountType?: string
  childName?: string
  customerName?: string
  eventName?: string
  visitId?: string
  visitIds?: string[]
  groupEntryId?: string
  canteenOrderId?: string
  canteenOrderIds?: string[]
  eventId?: string
  parkAmountPaid?: number
  canteenAmountPaid?: number
  eventAmountPaid?: number
  originalParkAmount?: number | null
  promotionalAdjustment?: PromotionalAdjustmentAudit | PromotionalAdjustmentAudit[] | null
  promotionalAdjustments?: PromotionalAdjustmentAudit[]
  createdBy?: string | null
  createdByName?: string
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
  receiptPath?: string
  notes?: string
  status?: 'active' | 'void'
  createdAt?: Date | null
  createdBy?: string | null
  createdByUid?: string | null
  createdByName?: string
  createdByRole?: UserRole | string
  updatedAt?: Date | null
  updatedBy?: string | null
  updatedByUid?: string | null
  updatedByName?: string
}

export interface FinancialClosureRecord {
  id: string
  dateFrom: string
  dateTo: string
  generatedAt?: Date | null
  generatedBy?: string | null
  generatedByName?: string
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
  assignedToUid?: string
  assignedToName?: string
  assignedToEmail?: string
  assignedByUid?: string | null
  assignedByName?: string
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
  completedByUid?: string | null
  completedByName?: string
  updatedAt?: Date | null
  updatedBy?: string | null
}

export interface LuccaEvent {
  id: string
  title: string
  birthdayChildName: string
  childId?: string | null
  childBirthDate?: string | null
  customerName: string
  customerId?: string | null
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
  createdByName?: string
  updatedBy?: string | null
}

export interface CreateEventInput {
  title: string
  birthdayChildName: string
  childBirthDate?: string
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
  categoryNormalized?: string
  price: number
  salePrice?: number
  unitCost?: number | null
  stock: number | null
  minStock: number | null
  imageUrl?: string
  imageFit?: ProductImageFit
  isActive: boolean
  createdAt?: Date | null
  updatedAt?: Date | null
}

export interface CanteenCategoryRecord {
  id: string
  name: string
  normalizedName: string
  isActive: boolean
  sortOrder: number
  productCount?: number
  isLegacy?: boolean
  createdAt?: Date | null
  updatedAt?: Date | null
}

export interface ProductImageFit {
  scale: number
  x: number
  y: number
}

export interface CanteenOrderItem {
  lineItemId?: string
  productId: string
  productName: string
  category: CanteenCategory
  unitPrice: number
  unitCost?: number | null
  quantity: number
  subtotal: number
  costSubtotal?: number
  status?: CanteenLineStatus
  voidedAt?: Date | null
  voidedBy?: string | null
  voidReason?: string
}

export interface CanteenInventoryMovement {
  id: string
  type: string
  productId: string
  productName: string
  quantity: number
  delta: number
  stockBefore: number | null
  stockAfter: number | null
  reason: string
  createdAt?: Date | null
  createdBy?: string
  createdByName?: string
  source?: string
}

export interface CanteenVoidRequest {
  id: string
  accountId: string
  scope: 'line' | 'account'
  lineItemId?: string
  amount: number
  items: CanteenOrderItem[]
  reason: string
  notes?: string
  status: 'pending' | 'approved' | 'rejected'
  requestedByUid: string
  requestedByName: string
  requestedAt?: Date | null
  reviewedByUid?: string
  reviewedByName?: string
  reviewedAt?: Date | null
  reviewNotes?: string
  productsDelivered?: boolean
  deliveredDisposition?: 'courtesy' | 'waste' | 'unpaid_consumption'
}

export interface CanteenOrder {
  id: string
  type: CanteenAccountType
  visitId?: string
  visitIds?: string[]
  groupEntryId?: string
  eventId?: string
  childId?: string
  childIds?: string[]
  childName?: string
  childNames?: string[]
  customerId?: string
  guardianId?: string
  accountName: string
  customerName?: string
  customerPhone?: string
  items: CanteenOrderItem[]
  total: number
  costTotal?: number
  estimatedProfit?: number
  status: CanteenOrderStatus
  paymentStatus: 'pending' | 'paid'
  paidAmount?: number
  lastPartialPaymentAt?: Date | null
  paymentMethod?: PaymentMethod
  cardType?: 'debit' | 'credit' | ''
  notes?: string
  createdAt?: Date | null
  updatedAt?: Date | null
  paidAt?: Date | null
  createdBy?: string | null
  updatedBy?: string | null
  pendingVoidRequestId?: string
  voidRequestStatus?: 'pending' | ''
  closedAt?: Date | null
  closedBy?: string | null
  closedReason?: string
  refundedAt?: Date | null
  refundedBy?: string | null
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
  imageFit?: ProductImageFit
  isActive: boolean
}

export interface CreateCanteenOrderInput {
  type: CanteenAccountType
  visitId?: string
  visitIds?: string[]
  groupEntryId?: string
  eventId?: string
  childId?: string
  childIds?: string[]
  childName?: string
  childNames?: string[]
  customerId?: string
  guardianId?: string
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

export type EventBudgetStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'converted'
export type DecorationMode = 'selected' | 'alternatives'
export type BudgetAddonCalculationType = 'fixed' | 'per_unit'

export interface BudgetGuestPackage {
  id: string
  name: string
  minGuests: number
  maxGuests: number
  basePrice: number
  extraGuestPrice: number
  isActive: boolean
  createdAt?: Date | null
  updatedAt?: Date | null
  createdBy?: string | null
  createdByName?: string
}

export interface BudgetAddon {
  id: string
  name: string
  description?: string
  unitPrice: number
  calculationType: BudgetAddonCalculationType
  isActive: boolean
  createdAt?: Date | null
  updatedAt?: Date | null
  createdBy?: string | null
  createdByName?: string
}

export interface BudgetDecoration {
  id: string
  name: string
  category?: string
  level: number
  description?: string
  includes: string[]
  price: number
  imageUrl?: string
  isActive: boolean
  createdAt?: Date | null
  updatedAt?: Date | null
  createdBy?: string | null
  createdByName?: string
}

export interface BudgetPackageSnapshot {
  id?: string
  name: string
  minGuests: number
  maxGuests: number
  basePrice: number
  extraGuestPrice: number
  appliedManually?: boolean
  manualReason?: string
}

export interface BudgetAddonSnapshot {
  id?: string
  name: string
  description?: string
  unitPrice: number
  calculationType: BudgetAddonCalculationType
  quantity: number
  subtotal: number
}

export interface BudgetDecorationSnapshot {
  id?: string
  name: string
  category?: string
  level: number
  description?: string
  includes: string[]
  price: number
  imageUrl?: string
}

export interface BudgetAlternativeTotal {
  decoration: BudgetDecorationSnapshot
  total: number
}

export interface EventBudget {
  id: string
  childName: string
  responsibleName: string
  responsiblePhone?: string
  tentativeEventDate?: string
  tentativeStartTime?: string
  tentativeEndTime?: string
  notes?: string
  guestCount: number
  packageSnapshot?: BudgetPackageSnapshot | null
  extraGuestsCount: number
  extraGuestUnitPrice: number
  extraGuestsSubtotal: number
  selectedAddons: BudgetAddonSnapshot[]
  decorationMode: DecorationMode
  selectedDecoration?: BudgetDecorationSnapshot | null
  decorationAlternatives: BudgetDecorationSnapshot[]
  baseSubtotal: number
  finalTotal?: number | null
  alternativeTotals: BudgetAlternativeTotal[]
  status: EventBudgetStatus
  createdByUid?: string | null
  createdByName?: string
  createdAt?: Date | null
  updatedAt?: Date | null
  sentAt?: Date | null
  approvedAt?: Date | null
  convertedReservationId?: string
  pdfUrl?: string
  pdfPath?: string
}

export interface UpsertBudgetGuestPackageInput {
  id?: string
  name: string
  minGuests: number
  maxGuests: number
  basePrice: number
  extraGuestPrice: number
  isActive: boolean
}

export interface UpsertBudgetAddonInput {
  id?: string
  name: string
  description?: string
  unitPrice: number
  calculationType: BudgetAddonCalculationType
  isActive: boolean
}

export interface UpsertBudgetDecorationInput {
  id?: string
  name: string
  category?: string
  level: number
  description?: string
  includes: string[]
  price: number
  imageUrl?: string
  isActive: boolean
}

export type UpsertEventBudgetInput = Omit<EventBudget, 'id' | 'createdAt' | 'updatedAt' | 'createdByUid' | 'createdByName'> & {
  id?: string
}
