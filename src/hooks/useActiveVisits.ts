import { Timestamp, onSnapshot, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { getCollectionRef } from '../services/firestoreCollections'
import { subscribeLocalActiveVisits } from '../services/localVisitStore'
import { getVisitStorageMode, type VisitStorageMode } from '../services/visitStorageMode'
import { ensureReceptionSession } from '../services/authSession'
import type { ActiveVisit, UserRole } from '../types'

const dateFromTimestamp = (value: unknown): Date | null => {
  if (value instanceof Timestamp) {
    return value.toDate()
  }

  if (value instanceof Date) {
    return value
  }

  return null
}

const mapTimeExtensions = (value: unknown): ActiveVisit['timeExtensions'] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((item) => {
    const record = item as Record<string, unknown>
    return {
      id: String(record.id ?? ''),
      type: 'time_extension',
      minutes: Number(record.minutes ?? 30) === 60 ? 60 : 30,
      amount: Number(record.amount ?? 0),
      previousEndTime: dateFromTimestamp(record.previousEndTime),
      newEndTime: dateFromTimestamp(record.newEndTime) ?? new Date(),
      createdAt: dateFromTimestamp(record.createdAt),
      createdBy: record.createdBy ? String(record.createdBy) : null,
      createdByName: String(record.createdByName ?? ''),
    }
  })
}

const mapUnlimitedPricing = (value: unknown): ActiveVisit['unlimitedPricing'] => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  return {
    type: record.type === 'unlimited_checkout' ? 'unlimited_checkout' : undefined,
    startedAt: dateFromTimestamp(record.startedAt),
    endedAt: dateFromTimestamp(record.endedAt),
    elapsedMinutes: Number(record.elapsedMinutes ?? 0),
    billableHours: Number(record.billableHours ?? 0),
    hourlyRate: Number(record.hourlyRate ?? 0),
    suggestedAmount: Number(record.suggestedAmount ?? 0),
    finalAmount: Number(record.finalAmount ?? 0),
    difference: Number(record.difference ?? 0),
    reason: String(record.reason ?? ''),
    adjustedBy: record.adjustedBy ? String(record.adjustedBy) : null,
    adjustedByName: String(record.adjustedByName ?? ''),
    adjustedByRole: (record.adjustedByRole as UserRole | '') ?? '',
    adjustedAt: dateFromTimestamp(record.adjustedAt),
    sourceIntegrity: record.sourceIntegrity === 'secure_backend' ? 'secure_backend' : undefined,
  }
}

const mapPromotionalAdjustment = (value: unknown): ActiveVisit['promotionalAdjustment'] => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  return {
    type: record.type === 'percentage' ? 'percentage' : record.type === 'final_amount' ? 'final_amount' : undefined,
    originalAmount: Number(record.originalAmount ?? 0),
    percentage: record.percentage === null || record.percentage === undefined ? null : Number(record.percentage),
    discountAmount: Number(record.discountAmount ?? 0),
    finalAmount: Number(record.finalAmount ?? 0),
    reason: String(record.reason ?? ''),
    adjustedBy: record.adjustedBy ? String(record.adjustedBy) : null,
    adjustedByName: String(record.adjustedByName ?? ''),
    adjustedByRole: (record.adjustedByRole as UserRole | '') ?? '',
    adjustedAt: dateFromTimestamp(record.adjustedAt),
    sourceIntegrity: record.sourceIntegrity === 'secure_backend' ? 'secure_backend' : undefined,
  }
}

const mapBabyFreeEntry = (value: unknown): ActiveVisit['babyFreeEntry'] => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  return {
    applied: record.applied === true,
    mode: record.mode === 'manual' ? 'manual' : 'auto',
    maxAgeMonths: record.maxAgeMonths === null || record.maxAgeMonths === undefined ? null : Number(record.maxAgeMonths),
    ageMonthsAtEntry: record.ageMonthsAtEntry === null || record.ageMonthsAtEntry === undefined ? null : Number(record.ageMonthsAtEntry),
    birthDate: String(record.birthDate ?? ''),
    reason: String(record.reason ?? ''),
    appliedBy: record.appliedBy ? String(record.appliedBy) : null,
    appliedByName: String(record.appliedByName ?? ''),
    appliedByRole: (record.appliedByRole as UserRole | '') ?? '',
    appliedAt: dateFromTimestamp(record.appliedAt),
    sourceIntegrity: record.sourceIntegrity === 'secure_backend' ? 'secure_backend' : undefined,
  }
}

