import { CalendarDays, Menu, MessageCircle, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { BrandLogo } from '../components/BrandLogo'
import { whatsappLink } from '../config/app'

const navItems = [
  { label: 'Inicio', to: '/' },
  { label: 'Instalaciones', to: '/#instalaciones' },
  { label: 'Cumpleanos', to: '/#cumpleanos' },
  { label: 'Precios', to: '/precios' },
  { label: 'Contacto', to: '/contacto' },
]

export function PublicLayout() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="page-shell">
      <header className="site-header">
        <div className="container site-header-inner">
          <BrandLogo className="compact" />
          <nav className={`site-nav ${isOpen ? 'open' : ''}`} aria-label="Navegacion principal">
            {navItems.map((item) => (
              <NavLink key={item.label} to={item.to} onClick={() => setIsOpen(false)}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="site-actions">
            <a
              className="button primary desktop-only"
              href={whatsappLink('Hola, quiero reservar un cumpleanos en Lucca Park.')}
              target="_blank"
              rel="noreferrer"
            >
              <CalendarDays size={18} />
              Reservar cumpleanos
            </a>
            <button
              className="menu-button"
              type="button"
              aria-label="Abrir menu"
              onClick={() => setIsOpen((current) => !current)}
            >
              {isOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </header>
      <Outlet />
      <footer className="footer">
        <div className="container footer-inner">
          <div>
            <BrandLogo className="small" />
            <p className="muted">Hacemos sonreir cada dia.</p>
          </div>
          <p className="muted">Contacto, direccion y redes quedan configurables en Fase 2.</p>
        </div>
      </footer>
      <a
        className="whatsapp-float button whatsapp"
        href={whatsappLink('Hola, quiero consultar disponibilidad para un cumple.')}
        target="_blank"
        rel="noreferrer"
      >
        <MessageCircle size={20} />
        Escribinos por WhatsApp
      </a>
    </div>
  )
}
