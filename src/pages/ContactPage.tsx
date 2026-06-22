import { MapPin, MessageCircle, Phone } from 'lucide-react'
import { SectionHeading } from '../components/SectionHeading'
import { appConfig, buildGoogleMapsEmbedUrl, buildWhatsappLink, normalizeExternalUrl } from '../config/app'
import { usePublicPageConfig } from '../hooks/usePublicPageConfig'

export function ContactPage() {
  const { config } = usePublicPageConfig()
  const googleMapsEmbedUrl = buildGoogleMapsEmbedUrl(config.contact.googleMapsEmbedUrl || config.contact.googleMapsUrl)
  const googleMapsUrl = normalizeExternalUrl(config.contact.googleMapsUrl) || normalizeExternalUrl(config.contact.googleMapsEmbedUrl)

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
        <div className="contact-page-cards">
          <article className="contact-card">
            <Phone color="var(--orange)" />
            <h3>Datos configurables</h3>
            <p className="muted">WhatsApp: {config.contact.whatsappNumber}</p>
            <p className="muted">
              <MapPin size={16} style={{ display: 'inline', verticalAlign: 'middle' }} /> {appConfig.address}
            </p>
          </article>
          {googleMapsUrl || googleMapsEmbedUrl ? (
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
              {googleMapsUrl || googleMapsEmbedUrl ? (
                <a className="button ghost" href={googleMapsUrl || googleMapsEmbedUrl} target="_blank" rel="noreferrer">
                  Ver ubicación en Google Maps
                </a>
              ) : null}
            </article>
          ) : null}
        </div>
      </div>
    </main>
  )
}
