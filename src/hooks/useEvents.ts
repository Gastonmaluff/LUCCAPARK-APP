import { Timestamp, onSnapshot } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { getCollectionRef } from '../services/firestoreCollections'
import { ensureReceptionSession } from '../services/authSession'
import { getTodayDateKey, isEventVisibleForReception } from '../utils/eventCapacity'
import type { EventGuest, EventStatus, EventType, LuccaEvent } from '../types'

const dateFromTimestamp = (value: unknown): Date | null => {
  if (value instanceof Timestamp) {
    return value.toDate()
  }

  if (value instanceof Date) {
    return value
  }

  return null
}

const mapEvent = (id: string, data: Record<string, unknown>): LuccaEvent => ({
  id,
  title: String(data.title ?? ''),
  birthdayChildName: String(data.birthdayChildName ?? ''),
  customerName: String(data.customerName ?? ''),
  customerPhone: String(data.customerPhone ?? ''),
  date: String(data.date ?? ''),
  startTime: String(data.startTime ?? ''),
  endTime: String(data.endTime ?? ''),
  contractedChildrenCount: Number(data.contractedChildrenCount ?? 0),
  registeredGuestsCount: Number(data.registeredGuestsCount ?? 0),
  status: (data.status as EventStatus) ?? 'reserved',
  eventType: (data.eventType as EventType) ?? 'birthday',
  notes: String(data.notes ?? ''),
  tvModeEnabled: data.tvModeEnabled !== false,
  tvTitle: String(data.tvTitle ?? ''),
  tvMessage: String(data.tvMessage ?? ''),
  tvBannerImageUrl: String(data.tvBannerImageUrl ?? ''),
  showGuestCounterOnTv: data.showGuestCounterOnTv !== false,
  showEventNameOnTv: data.showEventNameOnTv !== false,
  hideSensitiveInfoOnTv: Boolean(data.hideSensitiveInfoOnTv),
  createdAt: dateFromTimestamp(data.createdAt),
  updatedAt: dateFromTimestamp(data.updatedAt),
  createdBy: data.createdBy ? String(data.createdBy) : null,
  updatedBy: data.updatedBy ? String(data.updatedBy) : null,
})

const mapGuest = (id: string, data: Record<string, unknown>): EventGuest => ({
  id,
  eventId: String(data.eventId ?? ''),
  childId: String(data.childId ?? ''),
  customerId: String(data.customerId ?? ''),
  childName: String(data.childName ?? ''),
  childBirthDate: String(data.childBirthDate ?? ''),
  childAgeRange: String(data.childAgeRange ?? ''),
  childGender: String(data.childGender ?? ''),
  responsibleName: String(data.responsibleName ?? ''),
  responsiblePhone: String(data.responsiblePhone ?? ''),
  notes: String(data.notes ?? ''),
  checkedInAt: dateFromTimestamp(data.checkedInAt) ?? new Date(),
  guestNumber: Number(data.guestNumber ?? 0),
  isExtra: Boolean(data.isExtra),
  source: 'event',
  eventName: String(data.eventName ?? ''),
  eventDate: String(data.eventDate ?? ''),
  birthdayChildName: String(data.birthdayChildName ?? ''),
  createdAt: dateFromTimestamp(data.createdAt),
  updatedAt: dateFromTimestamp(data.updatedAt),
  createdBy: data.createdBy ? String(data.createdBy) : null,
})

export function useEvents() {
  const [events, setEvents] = useState<LuccaEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let isMounted = true

    ensureReceptionSession()
      .then(() => {
        if (!isMounted) {
          return
        }

        unsubscribe = onSnapshot(
          getCollectionRef('events'),
          (snapshot) => {
            const nextEvents = snapshot.docs
              .map((docSnapshot) => mapEvent(docSnapshot.id, docSnapshot.data()))
              .sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`))

            setEvents(nextEvents)
            setIsLoading(false)
            setError(null)
          },
          (snapshotError) => {
            setError(snapshotError.message)
            setIsLoading(false)
          },
        )
      })
      .catch((sessionError) => {
        setError(sessionError instanceof Error ? sessionError.message : 'No se pudo iniciar sesion.')
        setIsLoading(false)
      })

    return () => {
      isMounted = false
      unsubscribe?.()
    }
  }, [])

  return { events, isLoading, error }
}

export function useTodayEvents() {
  const result = useEvents()
  const today = getTodayDateKey()
  const todayEvents = useMemo(
    () => result.events.filter((event) => (event.date === today || event.status === 'active') && isEventVisibleForReception(event)),
    [result.events, today],
  )

  return { ...result, events: todayEvents }
}

export function useActiveEvent() {
  const result = useEvents()
  const activeEvent = useMemo(
    () =>
      result.events
        .filter((event) => event.status === 'active' && event.tvModeEnabled)
        .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`))[0] ?? null,
    [result.events],
  )

  return { ...result, activeEvent }
}

export function useEventGuests(eventId?: string | null) {
  const [guests, setGuests] = useState<EventGuest[]>([])
  const [isLoading, setIsLoading] = useState(Boolean(eventId))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!eventId) {
      return undefined
    }

    let unsubscribe: (() => void) | undefined
    let isMounted = true

    ensureReceptionSession()
      .then(() => {
        if (!isMounted) {
          return
        }

        unsubscribe = onSnapshot(
          getCollectionRef('eventGuests'),
          (snapshot) => {
            const nextGuests = snapshot.docs
              .map((docSnapshot) => mapGuest(docSnapshot.id, docSnapshot.data()))
              .filter((guest) => guest.eventId === eventId)
              .sort((a, b) => a.guestNumber - b.guestNumber)

            setGuests(nextGuests)
            setIsLoading(false)
            setError(null)
          },
          (snapshotError) => {
            setError(snapshotError.message)
            setIsLoading(false)
          },
        )
      })
      .catch((sessionError) => {
        setError(sessionError instanceof Error ? sessionError.message : 'No se pudo iniciar sesion.')
        setIsLoading(false)
      })

    return () => {
      isMounted = false
      unsubscribe?.()
    }
  }, [eventId])

  return { guests: eventId ? guests : [], isLoading: eventId ? isLoading : false, error: eventId ? error : null }
}
