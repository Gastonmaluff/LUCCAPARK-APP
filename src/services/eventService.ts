import {
  Timestamp,
  doc,
  getDocs,
  increment,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { auth } from '../config/firebase'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { firebaseConfig, storage } from '../config/firebase'
import { getCollectionRef, getDocumentRef } from './firestoreCollections'
import { ensureReceptionSession } from './authSession'
import { getCurrentUserAudit } from './userAudit'
import { parseCurrencyInput } from '../utils/money'
import { formatEventTitle, formatPersonName, lowerSearchKey, normalizeWhitespace, phoneDigits } from '../utils/textFormat'
import type {
  CreateEventGuestInput,
  CreateEventInput,
  EventStatus,
  PaymentMethod,
  UpdateEventTvInput,
} from '../types'

const currentUserId = () => auth.currentUser?.uid ?? null

interface RegisterEventPaymentInput {
  amount: number
  cardType?: 'debit' | 'credit' | ''
  concept: 'deposit' | 'partial' | 'balance' | 'other'
  eventId: string
  notes?: string
  paymentMethod: Exclude<PaymentMethod, ''>
}

const optionalText = (value?: string) => {
  const normalized = normalizeWhitespace(value ?? '')
  return normalized.length > 0 ? normalized : ''
}

const lowerKey = (value: string) => lowerSearchKey(value)

const findCustomerByPhone = async (phone?: string) => {
  const normalizedPhone = optionalText(phone)

  if (!normalizedPhone) {
    return null
  }

  const snapshot = await getDocs(
    query(getCollectionRef('customers'), where('phone', '==', normalizedPhone), limit(1)),
  )

  return snapshot.docs[0] ?? null
}

const findChildByNameAndPhone = async (childName: string, phone?: string) => {
  const normalizedPhone = optionalText(phone)

  if (!normalizedPhone) {
    return null
  }

  const snapshot = await getDocs(
    query(getCollectionRef('children'), where('customerPhone', '==', normalizedPhone), limit(25)),
  )
  const normalizedChildName = lowerKey(childName)

  return snapshot.docs.find((docSnapshot) => {
    const data = docSnapshot.data()
    return lowerKey(String(data.name ?? '')) === normalizedChildName
  }) ?? null
}

export const createEvent = async (input: CreateEventInput) => {
  await ensureReceptionSession()

  const title = formatEventTitle(input.title || `Cumpleanos de ${input.birthdayChildName}`)
  const birthdayChildName = formatPersonName(input.birthdayChildName)
  const customerName = formatPersonName(input.customerName)
  const customerPhone = phoneDigits(input.customerPhone ?? '')
  const eventRef = doc(getCollectionRef('events'))
  const userAudit = await getCurrentUserAudit()
  const userId = userAudit.uid

  await setDoc(eventRef, {
    id: eventRef.id,
    title,
    birthdayChildName,
    customerName,
    customerPhone,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    contractedChildrenCount: input.contractedChildrenCount,
    registeredGuestsCount: 0,
    status: input.status,
    eventType: input.eventType,
    totalAmount:
      input.totalAmount === undefined || input.totalAmount === null ? null : parseCurrencyInput(input.totalAmount),
    depositAmount:
      input.depositAmount === undefined || input.depositAmount === null ? null : parseCurrencyInput(input.depositAmount),
    pendingAmount:
      input.pendingAmount === undefined || input.pendingAmount === null ? null : parseCurrencyInput(input.pendingAmount),
    notes: optionalText(input.notes),
    tvModeEnabled: true,
    tvDisplayEnabled: false,
    tvImageUrl: '',
    tvImageUpdatedAt: null,
    tvTitle: `Bienvenidos al cumpleanos de ${birthdayChildName || title}`,
    tvMessage: 'Que empiece la diversion',
    tvBannerImageUrl: '',
    showGuestCounterOnTv: true,
    showEventNameOnTv: true,
    hideSensitiveInfoOnTv: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: userId,
    createdByName: userAudit.name,
    updatedBy: userId,
  })

  return eventRef.id
}

export const updateEventStatus = async (eventId: string, status: EventStatus) => {
  await ensureReceptionSession()

  if (status === 'active') {
    const activeSnapshot = await getDocs(query(getCollectionRef('events'), where('status', '==', 'active'), limit(5)))
    const anotherActiveEvent = activeSnapshot.docs.find((docSnapshot) => docSnapshot.id !== eventId)

    if (anotherActiveEvent) {
      throw new Error('Ya existe un evento en curso. Finalizalo antes de iniciar otro.')
    }
  }

  await updateDoc(getDocumentRef('events', eventId), {
    status,
    updatedAt: serverTimestamp(),
    updatedBy: currentUserId(),
  })
}

export const registerEventPayment = async ({
  amount,
  cardType = '',
  concept,
  eventId,
  notes,
  paymentMethod,
}: RegisterEventPaymentInput) => {
  await ensureReceptionSession()

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Ingresa un monto valido para registrar el cobro.')
  }

  const eventRef = getDocumentRef('events', eventId)
  const paymentRef = doc(getCollectionRef('payments'))
  const now = new Date()
  const userAudit = await getCurrentUserAudit()
  const userId = userAudit.uid
  const conceptLabel = {
    balance: 'Saldo final',
    deposit: 'Seña',
    other: 'Otro cobro',
    partial: 'Pago parcial',
  }[concept]

  await runTransaction(eventRef.firestore, async (transaction) => {
    const eventSnapshot = await transaction.get(eventRef)
    if (!eventSnapshot.exists()) {
      throw new Error('La reserva seleccionada ya no existe.')
    }

    const eventData = eventSnapshot.data()
    const totalAmount = parseCurrencyInput(eventData.totalAmount ?? 0)
    const previousPaid = parseCurrencyInput(eventData.eventPaidAmount ?? 0)
    const nextPaid = previousPaid + amount
    const nextPending = Math.max(0, totalAmount - nextPaid)
    const financialStatus =
      totalAmount > 0 && nextPending <= 0
        ? 'paid'
        : nextPaid <= 0
          ? 'unpaid'
          : concept === 'deposit'
            ? 'deposit'
            : 'partial'

    transaction.set(paymentRef, {
      id: paymentRef.id,
      eventId,
      eventName: String(eventData.title ?? ''),
      customerName: String(eventData.customerName ?? ''),
      source: 'event_payment',
      concepts: 'event',
      eventAmountPaid: amount,
      totalPaid: amount,
      paymentMethod,
      cardType,
      description: `${conceptLabel} - ${String(eventData.title ?? 'Evento')}`,
      notes: optionalText(notes),
      paidAt: Timestamp.fromDate(now),
      createdAt: serverTimestamp(),
      createdBy: userId,
      createdByName: userAudit.name,
    })

    transaction.update(eventRef, {
      eventPaidAmount: nextPaid,
      financialStatus,
      pendingAmount: totalAmount > 0 ? nextPending : parseCurrencyInput(eventData.pendingAmount ?? 0),
      updatedAt: serverTimestamp(),
      updatedBy: userId,
    })
  })

  return paymentRef.id
}

