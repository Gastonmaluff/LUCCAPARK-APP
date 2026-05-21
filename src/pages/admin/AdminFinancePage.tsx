import { useState } from 'react'
import { Banknote, CalendarCheck, Receipt, WalletCards } from 'lucide-react'
import { AdminModuleHeader } from '../../components/AdminModuleHeader'
import { MetricCard } from '../../components/MetricCard'
import { StatusPill } from '../../components/StatusPill'
import { saveDailyClosing } from '../../services/dailyClosingService'
import { useDailyClosingData } from '../../hooks/useDailyClosing'
import { formatGuarani } from '../../utils/money'
import { getLocalDateKey } from '../../utils/date'

const paymentLabel = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  qr: 'QR',
  other: 'Otro',
}

export function AdminFinancePage() {
  const [dateKey, setDateKey] = useState(getLocalDateKey())
  const [notes, setNotes] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const { closing, error, existingClosing, isLoading, openCanteen, paidCanteenToday } = useDailyClosingData(dateKey)
  const primaryPaymentMethod = Object.entries(closing.paymentMethodsSummary).sort((a, b) => b[1] - a[1])[0]

  const handleSaveClosing = async () => {
    if (existingClosing && !window.confirm('Ya existe un cierre para esta fecha. ¿Actualizar/recalcular el cierre?')) {
      return
    }

    setIsSaving(true)
    setMessage(null)
    try {
      await saveDailyClosing({ ...closing, notes })
      setMessage('Cierre diario guardado correctamente.')
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : 'No se pudo guardar el cierre.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <AdminModuleHeader
        eyebrow="Caja"
        title="Finanzas y cierres"
        description="Cierre diario básico con visitas, cantina, pendientes y métodos de pago."
        action={
          <button className="button primary" disabled={isLoading || isSaving} onClick={handleSaveClosing} type="button">
            <CalendarCheck size={18} />
            Hacer cierre diario
          </button>
        }
      />

      <div className="finance-date-row">
        <label className="field">
          <span>Fecha</span>
          <input onChange={(event) => setDateKey(event.target.value)} type="date" value={dateKey} />
        </label>
        {existingClosing ? <StatusPill tone="warning">Ya existe cierre guardado</StatusPill> : <StatusPill tone="info">Sin cierre guardado</StatusPill>}
      </div>

      {error ? <div className="form-alert error">No se pudo calcular el cierre: {error}</div> : null}
      {message ? <div className={message.includes('No se') ? 'form-alert error' : 'form-alert success'}>{message}</div> : null}

      <div className="metric-grid">
        <MetricCard
          color="var(--orange)"
          detail="Visitas + cantina"
          icon={<Banknote />}
          label="Total cobrado hoy"
          value={formatGuarani(closing.totals.totalCollected)}
        />
        <MetricCard
          color="var(--turquoise)"
          detail={`${closing.canteenSummary.paidOrders} ventas cobradas`}
          icon={<Receipt />}
          label="Cantina cobrada"
          value={formatGuarani(closing.totals.canteenCollected)}
        />
        <MetricCard
          color="var(--green)"
          detail={`${closing.visitsSummary.finished} visitas finalizadas`}
          icon={<WalletCards />}
          label="Visitas cobradas"
          value={formatGuarani(closing.totals.visitsCollected)}
        />
        <MetricCard
          color="var(--yellow)"
          detail={`${closing.openAccountsCount} cuentas abiertas`}
          icon={<WalletCards />}
          label="Pendiente de cobro"
          value={formatGuarani(closing.pendingAmount)}
        />
      </div>

      <div className="dashboard-grid">
        <article className="panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <WalletCards color="var(--turquoise)" />
              Métodos de pago
            </h2>
            <StatusPill tone="info">
              Principal: {primaryPaymentMethod ? paymentLabel[primaryPaymentMethod[0] as keyof typeof paymentLabel] : 'Sin datos'}
            </StatusPill>
          </div>
          <div className="module-list">
            {Object.entries(closing.paymentMethodsSummary).map(([method, total]) => (
              <div className="module-row" key={method}>
                <span>{paymentLabel[method as keyof typeof paymentLabel]}</span>
                <strong>{formatGuarani(total)}</strong>
                <StatusPill tone={total > 0 ? 'available' : 'info'}>{total > 0 ? 'Con ventas' : 'Sin ventas'}</StatusPill>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Operación del día</h2>
            <StatusPill tone="available">{dateKey}</StatusPill>
          </div>
          <div className="module-list">
            <div className="module-row">
              <span>Visitas registradas</span>
              <strong>{closing.visitsSummary.registered}</strong>
              <StatusPill tone="info">{closing.visitsSummary.active} activas</StatusPill>
            </div>
            <div className="module-row">
              <span>Invitados de eventos</span>
              <strong>{closing.eventsSummary.guestsRegistered}</strong>
              <StatusPill tone="info">{closing.eventsSummary.activeEvents} eventos activos</StatusPill>
            </div>
            <div className="module-row">
              <span>Ventas de cantina</span>
              <strong>{closing.canteenSummary.paidOrders}</strong>
              <StatusPill tone="warning">{closing.canteenSummary.openOrders} abiertas</StatusPill>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Cuentas abiertas</h2>
            <StatusPill tone="warning">{openCanteen.length} pendientes</StatusPill>
          </div>
          <div className="module-list">
            {openCanteen.length === 0 ? <div className="empty-state">Sin cuentas abiertas.</div> : null}
            {openCanteen.map((order) => (
              <div className="module-row" key={order.id}>
                <span>{order.accountName}</span>
                <strong>{formatGuarani(order.total)}</strong>
                <StatusPill tone="warning">{order.type}</StatusPill>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Guardar cierre</h2>
            <StatusPill tone={existingClosing ? 'warning' : 'info'}>{existingClosing ? 'Guardado' : 'Nuevo'}</StatusPill>
          </div>
          <label className="field">
            <span>Notas del cierre</span>
            <textarea onChange={(event) => setNotes(event.target.value)} rows={4} value={notes} />
          </label>
          <button className="button primary action-button" disabled={isLoading || isSaving} onClick={handleSaveClosing} type="button">
            Guardar cierre
          </button>
          {existingClosing ? (
            <p className="muted">Último cierre guardado para esta fecha: {formatGuarani(existingClosing.totals.totalCollected)}</p>
          ) : null}
          <p className="muted">Ventas pagadas de cantina consideradas: {paidCanteenToday.length}</p>
        </article>
      </div>
    </>
  )
}
