import { MapPin, MessageCircle, Phone } from 'lucide-react'
import { SectionHeading } from '../components/SectionHeading'
import { appConfig, whatsappLink } from '../config/app'

export function ContactPage() {
  return (
    <main className="section">
      <div className="container availability-layout">
        <div>
          <SectionHeading eyebrow="Contacto" title="Hablemos de tu proxima celebracion">
            WhatsApp, direccion y redes quedan centralizados en la configuracion del proyecto.
          </SectionHeading>
          <a className="button whatsapp" href={whatsappLink('Hola Lucca Park, quiero hacer una consulta.')} target="_blank" rel="noreferrer">
            <MessageCircle size={18} />
            Escribir por WhatsApp
          </a>
        </div>
        <article className="contact-card">
          <Phone color="var(--orange)" />
          <h3>Datos configurables</h3>
          <p className="muted">WhatsApp: {appConfig.whatsappNumber}</p>
          <p className="muted">
            <MapPin size={16} style={{ display: 'inline', verticalAlign: 'middle' }} /> {appConfig.address}
          </p>
        </article>
      </div>
    </main>
  )
}
