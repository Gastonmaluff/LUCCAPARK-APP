import { ExternalLink, ShoppingCart } from 'lucide-react'
import { Link } from 'react-router-dom'
import { StatusPill } from '../StatusPill'
import type { ActiveVisit, CanteenOrder } from '../../types'
import { formatGuarani } from '../../utils/money'
import { getVisitBillingSummary } from '../../utils/visitBilling'

interface VisitConsumptionPanelProps {
  visit: ActiveVisit
  orders: CanteenOrder[]
  canteenPath: string
}

export function VisitConsumptionPanel({ canteenPath, orders, visit }: VisitConsumptionPanelProps) {
  const openOrders = orders.filter((order) => order.status === 'open')
  const paidOrders = orders.filter((order) => order.status === 'paid')
  const pendingTotal = openOrders.reduce((sum, order) => sum + order.total, 0)
  const total = orders.reduce((sum, order) => sum + order.total, 0)
  const items = orders.flatMap((order) => order.items.map((item) => ({ ...item, orderStatus: order.status })))
  const billing = getVisitBillingSummary(visit, orders)

  return (
    <div className="visit-consumption-panel">
      <div className="panel-header">
        <h3 className="panel-title">
          <ShoppingCart color="var(--orange)" />
          Consumo de {visit.childName}
        </h3>
        <StatusPill tone={openOrders.length ? 'warning' : paidOrders.length ? 'available' : 'info'}>
          {openOrders.length ? 'Abierta' : paidOrders.length ? 'Pagada' : 'Sin consumo'}
        </StatusPill>
      </div>

      {orders.length === 0 ? (
        <div className="empty-state">Esta visita todavia no tiene consumos cargados.</div>
      ) : (
        <>
          <div className="consumption-items">
            {items.map((item) => (
              <div className="consumption-row" key={`${item.productId}-${item.orderStatus}`}>
                <span>
                  <strong>{item.productName}</strong>
                  <small>
                    {item.quantity} x {formatGuarani(item.unitPrice)}
                  </small>
                </span>
                <strong>{formatGuarani(item.subtotal)}</strong>
              </div>
            ))}
          </div>
          <div className="consumption-total">
            <span>Total consumido</span>
            <strong>{formatGuarani(total)}</strong>
          </div>
          <div className="consumption-total pending">
            <span>Pendiente</span>
            <strong>{formatGuarani(pendingTotal)}</strong>
          </div>
        </>
      )}

      <div className="consumption-consolidated">
        <div>
          <span>Parque pendiente</span>
          <strong>{formatGuarani(billing.pendingParkAmount)}</strong>
        </div>
        <div>
          <span>Cantina pendiente</span>
          <strong>{formatGuarani(billing.pendingCanteenAmount)}</strong>
        </div>
        <div>
          <span>Total consolidado</span>
          <strong>{formatGuarani(billing.totalPendingAmount)}</strong>
        </div>
      </div>

      <Link className="button primary" to={`${canteenPath}?visitId=${visit.id}`}>
        <ExternalLink size={17} />+ Agregar producto
      </Link>
    </div>
  )
}
