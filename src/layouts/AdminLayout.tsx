import {
  BarChart3,
  CalendarDays,
  CalendarRange,
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
import { BrandLogo } from '../components/BrandLogo'

const adminNavItems = [
  { label: 'Control', to: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Recepcion', to: '/admin/recepcion', icon: ClipboardList },
  { label: 'Cantina', to: '/admin/cantina', icon: ChefHat },
  { label: 'Reservas', to: '/admin/reservas', icon: CalendarDays },
  { label: 'Calendario', to: '/admin/calendario', icon: CalendarRange },
  { label: 'Finanzas', to: '/admin/finanzas', icon: WalletCards },
  { label: 'Reportes', to: '/admin/reportes', icon: BarChart3 },
  { label: 'Clientes', to: '/admin/clientes', icon: UserRound },
  { label: 'Configuracion', to: '/admin/configuracion', icon: Settings },
]

export function AdminLayout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

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
            {adminNavItems.map((item) => (
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
        </header>
        <Outlet />
      </section>
    </main>
  )
}
