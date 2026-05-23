import { AdminModuleHeader } from '../../components/AdminModuleHeader'
import { ReceptionWorkspace } from '../../components/reception/ReceptionWorkspace'
import { useActiveVisits } from '../../hooks/useActiveVisits'
import { useCanteenOrders } from '../../hooks/useCanteen'
import { useCurrentTime } from '../../hooks/useCurrentTime'

export function AdminReceptionPage() {
  const { error, isLoading, storageMode, visits } = useActiveVisits()
  const { orders: canteenOrders } = useCanteenOrders()
  const now = useCurrentTime(1000)

  return (
    <>
      <AdminModuleHeader
        eyebrow="Operacion"
        title="Recepcion administrativa"
        description="Monitoreo de visitas activas, temporizadores y acciones de cobro/finalizacion."
      />

      <ReceptionWorkspace
        canteenOrders={canteenOrders}
        canteenPath="/admin/cantina"
        error={error}
        isLoading={isLoading}
        now={now}
        storageMode={storageMode}
        visits={visits}
      />
    </>
  )
}
