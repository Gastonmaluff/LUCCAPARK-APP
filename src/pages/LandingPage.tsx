import { Baby, CalendarCheck, CalendarDays, Gift, MessageCircle, PartyPopper, ShieldCheck, Star } from 'lucide-react'
import { CalendarPreview } from '../components/CalendarPreview'
import { SectionHeading } from '../components/SectionHeading'
import { StatusPill } from '../components/StatusPill'
import { appConfig, whatsappLink } from '../config/app'
import { demoPackages, demoTimeSlots } from '../data/demoData'

const facilities = ['Juegos interactivos', 'Toboganes', 'Salones privados', 'Zona de juegos']

export function LandingPage() {
  return (
    <main>
      <section className="hero" id="inicio">
        <span className="confetti star c1">☆</span>
        <span className="confetti c2">⌁</span>
        <span className="confetti dot c3">✦</span>
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">Parque infantil y eventos</span>
            <h1>
              El lugar donde la <span className="accent-green">diversion</span> cobra vida
            </h1>
            <p>
              Un parque infantil disenado para jugar, celebrar y crear recuerdos inolvidables con una
              experiencia segura, alegre y profesional.
            </p>
            <div className="hero-buttons">
              <a className="button primary" href={whatsappLink('Hola, quiero reservar un cumpleanos en Lucca Park.')} target="_blank" rel="noreferrer">
                <CalendarDays size={19} />
                Reservar cumpleanos
              </a>
              <a className="button secondary" href="#disponibilidad">
                <CalendarCheck size={19} />
                Consultar disponibilidad
              </a>
            </div>
          </div>
          <div className="hero-media">
            <img src={appConfig.heroImageUrl} alt="Ninos jugando en un parque infantil moderno" />
          </div>
        </div>
      </section>

      <section className="section" id="instalaciones">
        <div className="container">
          <SectionHeading eyebrow="Instalaciones" title="Espacios pensados para cada aventura">
            Juegos, salones y zonas preparadas para recibir visitas normales y eventos privados.
          </SectionHeading>
          <div className="grid-4">
            {facilities.map((facility) => (
              <article className="facility-card" key={facility}>
                <div className="facility-art">
                  <span className="play-visual" />
                </div>
                <strong>{facility}</strong>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="cumpleanos">
        <div className="container">
          <SectionHeading eyebrow="Cumpleanos" title="Paquetes listos para celebrar">
            Datos demo configurables. En fases posteriores se conectan a Firestore y presupuestos.
          </SectionHeading>
          <div className="grid-4">
            {demoPackages.map((plan) => (
              <article className="package-card" key={plan.name}>
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
                  <strong>{plan.duration}</strong>
                  <br />
                  <span className="muted">{plan.children}</span>
                </p>
                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <a className="button ghost" href={whatsappLink(`Hola, quiero consultar el paquete ${plan.name}.`)} target="_blank" rel="noreferrer">
                  Consultar
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="disponibilidad">
        <div className="container">
          <SectionHeading eyebrow="Disponibilidad" title="Calendario publico preparado para Firestore">
            Estados visuales para fechas disponibles, reservadas, bloqueadas o a consultar.
          </SectionHeading>
          <div className="availability-layout">
            <CalendarPreview />
            <div className="side-stack">
              <article className="availability-card">
                <p className="eyebrow">Proximo cumpleanos reservado</p>
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
                <a className="button whatsapp" href={whatsappLink('Hola, quiero consultar una fecha para mi cumple.')} target="_blank" rel="noreferrer">
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
            <SectionHeading eyebrow="Contacto" title="Consulta disponibilidad para tu cumple">
              Deja preparada la conversacion por WhatsApp y luego podremos sumar formulario, mapa y redes.
            </SectionHeading>
            <a className="button primary" href={whatsappLink('Hola Lucca Park, quiero consultar disponibilidad para un cumple.')} target="_blank" rel="noreferrer">
              <MessageCircle size={19} />
              Escribir por WhatsApp
            </a>
          </div>
          <article className="contact-card">
            <ShieldCheck color="var(--green)" size={32} />
            <h3>Base profesional desde Fase 1</h3>
            <p className="muted">Landing, admin, recepcion y TV comparten marca, datos demo separados y arquitectura lista para crecer.</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <StatusPill tone="available">Seguro</StatusPill>
              <StatusPill tone="info">Configurable</StatusPill>
              <StatusPill tone="reserved">Eventos</StatusPill>
            </div>
          </article>
        </div>
      </section>

      <section className="section">
        <div className="container grid-4">
          {[
            ['Diversion', Baby],
            ['Cumpleanos', PartyPopper],
            ['Reservas', CalendarCheck],
            ['Experiencia', Star],
          ].map(([label, Icon]) => (
            <article className="package-card" key={String(label)}>
              <span className="package-icon">
                <Icon size={22} />
              </span>
              <h3>{String(label)}</h3>
              <p className="muted">Modulo preparado para contenido real editable.</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
