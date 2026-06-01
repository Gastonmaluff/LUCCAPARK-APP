import { Baby, CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, Gift, MapPin, MessageCircle, PartyPopper, ShieldCheck, Star } from 'lucide-react'
import { useRef } from 'react'
import { CalendarPreview } from '../components/CalendarPreview'
import { SectionHeading } from '../components/SectionHeading'
import { StatusPill } from '../components/StatusPill'
import { buildGoogleMapsEmbedUrl, buildWhatsappLink, normalizeExternalUrl } from '../config/app'
import { demoTimeSlots } from '../data/demoData'
import { usePublicPageConfig } from '../hooks/usePublicPageConfig'

export function LandingPage() {
  const { config } = usePublicPageConfig()
  const packageScrollerRef = useRef<HTMLDivElement | null>(null)
  const whatsappHref = (message = config.contact.whatsappMessage) => buildWhatsappLink(config.contact.whatsappNumber, message)
  const googleMapsUrl = normalizeExternalUrl(config.contact.googleMapsUrl)
  const googleMapsEmbedUrl = buildGoogleMapsEmbedUrl(config.contact.googleMapsUrl)
  const activeInstallations = config.installations.items.filter((item) => item.isActive)
  const activePackages = config.birthday.packages.filter((item) => item.isActive)
  const scrollPackages = (direction: -1 | 1) => {
    packageScrollerRef.current?.scrollBy({ behavior: 'smooth', left: direction * 340 })
  }

  return (
    <main>
      <section className="hero" id="inicio">
        <span className="confetti star c1">☆</span>
        <span className="confetti c2">⌁</span>
        <span className="confetti dot c3">✦</span>
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">{config.home.eyebrow}</span>
            <h1>{config.home.title}</h1>
            <p>{config.home.description}</p>
            <div className="hero-buttons">
              <a className="button primary" href={whatsappHref()} target="_blank" rel="noreferrer">
                <CalendarDays size={19} />
                Reservar cumpleaños
              </a>
              <a className="button secondary" href="#disponibilidad">
                <CalendarCheck size={19} />
                Consultar disponibilidad
              </a>
            </div>
          </div>
          <div className="hero-media">
            <img src={config.home.heroImageUrl} alt="Niños jugando en Lucca Park" />
          </div>
        </div>
      </section>

      <section className="section" id="instalaciones">
        <div className="container">
          <SectionHeading eyebrow="Instalaciones" title={config.installations.title}>
            {config.installations.description}
          </SectionHeading>
          <div className="public-installations-marquee">
            <div className="public-installations-track">
              {[...activeInstallations, ...activeInstallations].map((facility, index) => (
                <article className={`facility-card public-facility-card accent-${facility.accent}`} key={`${facility.id}-${index}`}>
                  <div className="facility-art">
                    {facility.imageUrl ? <img src={facility.imageUrl} alt="" /> : <span className="play-visual" />}
                  </div>
                  <strong>{facility.title}</strong>
                </article>
              ))}
              {activeInstallations.length === 0 ? <div className="empty-state">Instalaciones en preparación.</div> : null}
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="cumpleanos">
        <div className="container">
          <SectionHeading eyebrow="Cumpleaños" title={config.birthday.title}>
            {config.birthday.description}
          </SectionHeading>
          <div className="public-packages-wrap">
            {activePackages.length > 4 ? (
              <button className="public-carousel-arrow left" onClick={() => scrollPackages(-1)} type="button" aria-label="Paquetes anteriores">
                <ChevronLeft size={20} />
              </button>
            ) : null}
            <div className={activePackages.length > 4 ? 'public-package-carousel' : 'grid-4'} ref={packageScrollerRef}>
              {activePackages.map((plan) => (
                <article className="package-card public-package-card" key={plan.id}>
                  <header>
                    <span className="package-icon">
                      <Gift size={22} />
                    </span>
                    <div>
                      <h3>{plan.name}</h3>
                      <p className="muted">{plan.summary}</p>
                    </div>
                  </header>
                  <p>
                    <strong>{plan.description}</strong>
                    <br />
                    <span className="muted">{plan.secondaryText}</span>
                  </p>
                  <ul>
                    {plan.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                  <strong className="package-price-text">{plan.priceText}</strong>
                  <a className="button ghost" href={whatsappHref(`Hola, quiero consultar el paquete ${plan.name}.`)} target="_blank" rel="noreferrer">
                    {plan.buttonText || 'Consultar'}
                  </a>
                </article>
              ))}
              {activePackages.length === 0 ? <div className="empty-state">Paquetes en preparación.</div> : null}
            </div>
            {activePackages.length > 4 ? (
              <button className="public-carousel-arrow right" onClick={() => scrollPackages(1)} type="button" aria-label="Siguientes paquetes">
                <ChevronRight size={20} />
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="section" id="disponibilidad">
        <div className="container">
          <SectionHeading eyebrow="Disponibilidad" title="Calendario público preparado para Firestore">
            Estados visuales para fechas disponibles, reservadas, bloqueadas o a consultar.
          </SectionHeading>
          <div className="availability-layout">
            <CalendarPreview />
            <div className="side-stack">
              <article className="availability-card">
                <p className="eyebrow">Próximo cumpleaños reservado</p>
                <h3>Mateo Rios</h3>
                <p className="muted">Domingo 11 de mayo · 15:00 a 18:00 hs</p>
                <StatusPill tone="reserved">Reservado</StatusPill>
              </article>
              <article className="availability-card">
                <p className="eyebrow">Horarios disponibles</p>
                {demoTimeSlots.map((slot) => (
                  <div className="time-row" key={slot.time}>
                    <span>{slot.time}</span>
                    <StatusPill tone={slot.status === 'Reservado' ? 'reserved' : slot.status === 'Consultar' ? 'info' : 'available'}>
                      {slot.status}
                    </StatusPill>
                  </div>
                ))}
                <a className="button whatsapp" href={whatsappHref('Hola, quiero consultar una fecha para mi cumple.')} target="_blank" rel="noreferrer">
                  <MessageCircle size={18} />
                  Consultar por WhatsApp
                </a>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="section contact-band" id="contacto">
        <div className="container availability-layout">
          <div>
            <SectionHeading eyebrow="Contacto" title={config.contact.title}>
              {config.contact.description}
            </SectionHeading>
            <a className="button primary" href={whatsappHref()} target="_blank" rel="noreferrer">
              <MessageCircle size={19} />
              Escribir por WhatsApp
            </a>
          </div>
          <div className="contact-page-cards">
            <article className="contact-card">
              <ShieldCheck color="var(--green)" size={32} />
              <h3>Base profesional desde Fase 1</h3>
              <p className="muted">Landing, admin, recepción y TV comparten marca, datos separados y arquitectura lista para crecer.</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <StatusPill tone="available">Seguro</StatusPill>
                <StatusPill tone="info">Configurable</StatusPill>
                <StatusPill tone="reserved">Eventos</StatusPill>
              </div>
            </article>
            {googleMapsUrl ? (
              <article className="contact-card map-contact-card">
                <div>
                  <MapPin color="var(--green)" />
                  <h3>Ubicación</h3>
                </div>
                {googleMapsEmbedUrl ? (
                  <iframe
                    allowFullScreen
                    className="contact-map-frame"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={googleMapsEmbedUrl}
                    title="Ubicación de Lucca Park"
                  />
                ) : null}
                <a className="button ghost" href={googleMapsUrl} target="_blank" rel="noreferrer">
                  Ver ubicación en Google Maps
                </a>
              </article>
            ) : null}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container grid-4">
          {[
            ['Diversión', Baby],
            ['Cumpleaños', PartyPopper],
            ['Reservas', CalendarCheck],
            ['Experiencia', Star],
          ].map(([label, Icon]) => (
            <article className="package-card" key={String(label)}>
              <span className="package-icon">
                <Icon size={22} />
              </span>
              <h3>{String(label)}</h3>
              <p className="muted">Módulo preparado para contenido real editable.</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
