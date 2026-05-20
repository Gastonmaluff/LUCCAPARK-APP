import { MessageCircle } from 'lucide-react'
import { CalendarPreview } from '../components/CalendarPreview'
import { SectionHeading } from '../components/SectionHeading'
import { StatusPill } from '../components/StatusPill'
import { whatsappLink } from '../config/app'
import { demoTimeSlots } from '../data/demoData'

export function AvailabilityPage() {
  return (
    <main className="section">
      <div className="container">
        <SectionHeading eyebrow="Disponibilidad" title="Calendario de disponibilidad">
          Esta vista publica queda lista para consumir eventos desde Firestore en la siguiente fase.
        </SectionHeading>
        <div className="availability-layout">
          <CalendarPreview />
          <aside className="side-stack">
            <article className="availability-card">
              <p className="eyebrow">Estados</p>
              <StatusPill tone="available">Disponible</StatusPill>
              <StatusPill tone="reserved">Reservado</StatusPill>
              <StatusPill tone="blocked">Evento privado / bloqueado</StatusPill>
              <StatusPill tone="info">Consultar</StatusPill>
            </article>
            <article className="availability-card">
              <p className="eyebrow">Horarios demo</p>
              {demoTimeSlots.map((slot) => (
                <div className="time-row" key={slot.time}>
                  <span>{slot.time}</span>
                  <strong>{slot.status}</strong>
                </div>
              ))}
              <a className="button whatsapp" href={whatsappLink('Hola, quiero consultar disponibilidad.')} target="_blank" rel="noreferrer">
                <MessageCircle size={18} />
                Consultar fecha
              </a>
            </article>
          </aside>
        </div>
      </div>
    </main>
  )
}