export const updateEventTvSettings = async (eventId: string, input: UpdateEventTvInput) => {
  await ensureReceptionSession()
  const imageUrl = optionalText(input.tvImageUrl ?? input.tvBannerImageUrl)
  const displayEnabled = input.tvDisplayEnabled ?? input.tvModeEnabled

  await updateDoc(getDocumentRef('events', eventId), {
    tvModeEnabled: displayEnabled,
    tvDisplayEnabled: displayEnabled,
    tvImageUrl: imageUrl,
    tvImageUpdatedAt: imageUrl ? serverTimestamp() : null,
    tvTitle: optionalText(input.tvTitle),
    tvMessage: optionalText(input.tvMessage),
    tvBannerImageUrl: imageUrl,
    showGuestCounterOnTv: input.showGuestCounterOnTv,
    showEventNameOnTv: input.showEventNameOnTv,
    hideSensitiveInfoOnTv: input.hideSensitiveInfoOnTv,
    updatedAt: serverTimestamp(),
    updatedBy: currentUserId(),
  })
}

const maxEventTvImageSize = 5 * 1024 * 1024
const allowedEventTvImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])

export const uploadEventTvImage = async (eventId: string, file: File) => {
  await ensureReceptionSession()

  const user = auth.currentUser
  if (!user) {
    throw new Error('Necesitas iniciar sesion como administrador para subir imagenes.')
  }

  if (!allowedEventTvImageTypes.has(file.type)) {
    throw new Error('Selecciona una imagen PNG, JPG o WEBP.')
  }

  if (file.size > maxEventTvImageSize) {
    throw new Error('La imagen supera el limite de 5 MB.')
  }

  const extension = file.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'image'
  const safeEventId = eventId.replace(/[^a-zA-Z0-9_-]/g, '-')
  const storagePath = `event-tv-images/${safeEventId}/tv-image-${Date.now()}.${extension}`
  const storageRef = ref(storage, storagePath)

  try {
    console.info('[Evento TV Storage] Upload start', {
      bucket: firebaseConfig.storageBucket,
      contentType: file.type,
      path: storagePath,
      size: file.size,
      uid: user.uid,
    })
    await uploadBytes(storageRef, file, { contentType: file.type })
    return await getDownloadURL(storageRef)
  } catch (error) {
    console.error('[Evento TV Storage] upload failed', {
      bucket: firebaseConfig.storageBucket,
      error,
      path: storagePath,
      uid: user.uid,
    })
    const message = error instanceof Error ? error.message : ''
    if (message.includes('storage/unauthorized')) {
      throw new Error('No tenes permiso para subir esta imagen. Verifica las reglas de Firebase Storage.')
    }
    throw error
  }
}

