import type { ActiveVisit, CanteenOrder } from '../types'

export interface ActiveVisitGroup {
  id: string
  groupEntryId?: string
  visits: ActiveVisit[]
  isGrouped: boolean
}

const uniqueById = <T extends { id: string }>(items: T[]) => {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

export const getVisitGroupKey = (visit: ActiveVisit) => (visit.groupEntryId ? `group:${visit.groupEntryId}` : `visit:${visit.id}`)

export const groupActiveVisits = (visits: ActiveVisit[]): ActiveVisitGroup[] => {
  const buckets = new Map<string, ActiveVisit[]>()

  visits.forEach((visit) => {
    const key = getVisitGroupKey(visit)
    buckets.set(key, [...(buckets.get(key) ?? []), visit])
  })

  return Array.from(buckets.entries()).map(([key, groupVisits]) => {
    const sortedVisits = [...groupVisits].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
    const groupEntryId = sortedVisits[0]?.groupEntryId
    const isGrouped = Boolean(groupEntryId && sortedVisits.length > 1)

    return {
      id: isGrouped ? `group:${groupEntryId}` : sortedVisits[0]?.id ?? key,
      groupEntryId: isGrouped ? groupEntryId : undefined,
      visits: sortedVisits,
      isGrouped,
    }
  })
}

export const childNamesForGroup = (visits: ActiveVisit[]) => visits.map((visit) => visit.childName).filter(Boolean)

export const formatGroupChildNames = (visits: ActiveVisit[]) => {
  const names = childNamesForGroup(visits)
  if (names.length <= 2) return names.join(' y ')
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

export const getOrdersForVisit = (orders: CanteenOrder[], visit: ActiveVisit) =>
  uniqueById(
    orders.filter((order) => {
      if (order.status === 'cancelled') return false
      if (order.visitId === visit.id) return true
      if (order.visitIds?.includes(visit.id)) return true
      return Boolean(visit.groupEntryId && order.groupEntryId === visit.groupEntryId)
    }),
  )

export const getOrdersForVisitGroup = (orders: CanteenOrder[], visits: ActiveVisit[]) => {
  const visitIds = new Set(visits.map((visit) => visit.id))
  const groupEntryId = visits.find((visit) => visit.groupEntryId)?.groupEntryId

  return uniqueById(
    orders.filter((order) => {
      if (order.status === 'cancelled') return false
      if (groupEntryId && order.groupEntryId === groupEntryId) return true
      if (order.visitId && visitIds.has(order.visitId)) return true
      return (order.visitIds ?? []).some((visitId) => visitIds.has(visitId))
    }),
  )
}

export const findOpenGroupOrder = (orders: CanteenOrder[], visits: ActiveVisit[]) =>
  getOrdersForVisitGroup(orders, visits).find((order) => order.type === 'visit' && order.status === 'open')
