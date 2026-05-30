import { Timestamp, onSnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { ensureReceptionSession } from '../services/authSession'
import { getCollectionRef } from '../services/firestoreCollections'
import type {
  BudgetAddon,
  BudgetAddonCalculationType,
  BudgetDecoration,
  BudgetGuestPackage,
  DecorationMode,
  EventBudget,
  EventBudgetStatus,
} from '../types'

const dateFromTimestamp = (value: unknown): Date | null => {
  if (value instanceof Timestamp) return value.toDate()
  if (value instanceof Date) return value
  return null
}

const mapPackage = (id: string, data: Record<string, unknown>): BudgetGuestPackage => ({
  id,
  name: String(data.name ?? ''),
  minGuests: Number(data.minGuests ?? 0),
  maxGuests: Number(data.maxGuests ?? 0),
  basePrice: Number(data.basePrice ?? 0),
  extraGuestPrice: Number(data.extraGuestPrice ?? 0),
  isActive: data.isActive !== false,
  createdAt: dateFromTimestamp(data.createdAt),
  updatedAt: dateFromTimestamp(data.updatedAt),
  createdBy: data.createdBy ? String(data.createdBy) : null,
  createdByName: String(data.createdByName ?? ''),
})

const mapAddon = (id: string, data: Record<string, unknown>): BudgetAddon => ({
  id,
  name: String(data.name ?? ''),
  description: String(data.description ?? ''),
  unitPrice: Number(data.unitPrice ?? 0),
  calculationType: (data.calculationType as BudgetAddonCalculationType) ?? 'fixed',
  isActive: data.isActive !== false,
  createdAt: dateFromTimestamp(data.createdAt),
  updatedAt: dateFromTimestamp(data.updatedAt),
  createdBy: data.createdBy ? String(data.createdBy) : null,
  createdByName: String(data.createdByName ?? ''),
})

const mapDecoration = (id: string, data: Record<string, unknown>): BudgetDecoration => ({
  id,
  name: String(data.name ?? ''),
  category: String(data.category ?? ''),
  level: Number(data.level ?? 1),
  description: String(data.description ?? ''),
  includes: Array.isArray(data.includes) ? data.includes.map(String) : [],
  price: Number(data.price ?? 0),
  imageUrl: String(data.imageUrl ?? ''),
  isActive: data.isActive !== false,
  createdAt: dateFromTimestamp(data.createdAt),
  updatedAt: dateFromTimestamp(data.updatedAt),
  createdBy: data.createdBy ? String(data.createdBy) : null,
  createdByName: String(data.createdByName ?? ''),
})

const mapBudget = (id: string, data: Record<string, unknown>): EventBudget => ({
  id,
  childName: String(data.childName ?? ''),
  responsibleName: String(data.responsibleName ?? ''),
  responsiblePhone: String(data.responsiblePhone ?? ''),
  tentativeEventDate: String(data.tentativeEventDate ?? ''),
  tentativeStartTime: String(data.tentativeStartTime ?? ''),
  tentativeEndTime: String(data.tentativeEndTime ?? ''),
  notes: String(data.notes ?? ''),
  guestCount: Number(data.guestCount ?? 0),
  packageSnapshot: data.packageSnapshot ? (data.packageSnapshot as EventBudget['packageSnapshot']) : null,
  extraGuestsCount: Number(data.extraGuestsCount ?? 0),
  extraGuestUnitPrice: Number(data.extraGuestUnitPrice ?? 0),
  extraGuestsSubtotal: Number(data.extraGuestsSubtotal ?? 0),
  selectedAddons: Array.isArray(data.selectedAddons) ? (data.selectedAddons as EventBudget['selectedAddons']) : [],
  decorationMode: (data.decorationMode as DecorationMode) ?? 'selected',
  selectedDecoration: data.selectedDecoration ? (data.selectedDecoration as EventBudget['selectedDecoration']) : null,
  decorationAlternatives: Array.isArray(data.decorationAlternatives) ? (data.decorationAlternatives as EventBudget['decorationAlternatives']) : [],
  baseSubtotal: Number(data.baseSubtotal ?? 0),
  finalTotal: data.finalTotal === null || data.finalTotal === undefined ? null : Number(data.finalTotal),
  alternativeTotals: Array.isArray(data.alternativeTotals) ? (data.alternativeTotals as EventBudget['alternativeTotals']) : [],
  status: (data.status as EventBudgetStatus) ?? 'draft',
  createdByUid: data.createdByUid ? String(data.createdByUid) : null,
  createdByName: String(data.createdByName ?? ''),
  createdAt: dateFromTimestamp(data.createdAt),
  updatedAt: dateFromTimestamp(data.updatedAt),
  sentAt: dateFromTimestamp(data.sentAt),
  approvedAt: dateFromTimestamp(data.approvedAt),
  convertedReservationId: String(data.convertedReservationId ?? ''),
  pdfUrl: String(data.pdfUrl ?? ''),
  pdfPath: String(data.pdfPath ?? ''),
})

export function useEventBudgetData() {
  const [budgets, setBudgets] = useState<EventBudget[]>([])
  const [packages, setPackages] = useState<BudgetGuestPackage[]>([])
  const [addons, setAddons] = useState<BudgetAddon[]>([])
  const [decorations, setDecorations] = useState<BudgetDecoration[]>([])
  const [loadingKeys, setLoadingKeys] = useState(new Set(['budgets', 'packages', 'addons', 'decorations']))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    const unsubscribers: Array<() => void> = []
    const markLoaded = (key: string) => {
      setLoadingKeys((current) => {
        const next = new Set(current)
        next.delete(key)
        return next
      })
    }
    ensureReceptionSession()
      .then(() => {
        if (!isMounted) return
        const handleError = (snapshotError: Error) => {
          setError(snapshotError.message)
          setLoadingKeys(new Set())
        }
        unsubscribers.push(
          onSnapshot(getCollectionRef('eventBudgets'), (snapshot) => {
            setBudgets(snapshot.docs.map((docSnapshot) => mapBudget(docSnapshot.id, docSnapshot.data())).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)))
            markLoaded('budgets')
          }, handleError),
          onSnapshot(getCollectionRef('budgetGuestPackages'), (snapshot) => {
            setPackages(snapshot.docs.map((docSnapshot) => mapPackage(docSnapshot.id, docSnapshot.data())).sort((a, b) => a.minGuests - b.minGuests))
            markLoaded('packages')
          }, handleError),
          onSnapshot(getCollectionRef('budgetAddons'), (snapshot) => {
            setAddons(snapshot.docs.map((docSnapshot) => mapAddon(docSnapshot.id, docSnapshot.data())).sort((a, b) => a.name.localeCompare(b.name)))
            markLoaded('addons')
          }, handleError),
          onSnapshot(getCollectionRef('budgetDecorations'), (snapshot) => {
            setDecorations(snapshot.docs.map((docSnapshot) => mapDecoration(docSnapshot.id, docSnapshot.data())).sort((a, b) => a.level - b.level))
            markLoaded('decorations')
          }, handleError),
        )
      })
      .catch((sessionError) => {
        setError(sessionError instanceof Error ? sessionError.message : 'No se pudo iniciar sesión.')
        setLoadingKeys(new Set())
      })

    return () => {
      isMounted = false
      unsubscribers.forEach((unsubscribe) => unsubscribe())
    }
  }, [])

  return {
    addons,
    budgets,
    decorations,
    error,
    isLoading: loadingKeys.size > 0,
    packages,
  }
}