export const createEventGuest = async (input: CreateEventGuestInput) => {
  await ensureReceptionSession()

  const childName = formatPersonName(input.childName)
  const responsibleName = formatPersonName(input.responsibleName)
  const responsiblePhone = phoneDigits(input.responsiblePhone ?? '')
  const existingCustomer = await findCustomerByPhone(responsiblePhone)
  const customerRef = existingCustomer
    ? getDocumentRef('customers', existingCustomer.id)
    : doc(getCollectionRef('customers'))
  const userId = currentUserId()

  await setDoc(
    customerRef,
    {
      name: responsibleName,
      phone: responsiblePhone,
      updatedAt: serverTimestamp(),
      ...(existingCustomer ? {} : { marketingConsent: false, createdAt: serverTimestamp() }),
    },
    { merge: true },
  )

  const existingChild = await findChildByNameAndPhone(childName, responsiblePhone)
  const childRef = existingChild ? getDocumentRef('children', existingChild.id) : doc(getCollectionRef('children'))
  const childBirthDate = optionalText(input.childBirthDate)
  const childAgeRange = optionalText(input.childAgeRange)
  const childGender = optionalText(input.childGender)
  const childNotes = optionalText(input.notes)

  await setDoc(childRef, {
    id: childRef.id,
    name: childName,
    searchName: lowerKey(childName),
    customerId: customerRef.id,
    customerName: responsibleName,
    customerPhone: responsiblePhone,
    mainCustomerId: customerRef.id,
    mainCustomerName: responsibleName,
    mainCustomerPhone: responsiblePhone,
    source: 'event',
    lastSource: 'event',
    eventId: input.event.id,
    eventName: input.event.title,
    eventDate: input.event.date,
    birthdayChildName: input.event.birthdayChildName,
    eventGuestCount: increment(1),
    lastVisitAt: serverTimestamp(),
    ...(childBirthDate ? { birthDate: childBirthDate } : {}),
    ...(input.childExactAge !== undefined && input.childExactAge !== null ? { exactAge: input.childExactAge } : {}),
    ...(input.childAgeCalculated !== undefined && input.childAgeCalculated !== null ? { ageCalculated: input.childAgeCalculated } : {}),
    ...(childAgeRange ? { ageRange: childAgeRange } : {}),
    ...(childGender ? { gender: childGender } : {}),
    ...(childNotes ? { notes: childNotes } : {}),
    ...(existingChild ? {} : { visitCount: 0, marketingConsent: false, createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
  }, { merge: true })

  const eventRef = getDocumentRef('events', input.event.id)
  const guestRef = doc(getCollectionRef('eventGuests'))

  await runTransaction(eventRef.firestore, async (transaction) => {
    const eventSnapshot = await transaction.get(eventRef)

    if (!eventSnapshot.exists()) {
      throw new Error('El evento seleccionado ya no existe.')
    }

    const eventData = eventSnapshot.data()
    const registeredGuestsCount = Number(eventData.registeredGuestsCount ?? 0)
    const contractedChildrenCount = Number(eventData.contractedChildrenCount ?? input.event.contractedChildrenCount)
    const guestNumber = registeredGuestsCount + 1
    const checkedInAt = new Date()

    transaction.set(guestRef, {
      id: guestRef.id,
      eventId: input.event.id,
      childId: childRef.id,
      customerId: customerRef.id,
      childName,
      childBirthDate: optionalText(input.childBirthDate),
      childExactAge: input.childExactAge ?? null,
      childAgeCalculated: input.childAgeCalculated ?? null,
      childAgeRange: optionalText(input.childAgeRange),
      childGender: optionalText(input.childGender),
      responsibleName,
      responsiblePhone,
      notes: optionalText(input.notes),
      checkedInAt: Timestamp.fromDate(checkedInAt),
      guestNumber,
      isExtra: guestNumber > contractedChildrenCount,
      source: 'event',
      eventName: String(eventData.title ?? input.event.title),
      eventDate: String(eventData.date ?? input.event.date),
      birthdayChildName: String(eventData.birthdayChildName ?? input.event.birthdayChildName),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: userId,
    })

    transaction.update(eventRef, {
      registeredGuestsCount: guestNumber,
      updatedAt: serverTimestamp(),
      updatedBy: userId,
    })
  })

  return guestRef.id
}
