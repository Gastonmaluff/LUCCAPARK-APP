import { CalendarDays, Menu, MessageCircle, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { BrandLogo } from '../components/BrandLogo'
import { ScrollToHash } from '../components/ScrollToHash'
import { buildWhatsappLink } from '../config/app'
import { usePublicPageConfig } from '../hooks/usePublicPageConfig'

const navItems = [
  { label: 'Inicio', to: '/' },
  { label: 'Instalaciones', to: '/#instalaciones' },
  { label: 'Cumpleaños', to: '/#cumpleanos' },
  { label: 'Contacto', to: '/contacto' },
]

export function PublicLayout() {
  const [isOpen, setIsOpen] = useState(false)
  const { config } = usePublicPageConfig()
  const whatsappHref = buildWhatsappLink(config.contact.whatsappNumber, config.contact.whatsappMessage)

  return (
    <div className="page-shell">
      <ScrollToHash />
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
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
            >
              <CalendarDays size={18} />
              Reservar cumpleaños
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
        href={whatsappHref}
        target="_blank"
        rel="noreferrer"
      >
        <MessageCircle size={20} />
        Escribinos por WhatsApp
      </a>
    </div>
  )
}
