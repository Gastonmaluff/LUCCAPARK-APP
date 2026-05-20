import { Gift } from 'lucide-react'
import { SectionHeading } from '../components/SectionHeading'
import { whatsappLink } from '../config/app'
import { demoPackages } from '../data/demoData'

export function PricesPage() {
  return (
    <main className="section">
      <div className="container">
        <SectionHeading eyebrow="Precios" title="Paquetes de cumpleanos">
          Valores y condiciones quedan como contenido demo hasta cargar la configuracion real.
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
              <a className="button primary" href={whatsappLink(`Hola, quiero consultar precios del paquete ${plan.name}.`)} target="_blank" rel="noreferrer">
                Consultar paquete
              </a>
            </article>
          ))}
        </div>
      </div>
    </main>
  )
}
