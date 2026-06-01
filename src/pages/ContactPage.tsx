import { MapPin, MessageCircle, Phone } from 'lucide-react'
import { SectionHeading } from '../components/SectionHeading'
import { appConfig, buildWhatsappLink } from '../config/app'
import { usePublicPageConfig } from '../hooks/usePublicPageConfig'

export function ContactPage() {
  const { config } = usePublicPageConfig()

  return (
    <main className="section">
      <div className="container availability-layout">
        <div>
          <SectionHeading eyebrow="Contacto" title={config.contact.title}>
            {config.contact.description}
          </SectionHeading>
          <a className="button whatsapp" href={buildWhatsappLink(config.contact.whatsappNumber, config.contact.whatsappMessage)} target="_blank" rel="noreferrer">
            <MessageCircle size={18} />
            Escribir por WhatsApp
          </a>
        </div>
        <article className="contact-card">
          <Phone color="var(--orange)" />
          <h3>Datos configurables</h3>
          <p className="muted">WhatsApp: {config.contact.whatsappNumber}</p>
          <p className="muted">
            <MapPin size={16} style={{ display: 'inline', verticalAlign: 'middle' }} /> {appConfig.address}
          </p>
        </article>
      </div>
    </main>
  )
}
