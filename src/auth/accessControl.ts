import type { UserRole } from '../types'

export type AdminModule =
  | 'dashboard'
  | 'reception'
  | 'canteen'
  | 'reservations'
  | 'finance'
  | 'reports'
  | 'clients'
  | 'tasks'
  | 'settings'

export const userRoles: UserRole[] = ['admin', 'socio', 'encargado_eventos', 'recepcion', 'cantina']

export const roleLabels: Record<UserRole, string> = {
  admin: 'Dueño / Administrador',
  socio: 'Socio',
  encargado_eventos: 'Encargado de eventos',
  recepcion: 'Recepción',
  cantina: 'Cantina',
}

const adminModulesByRole: Record<UserRole, AdminModule[]> = {
  admin: ['dashboard', 'reception', 'canteen', 'reservations', 'finance', 'reports', 'clients', 'tasks', 'settings'],
  socio: ['dashboard', 'reception', 'canteen', 'reservations', 'finance', 'reports', 'clients', 'tasks', 'settings'],
  encargado_eventos: ['reception', 'reservations', 'clients', 'tasks'],
  recepcion: ['reception', 'canteen'],
  cantina: ['canteen'],
}

const tvViewerRoles: UserRole[] = ['admin', 'socio', 'recepcion']

const adminPathModules: Array<{ module: AdminModule; prefix: string }> = [
  { module: 'dashboard', prefix: '/admin/dashboard' },
  { module: 'reception', prefix: '/admin/recepcion' },
  { module: 'reservations', prefix: '/admin/reservas' },
  { module: 'reservations', prefix: '/admin/calendario' },
  { module: 'canteen', prefix: '/admin/cantina' },
  { module: 'finance', prefix: '/admin/finanzas' },
  { module: 'reports', prefix: '/admin/reportes' },
  { module: 'clients', prefix: '/admin/clientes' },
  { module: 'tasks', prefix: '/admin/tareas' },
  { module: 'settings', prefix: '/admin/configuracion' },
]

export const isUserRole = (value: unknown): value is UserRole =>
  typeof value === 'string' && userRoles.includes(value as UserRole)

export const canAccessAdminModule = (role: UserRole, module: AdminModule) =>
  adminModulesByRole[role].includes(module)

export const getDefaultRouteForRole = (role: UserRole) => {
  if (role === 'admin' || role === 'socio') return '/admin/dashboard'
  if (role === 'encargado_eventos') return '/admin/reservas'
  if (role === 'recepcion') return '/admin/recepcion'
  return '/admin/cantina'
}

export const canAccessTv = (role: UserRole) => tvViewerRoles.includes(role)

export const canAccessPath = (role: UserRole, pathname: string) => {
  const normalizedPathname = pathname.toLocaleLowerCase('es')
  if (normalizedPathname === '/admin' || normalizedPathname === '/admin/') return true
  if (normalizedPathname === '/admin/tv' || normalizedPathname.startsWith('/admin/tv/')) return canAccessTv(role)
  const adminPath = adminPathModules.find(({ prefix }) => normalizedPathname === prefix || normalizedPathname.startsWith(`${prefix}/`))
  if (adminPath) return canAccessAdminModule(role, adminPath.module)
  if (normalizedPathname === '/recepcion' || normalizedPathname.startsWith('/recepcion/')) {
    return role === 'admin' || role === 'socio' || role === 'recepcion' || role === 'encargado_eventos'
  }
  if (normalizedPathname === '/cantina' || normalizedPathname.startsWith('/cantina/')) {
    return role === 'admin' || role === 'socio' || role === 'recepcion' || role === 'cantina'
  }
  if (normalizedPathname === '/tv' || normalizedPathname.startsWith('/tv/')) return canAccessTv(role)
  if (normalizedPathname === '/appmovil' || normalizedPathname.startsWith('/appmovil/')) return true
  return false
}

export const getRolePermissions = (role: UserRole | null, isActive: boolean) => {
  const hasAccess = Boolean(role && isActive)
  return {
    canViewFinance: hasAccess && (role === 'admin' || role === 'socio'),
    canRegisterExpenses: hasAccess,
    canManageTasks: hasAccess && (role === 'admin' || role === 'socio' || role === 'encargado_eventos'),
    canAssignTasks: hasAccess && (role === 'admin' || role === 'socio' || role === 'encargado_eventos'),
    canManageUsers: hasAccess && role === 'admin',
    // Ajustes operativos (tarifa plan libre, edad gratuita bebe): solo Admin y Socio, nunca Recepcion.
    canManageOperationalSettings: hasAccess && (role === 'admin' || role === 'socio'),
    roleLabel: role ? roleLabels[role] : 'Sin acceso',
  }
}
