import { Receipt } from 'lucide-react'
import { AdminModuleHeader } from '../../components/AdminModuleHeader'
import { OrderBuilder } from '../../components/canteen/OrderBuilder'
import { OpenOrdersList, PaidOrdersTodayList } from '../../components/canteen/OrderLists'
import { ProductManager } from '../../components/canteen/ProductManager'
import { useActiveVisits } from '../../hooks/useActiveVisits'
import { useCanteenOrders, useCanteenProducts, usePaidCanteenOrdersForDate } from '../../hooks/useCanteen'
import { useEvents } from '../../hooks/useEvents'
import { getLocalDateKey } from '../../utils/date'

export function AdminCanteenPage() {
  const productsResult = useCanteenProducts()
  const ordersResult = useCanteenOrders()
  const paidTodayResult = usePaidCanteenOrdersForDate(getLocalDateKey())
  const { visits } = useActiveVisits()
  const { events } = useEvents()
  const activeEvents = events.filter((event) => event.status === 'active')

  return (
    <>
      <AdminModuleHeader
        eyebrow="Ventas"
        title="Cantina"
        description="Productos reales, cuentas abiertas, ventas cobradas y consumo asociado a visitas o eventos."
        action={
          <a className="button primary" href="#nueva-cuenta">
            <Receipt size={18} />
            Nueva cuenta
          </a>
        }
      />

      <div className="canteen-layout">
        <ProductManager {...productsResult} />
        <div className="side-stack">
          <div id="nueva-cuenta">
            <OrderBuilder
              activeEvents={activeEvents}
              activeVisits={visits}
              canteenOrders={ordersResult.orders}
              products={productsResult.products}
            />
          </div>
          <OpenOrdersList
            error={ordersResult.error}
            isLoading={ordersResult.isLoading}
            orders={ordersResult.orders}
            products={productsResult.products}
          />
          <PaidOrdersTodayList
            error={paidTodayResult.error}
            isLoading={paidTodayResult.isLoading}
            orders={paidTodayResult.orders}
          />
        </div>
      </div>
    </>
  )
}
