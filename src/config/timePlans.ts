import type { TimePlan } from '../types'

export const timePlans: TimePlan[] = [
  {
    id: 'one-hour',
    name: '1 hora',
    durationMinutes: 60,
    isUnlimited: false,
    defaultPrice: 60000,
  },
  {
    id: 'two-hours',
    name: '2 horas',
    durationMinutes: 120,
    isUnlimited: false,
    defaultPrice: 100000,
  },
  {
    id: 'unlimited',
    name: 'Libre / sin limite',
    durationMinutes: null,
    isUnlimited: true,
    defaultPrice: null,
  },
]

export const getTimePlanById = (planId: TimePlan['id']) =>
  timePlans.find((plan) => plan.id === planId) ?? timePlans[0]
