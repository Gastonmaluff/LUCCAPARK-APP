import type {
  ActiveVisitDemo,
  CalendarDay,
  CanteenProductDemo,
  EventDemo,
  OpenAccountDemo,
  PackagePlan,
  ReservationDemo,
} from '../types'

export const demoPackages: PackagePlan[] = [
  {
    name: 'Basico',
    summary: 'Diversion asegurada',
    duration: '2 horas de salon privado',
    children: 'Ideal para grupos pequenos',
    tone: 'turquoise',
    features: ['Acceso a juegos', 'Anfitrion de apoyo', 'Configuracion demo editable'],
  },
  {
    name: 'Estandar',
    summary: 'La opcion mas elegida',
    duration: '3 horas de salon privado',
    children: 'Cupo configurable',
    tone: 'green',
    features: ['Acceso a juegos', 'Mesa principal preparada', 'Control de invitados'],
  },
  {
    name: 'Premium',
    summary: 'Experiencia completa',
    duration: '4 horas de salon privado',
    children: 'Pensado para eventos grandes',
    tone: 'orange',
    features: ['Acceso a juegos', 'Banner para TV', 'Senal y saldo preparados'],
  },
  {
    name: 'Super Lucca',
    summary: 'La fiesta de sus suenos',
    duration: '5 horas de salon privado',
    children: 'Condiciones a confirmar',
    tone: 'yellow',
    features: ['Parque completo', 'Configuracion visual especial', 'Soporte de recepcion'],
  },
]

export const demoCalendarDays: CalendarDay[] = [
  { day: 28, faded: true },
  { day: 29, faded: true },
  { day: 30, faded: true },
  { day: 1 },
  { day: 2 },
  { day: 3 },
  { day: 4 },
  { day: 5 },
  { day: 6, status: 'reserved' },
  { day: 7 },
  { day: 8 },
  { day: 9 },
  { day: 10, status: 'available' },
  { day: 11, status: 'blocked' },
  { day: 12, status: 'blocked' },
  { day: 13, status: 'reserved' },
  { day: 14, status: 'blocked' },
  { day: 15 },
  { day: 16, status: 'available' },
  { day: 17, status: 'consult' },
  { day: 18 },
  { day: 19 },
  { day: 20 },
  { day: 21 },
  { day: 22 },
  { day: 23, status: 'blocked' },
  { day: 24 },
  { day: 25 },
  { day: 26 },
  { day: 27 },
  { day: 28 },
  { day: 29 },
  { day: 30 },
  { day: 31, status: 'available' },
  { day: 1, faded: true },
]

export const demoVisits: ActiveVisitDemo[] = [
  {
    childName: 'Mia Farina',
    responsible: 'Carla Farina',
    checkIn: '16:20',
    remaining: '00:34',
    paymentStatus: 'paid',
    tone: 'ok',
  },
  {
    childName: 'Thiago Lopez',
    responsible: 'Laura Lopez',
    checkIn: '16:05',
    remaining: '00:09',
    paymentStatus: 'payAtExit',
    tone: 'warn',
  },
  {
    childName: 'Valentina Gomez',
    responsible: 'Maria Gomez',
    checkIn: '15:40',
    remaining: '00:00',
    paymentStatus: 'pending',
    tone: 'danger',
  },
  {
    childName: 'Mateo Rios',
    responsible: 'Ana Rios',
    checkIn: '16:12',
    remaining: '00:22',
    paymentStatus: 'paid',
    tone: 'ok',
  },
]

export const demoEvents: EventDemo[] = [
  {
    name: 'Cumple de Mateo',
    client: 'Familia Rios',
    date: 'Domingo 11 de mayo',
    time: '15:00 a 18:00',
    capacity: 40,
    checkedIn: 38,
    status: 'confirmed',
  },
  {
    name: 'Cumple de Sofia',
    client: 'Sofia Martinez',
    date: 'Sabado 17 de mayo',
    time: '16:00 a 19:00',
    capacity: 35,
    checkedIn: 35,
    status: 'pending',
  },
]

export const demoReservations: ReservationDemo[] = [
  {
    id: 'RES-001',
    childName: 'Mateo Rios',
    client: 'Ana Rios',
    date: '11 mayo 2025',
    time: '15:00 a 18:00',
    packageName: 'Premium',
    status: 'confirmado',
  },
  {
    id: 'RES-002',
    childName: 'Sofia Martinez',
    client: 'Jorge Martinez',
    date: '17 mayo 2025',
    time: '16:00 a 19:00',
    packageName: 'Estandar',
    status: 'reservado',
  },
  {
    id: 'RES-003',
    childName: 'Thiago Fernandez',
    client: 'Laura Fernandez',
    date: '23 mayo 2025',
    time: '17:30 a 19:30',
    packageName: 'Basico',
    status: 'consulta',
  },
  {
    id: 'RES-004',
    childName: 'Valentina Gomez',
    client: 'Maria Gomez',
    date: '24 mayo 2025',
    time: '15:00 a 17:00',
    packageName: 'Super Lucca',
    status: 'cancelado',
  },
]

export const demoCanteenProducts: CanteenProductDemo[] = [
  { name: 'Agua mineral', category: 'Bebidas', price: 'G 6.000', stock: 42 },
  { name: 'Jugo individual', category: 'Bebidas', price: 'G 8.000', stock: 18 },
  { name: 'Papas snack', category: 'Snacks', price: 'G 7.000', stock: 9, lowStock: true },
  { name: 'Alfajor', category: 'Dulces', price: 'G 5.000', stock: 24 },
]

export const demoOpenAccounts: OpenAccountDemo[] = [
  { name: 'Mesa cumple Mateo', source: 'evento', total: 'G 185.000', items: 12 },
  { name: 'Mia Farina', source: 'visita', total: 'G 24.000', items: 3 },
  { name: 'Cuenta mostrador', source: 'libre', total: 'G 32.000', items: 4 },
]

export const demoFinanceCards = [
  { label: 'Ingresos del dia', value: 'G 12.450.000', detail: 'Caja parcial demo' },
  { label: 'Ingresos del mes', value: 'G 83.200.000', detail: 'Incluye eventos senados' },
  { label: 'Cuentas pendientes', value: 'G 1.240.000', detail: 'Visitas y cantina' },
  { label: 'Cierres realizados', value: '14', detail: 'Mayo 2025' },
]

export const demoReportCards = [
  { label: 'Ocupacion promedio', value: '68%', detail: 'Placeholder estadistico' },
  { label: 'Cumpleanos del mes', value: '21', detail: 'Eventos reservados demo' },
  { label: 'Ticket promedio', value: 'G 86.000', detail: 'Visitas + cantina' },
]

export const demoTimeSlots = [
  { time: '10:00 a 12:00 hs', status: 'Disponible' },
  { time: '12:30 a 14:30 hs', status: 'Disponible' },
  { time: '15:00 a 17:00 hs', status: 'Reservado' },
  { time: '17:30 a 19:30 hs', status: 'Disponible' },
  { time: '20:00 a 22:00 hs', status: 'Consultar' },
]
