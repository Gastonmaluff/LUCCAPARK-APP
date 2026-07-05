import {
  BarChart3,
  CalendarDays,
  ChefHat,
  ClipboardList,
  LayoutDashboard,
  Menu,
  Settings,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { canAccessAdminModule, type AdminModule } from '../auth/accessControl'
import { AdminSessionActions } from '../components/AdminSessionActions'
import { BrandLogo } from '../components/BrandLogo'
import { useUserProfile } from '../hooks/useUserProfile'

const adminNavItems: Array<{ label: string; to: string; icon: typeof LayoutDashboard; module: AdminModule }> = [
  { label: 'Control', to: '/admin/dashboard', icon: LayoutDashboard, module: 'dashboard' },
  { label: 'Recepción', to: '/admin/recepcion', icon: ClipboardList, module: 'reception' },
  { label: 'Cantina', to: '/admin/cantina', icon: ChefHat, module: 'canteen' },
  { label: 'Reservas', to: '/admin/reservas', icon: CalendarDays, module: 'reservations' },
  { label: 'Finanzas', to: '/admin/finanzas', icon: WalletCards, module: 'finance' },
  { label: 'Reportes', to: '/admin/reportes', icon: BarChart3, module: 'reports' },
  { label: 'Clientes', to: '/admin/clientes', icon: UserRound, module: 'clients' },
  { label: 'Tareas', to: '/admin/tareas', icon: ClipboardList, module: 'tasks' },
  { label: 'Configuración', to: '/admin/configuracion', icon: Settings, module: 'settings' },
]

export function AdminLayout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const { profile, profileStatus, user } = useUserProfile()
  const visibleNavItems = profile ? adminNavItems.filter((item) => canAccessAdminModule(profile.role, item.module)) : []

  return (
    <main className="internal-page">
      <section className="internal-shell">
        <header className="admin-topbar">
          <BrandLogo className="compact" />
          <button
            className="menu-button admin-menu-button"
            type="button"
            aria-label="Abrir menu admin"
            onClick={() => setIsMenuOpen((current) => !current)}
          >
            {isMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <nav className={`internal-nav ${isMenuOpen ? 'open' : ''}`} aria-label="Admin">
            {visibleNavItems.map((item) => (
              <NavLink
                className={({ isActive }) => `nav-chip ${isActive ? 'active' : ''}`}
                key={item.label}
                onClick={() => setIsMenuOpen(false)}
                to={item.to}
              >
                <item.icon size={17} />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <AdminSessionActions profile={profile} profileStatus={profileStatus} user={user} />
        </header>
        <Outlet />
      </section>
    </main>
  )
}