const mapVisit = (id: string, data: Record<string, unknown>): ActiveVisit => ({
  id,
  groupEntryId: data.groupEntryId ? String(data.groupEntryId) : undefined,
  childId: String(data.childId ?? ''),
  childName: String(data.childName ?? ''),
  childBirthDate: String(data.childBirthDate ?? ''),
  childAgeRange: String(data.childAgeRange ?? ''),
  childExactAge: data.childExactAge === null || data.childExactAge === undefined ? null : Number(data.childExactAge),
  childAgeCalculated: data.childAgeCalculated === null || data.childAgeCalculated === undefined ? null : Number(data.childAgeCalculated),
  childGender: String(data.childGender ?? ''),
  customerId: String(data.customerId ?? ''),
  customerName: String(data.customerName ?? ''),
  customerPhone: String(data.customerPhone ?? ''),
  customerRelation: String(data.customerRelation ?? ''),
  customerDocumentNumber: String(data.customerDocumentNumber ?? data.guardianDocumentNumber ?? ''),
  customerDocumentNumberNormalized: String(data.customerDocumentNumberNormalized ?? data.guardianDocumentNumberNormalized ?? ''),
  guardianId: String(data.guardianId ?? data.customerId ?? ''),
  guardianDocumentNumber: String(data.guardianDocumentNumber ?? data.customerDocumentNumber ?? ''),
  guardianDocumentNumberNormalized: String(data.guardianDocumentNumberNormalized ?? data.customerDocumentNumberNormalized ?? ''),
  childrenCount: Number(data.childrenCount ?? 1),
  planId: (data.planId as ActiveVisit['planId']) ?? 'one-hour',
  planName: String(data.planName ?? '1 hora'),
  durationMinutes: data.durationMinutes === null ? null : Number(data.durationMinutes ?? 60),
  isUnlimited: Boolean(data.isUnlimited),
  startedAt: dateFromTimestamp(data.startedAt) ?? new Date(Number.NaN),
  expectedEndAt: dateFromTimestamp(data.expectedEndAt),
  paymentStatus: (data.paymentStatus as ActiveVisit['paymentStatus']) ?? 'pending',
  paymentMethod: (data.paymentMethod as ActiveVisit['paymentMethod']) ?? '',
  cardType: (data.cardType as ActiveVisit['cardType']) ?? '',
  amountCharged: data.amountCharged === null || data.amountCharged === undefined ? null : Number(data.amountCharged),
  parkChargeAmount: data.parkChargeAmount === null || data.parkChargeAmount === undefined ? null : Number(data.parkChargeAmount),
  paidParkAmount: data.paidParkAmount === null || data.paidParkAmount === undefined ? null : Number(data.paidParkAmount),
  extensionChargeAmount: data.extensionChargeAmount === null || data.extensionChargeAmount === undefined ? null : Number(data.extensionChargeAmount),
  parkPaymentStatus: (data.parkPaymentStatus as ActiveVisit['parkPaymentStatus']) ?? (data.paymentStatus === 'paid' ? 'paid' : 'pending'),
  parkPaidAt: dateFromTimestamp(data.parkPaidAt),
  parkPaymentMethod: (data.parkPaymentMethod as ActiveVisit['parkPaymentMethod']) ?? '',
  defaultAmount: data.defaultAmount === null || data.defaultAmount === undefined ? null : Number(data.defaultAmount),
  customAmount: Boolean(data.customAmount),
  isBaby: Boolean(data.isBaby),
  babyFreeEntry: mapBabyFreeEntry(data.babyFreeEntry),
  unlimitedPricing: mapUnlimitedPricing(data.unlimitedPricing),
  promotionalAdjustment: mapPromotionalAdjustment(data.promotionalAdjustment),
  notes: String(data.notes ?? ''),
  timeExtensions: mapTimeExtensions(data.timeExtensions),
  status: 'active',
  createdAt: dateFromTimestamp(data.createdAt),
  updatedAt: dateFromTimestamp(data.updatedAt),
  createdBy: data.createdBy ? String(data.createdBy) : null,
  updatedBy: data.updatedBy ? String(data.updatedBy) : null,
})

export function useActiveVisits() {
  const [visits, setVisits] = useState<ActiveVisit[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [storageMode, setStorageMode] = useState<VisitStorageMode | null>(null)

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let isMounted = true

    getVisitStorageMode().then(async (mode) => {
      if (!isMounted) {
        return
      }

      setStorageMode(mode)

      if (mode === 'local') {
        unsubscribe = subscribeLocalActiveVisits((nextVisits) => {
          setVisits(nextVisits)
          setIsLoading(false)
          setError(null)
        })
        return
      }

      await ensureReceptionSession()

      const activeQuery = query(getCollectionRef('activeVisits'), where('status', '==', 'active'))
      unsubscribe = onSnapshot(
        activeQuery,
        (snapshot) => {
          const nextVisits = snapshot.docs
            .map((docSnapshot) => mapVisit(docSnapshot.id, docSnapshot.data()))
            .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())

          setVisits(nextVisits)
          setIsLoading(false)
          setError(null)
        },
        (snapshotError) => {
          setError(snapshotError.message)
          setIsLoading(false)
        },
      )
    })

    return () => {
      isMounted = false
      unsubscribe?.()
    }
  }, [])

  return { visits, isLoading, error, storageMode }
}
