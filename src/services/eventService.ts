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
import { getCollectionRef, getDocumentRef } from './firestoreCollections'
import { ensureReceptionSession } from './authSession'
import type {
  CreateEventGuestInput,
  CreateEventInput,
  EventStatus,
  UpdateEventTvInput,
} from '../types'

const currentUserId = () => auth.currentUser?.uid ?? null

const normalizeText = (value: string) => value.trim().replace(/\s+/g, ' ')

const optionalText = (value?: string) => {
  const normalized = normalizeText(value ?? '')
  return normalized.length > 0 ? normalized : ''
}

const lowerKey = (value: string) => normalizeText(value).toLocaleLowerCase('es-PY')

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

  const title = normalizeText(input.title || `Cumpleanos de ${input.birthdayChildName}`)
  const birthdayChildName = normalizeText(input.birthdayChildName)
  const customerName = normalizeText(input.customerName)
  const customerPhone = optionalText(input.customerPhone)
  const eventRef = doc(getCollectionRef('events'))
  const userId = currentUserId()

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
    notes: optionalText(input.notes),
    tvModeEnabled: true,
    tvTitle: `Bienvenidos al cumpleanos de ${birthdayChildName || title}`,
    tvMessage: 'Que empiece la diversion',
    tvBannerImageUrl: '',
    showGuestCounterOnTv: true,
    showEventNameOnTv: true,
    hideSensitiveInfoOnTv: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: userId,
    updatedBy: userId,
  })

  return eventRef.id
}

export const updateEventStatus = async (eventId: string, status: EventStatus) => {
  await ensureReceptionSession()

  await updateDoc(getDocumentRef('events', eventId), {
    status,
    updatedAt: serverTimestamp(),
    updatedBy: currentUserId(),
  })
}

export const updateEventTvSettings = async (eventId: string, input: UpdateEventTvInput) => {
  await ensureReceptionSession()

  await updateDoc(getDocumentRef('events', eventId), {
    tvModeEnabled: input.tvModeEnabled,
    tvTitle: optionalText(input.tvTitle),
    tvMessage: optionalText(input.tvMessage),
    tvBannerImageUrl: optionalText(input.tvBannerImageUrl),
    showGuestCounterOnTv: input.showGuestCounterOnTv,
    showEventNameOnTv: input.showEventNameOnTv,
    hideSensitiveInfoOnTv: input.hideSensitiveInfoOnTv,
    updatedAt: serverTimestamp(),
    updatedBy: currentUserId(),
  })
}

export const createEventGuest = async (input: CreateEventGuestInput) => {
  await ensureReceptionSession()

  const childName = normalizeText(input.childName)
  const responsibleName = normalizeText(input.responsibleName)
  const responsiblePhone = optionalText(input.responsiblePhone)
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
