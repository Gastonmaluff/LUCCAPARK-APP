import { useMemo, useState } from 'react'
import { Banknote, CalendarCheck, ChevronDown, ChevronRight, CreditCard, FileText, Plus, Receipt, WalletCards } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AdminModuleHeader } from '../../components/AdminModuleHeader'
import { ExpenseModal } from '../../components/finance/ExpenseModal'
import { MetricCard } from '../../components/MetricCard'
import { paymentLabel } from '../../components/payments/paymentOptions'
import { StatusPill } from '../../components/StatusPill'
import { useFinanceData, type DateRange } from '../../hooks/useFinance'
import { useUserProfile } from '../../hooks/useUserProfile'
import { useUsers } from '../../hooks/useUsers'
import { generateAndSaveFinancialClosure } from '../../services/financialClosureService'
import { getLocalDateKey } from '../../utils/date'
import { getEventPendingAmount } from '../../utils/eventFinance'
import { formatGuarani } from '../../utils/money'
import type { ExpenseCategory, PaymentMethod, PaymentRecord } from '../../types'

type PeriodPreset = 'today' | 'yesterday' | 'week' | 'month' | 'custom'

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}
const rangeForPreset = (preset: PeriodPreset): DateRange => {
  const now = new Date()
  if (preset === 'yesterday') {
    const yesterday = addDays(now, -1)
    return { from: dateKey(yesterday), to: dateKey(yesterday) }
  }
  if (preset === 'week') {
    const start = addDays(now, -((now.getDay() + 6) % 7))
    return { from: dateKey(start), to: dateKey(now) }
  }
  if (preset === 'month') {
    return { from: dateKey(new Date(now.getFullYear(), now.getMonth(), 1)), to: dateKey(now) }
  }
  return { from: getLocalDateKey(), to: getLocalDateKey() }
}

const sourceLabel = (payment: PaymentRecord) => {
  if (payment.source === 'reception_entry') return 'Recepción'
  if (payment.source === 'reception_exit') return 'Parque'
  if (payment.source === 'canteen' || payment.concepts === 'canteen') return 'Cantina'
  if (payment.source === 'event_payment' || payment.concepts === 'event') return 'Evento'
  if (payment.concepts === 'park') return 'Parque'
  return 'Registro anterior'
}

const sourceTone = (payment: PaymentRecord): 'available' | 'info' | 'warning' => {
  if (payment.source === 'canteen' || payment.concepts === 'canteen') return 'info'
  if (payment.source === 'event_payment' || payment.concepts === 'event') return 'warning'
  return 'available'
}

const methodText = (payment: PaymentRecord) => {
  if (payment.paymentMethod === 'card' && payment.cardType === 'debit') return 'Tarjeta débito'
  if (payment.paymentMethod === 'card' && payment.cardType === 'credit') return 'Tarjeta crédito'
  if (payment.paymentMethod) return paymentLabel[payment.paymentMethod as Exclude<PaymentMethod, ''>] ?? payment.paymentMethod
  return 'Sin método registrado'
}

const paymentDetail = (payment: PaymentRecord) => payment.description || (payment.concepts === 'canteen' ? 'Consumo de cantina' : payment.concepts === 'event' ? 'Cobro de evento' : 'Cobro')
const paymentPerson = (payment: PaymentRecord) => payment.childName || payment.eventName || payment.customerName || payment.accountType || 'Cuenta manual'
const categoryLabel: Record<ExpenseCategory, string> = {
  canteen_purchase: 'Cantina / compra de productos',
  cleaning: 'Limpieza',
  decoration: 'Decoración',
  maintenance: 'Mantenimiento',
  operations: 'Compra operativa',
  other: 'Otro',
  services: 'Servicios',
  wages: 'Sueldos / jornales',
}

const expenseTypeLabel = (type: string) => (type === 'event' ? 'Gasto de evento' : 'Operativa general')
const expenseMethodLabel = (method: string, cardType?: string) => {
  if (method === 'card' && cardType === 'debit') return 'Tarjeta débito'
  if (method === 'card' && cardType === 'credit') return 'Tarjeta crédito'
  return paymentLabel[method as Exclude<PaymentMethod, ''>] ?? 'Sin método'
}

export function AdminFinancePage() {
  const [preset, setPreset] = useState<PeriodPreset>('today')
  const [customRange, setCustomRange] = useState<DateRange>(rangeForPreset('today'))
  const [isExpenseOpen, setIsExpenseOpen] = useState(false)
  const [isMethodsOpen, setIsMethodsOpen] = useState(false)
  const [isExpensesOpen, setIsExpensesOpen] = useState(true)
  const [isPaymentsOpen, setIsPaymentsOpen] = useState(true)
  const [isPendingOpen, setIsPendingOpen] = useState(true)
  const [isClosuresOpen, setIsClosuresOpen] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null)
  const [selectedMethodKey, setSelectedMethodKey] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const { permissions, profile } = useUserProfile()
  const usersResult = useUsers(permissions.canViewFinance)
  const range = preset === 'custom' ? customRange : rangeForPreset(preset)
  const finance = useFinanceData(range)

  const periodText = range.from === range.to ? range.from : `${range.from} al ${range.to}`
  const methodRows = [
    ['cash', 'Efectivo', finance.methodTotals.cash],
    ['transfer', 'Transferencia', finance.methodTotals.transfer],
    ['qr', 'QR', finance.methodTotals.qr],
    ['debit', 'Tarjeta de débito', finance.methodTotals.debit],
    ['credit', 'Tarjeta de crédito', finance.methodTotals.credit],
    ['other', 'Otro', finance.methodTotals.other],
    ['missing', 'Sin método registrado', finance.methodTotals.missing],
  ] as const
  const methodTotalCheck = methodRows.reduce((sum, [, , value]) => sum + Number(value), 0)
  const eventOptions = useMemo(() => finance.events.sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`)), [finance.events])
  const userNameByUid = useMemo(() => new Map(usersResult.users.map((user) => [user.uid, user.displayName])), [usersResult.users])
  const displayUserName = (uid?: string | null, storedName?: string) => storedName || (uid ? userNameByUid.get(uid) : '') || 'Usuario no identificado'
  const selectedMethodLabel = methodRows.find(([key]) => key === selectedMethodKey)?.[1] ?? ''
  const selectedMethodPayments = selectedMethodKey
    ? finance.payments.filter((payment) => {
        if (selectedMethodKey === 'debit') return payment.paymentMethod === 'card' && payment.cardType === 'debit'
        if (selectedMethodKey === 'credit') return payment.paymentMethod === 'card' && payment.cardType === 'credit'
        if (selectedMethodKey === 'missing') return !payment.paymentMethod
        return payment.paymentMethod === selectedMethodKey
      })
    : []

  const generateClosure = async () => {
    setIsGeneratingPdf(true)
    setMessage(null)
    try {
      const closure = await generateAndSaveFinancialClosure({
        canteenOrders: finance.canteenOrdersInRange,
        dateFrom: range.from,
        dateTo: range.to,
        events: finance.events,
        expenses: finance.expenses,
        generatedBy: profile?.displayName ?? profile?.email ?? '',
        methodTotals: finance.methodTotals,
        payments: finance.payments,
        pendingAmount: finance.totals.pendingAmount,
        pendingEvents: finance.pendingEventItems,
        pendingOrders: finance.openCanteen,
        pendingVisits: finance.pendingVisits,
        totals: finance.totals,
        visits: finance.visitsInRange,
      })
      setMessage('Cierre PDF generado correctamente.')
      window.open(closure.pdfUrl, '_blank', 'noopener,noreferrer')
    } catch (error) {
      console.error('[Finanzas] No se pudo generar cierre PDF', error)
      setMessage(error instanceof Error ? error.message : 'No se pudo generar el cierre PDF.')
    } finally {
      setIsGeneratingPdf(false)
    }
  }

  if (!permissions.canViewFinance) {
    return (
      <article className="panel">
        <div className="empty-state">Tu usuario no tiene permiso para ver Finanzas y cierres.</div>
      </article>
    )
  }

  return (
    <>
      <AdminModuleHeader
        eyebrow="Caja"
        title="Finanzas y cierres"
        description={`Control financiero del negocio. Período: ${periodText}`}
        action={
          <button className="button primary" disabled={finance.isLoading || isGeneratingPdf} onClick={generateClosure} type="button">
            <FileText size={18} />
            {isGeneratingPdf ? 'Generando...' : 'Generar cierre PDF'}
          </button>
        }
      />

      <div className="finance-period-panel">
        <div className="reservation-filter-row secondary">
          {([
            ['today', 'Hoy'],
            ['yesterday', 'Ayer'],
            ['week', 'Esta semana'],
            ['month', 'Este mes'],
            ['custom', 'Personalizado'],
          ] as Array<[PeriodPreset, string]>).map(([value, label]) => (
            <button className={preset === value ? 'active' : ''} key={value} onClick={() => setPreset(value)} type="button">
              {label}
            </button>
          ))}
        </div>
        {preset === 'custom' ? (
          <div className="finance-date-row">
            <label className="field">
              <span>Desde</span>
              <input onChange={(event) => setCustomRange((current) => ({ ...current, from: event.target.value }))} type="date" value={customRange.from} />
            </label>
            <label className="field">
              <span>Hasta</span>
              <input onChange={(event) => setCustomRange((current) => ({ ...current, to: event.target.value }))} type="date" value={customRange.to} />
            </label>
          </div>
        ) : null}
      </div>

      {finance.error ? <div className="form-alert error">No se pudieron cargar finanzas: {finance.error}</div> : null}
      {message ? <div className={message.includes('No se') ? 'form-alert error' : 'form-alert success'}>{message}</div> : null}

      <div className="metric-grid finance-grid">
        <MetricCard color="var(--orange)" detail={`${finance.payments.length} movimientos`} icon={<Banknote />} label="Total cobrado" value={formatGuarani(finance.totals.totalCollected)} />
        <MetricCard color="var(--green)" detail="Entradas y visitas" icon={<WalletCards />} label="Parque" value={formatGuarani(finance.totals.parkCollected)} />
        <MetricCard color="var(--turquoise)" detail="Cuentas cobradas" icon={<Receipt />} label="Cantina" value={formatGuarani(finance.totals.canteenCollected)} />
        <MetricCard color="var(--yellow)" detail="Señas, saldos y paquetes" icon={<CalendarCheck />} label="Eventos" value={formatGuarani(finance.totals.eventCollected)} />
        <MetricCard color="var(--red)" detail={finance.totals.pendingAmount > 0 ? 'Saldos abiertos vigentes' : 'Sin cuentas pendientes'} icon={<WalletCards />} label="Saldos pendientes actuales" value={formatGuarani(finance.totals.pendingAmount)} />
        <MetricCard color="var(--orange)" detail={`${finance.expenses.length} egresos`} icon={<Receipt />} label="Gastos" value={formatGuarani(finance.totals.totalExpenses)} />
        <MetricCard color="var(--green)" detail="Total cobrado - gastos" icon={<Banknote />} label="Resultado neto" value={formatGuarani(finance.totals.netResult)} />
      </div>

      <div className="finance-section-stack">
        <article className="panel finance-collapsible-panel">
          <button className="finance-collapsible-header" onClick={() => setIsMethodsOpen((current) => !current)} type="button">
            <span className="finance-collapsible-title">
              {isMethodsOpen ? <ChevronDown size={19} /> : <ChevronRight size={19} />}
              <CreditCard color="var(--orange)" size={20} />
              <strong>Cobros por método de pago</strong>
            </span>
            <strong>{formatGuarani(methodTotalCheck)}</strong>
          </button>
          {isMethodsOpen ? (
            <div className="module-list finance-collapsible-body">
              {Math.abs(methodTotalCheck - finance.totals.totalCollected) >= 1 ? (
                <div className="form-alert warning">La suma por métodos no coincide con el total cobrado del período.</div>
              ) : null}
              {methodRows.map(([key, label, total]) => (
                <div className="module-row finance-method-row" key={key}>
                  <span>{label}</span>
                  <strong>{formatGuarani(Number(total))}</strong>
                  <StatusPill tone={Number(total) > 0 ? 'available' : 'info'}>{Number(total) > 0 ? 'Con cobros' : 'Sin cobros'}</StatusPill>
                  {Number(total) > 0 ? (
                    <button className="button ghost" onClick={() => setSelectedMethodKey(key)} type="button">
                      Ver movimientos
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </article>

        <article className="panel finance-collapsible-panel">
          <button className="finance-collapsible-header" onClick={() => setIsExpensesOpen((current) => !current)} type="button">
            <span className="finance-collapsible-title">
              {isExpensesOpen ? <ChevronDown size={19} /> : <ChevronRight size={19} />}
              <Receipt color="var(--red)" size={20} />
              <strong>Gastos registrados</strong>
            </span>
            <strong>{formatGuarani(finance.totals.totalExpenses)}</strong>
          </button>
          {isExpensesOpen ? (
            <div className="module-list finance-collapsible-body">
              <div className="finance-section-action-row">
                <button className="button primary" disabled={!permissions.canRegisterExpenses} onClick={() => setIsExpenseOpen(true)} type="button">
                  <Plus size={17} />
                  Registrar gasto
                </button>
              </div>
              {finance.expenses.length === 0 ? <div className="empty-state">No hay gastos registrados en el período.</div> : null}
              {finance.expenses.map((expense) => (
                <div className="finance-expense-card" key={expense.id}>
                  <div className="finance-expense-main">
                    <div>
                      <strong>{expense.description}</strong>
                      <small>{categoryLabel[expense.category] ?? expense.category} · {expenseTypeLabel(expense.type)}</small>
                      {expense.eventName ? <small>Evento: {expense.eventName}</small> : null}
                      <small>
                        {expenseMethodLabel(expense.paymentMethod, expense.cardType)} · Registrado por {displayUserName(expense.createdBy, expense.createdByName)} ·{' '}
                        {expense.spentAt?.toLocaleString('es-PY') ?? expense.date}
                      </small>
                    </div>
                    <strong>{formatGuarani(expense.amount)}</strong>
                  </div>
                  <div className="finance-expense-actions">
                    {expense.receiptUrl ? (
                      <a className="button ghost small-button" href={expense.receiptUrl} rel="noreferrer" target="_blank">
                        Ver comprobante
                      </a>
                    ) : (
                      <StatusPill tone="info">Sin comprobante</StatusPill>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </article>
      </div>

      <article className="panel finance-collapsible-panel">
        <button className="finance-collapsible-header" onClick={() => setIsPaymentsOpen((current) => !current)} type="button">
          <span className="finance-collapsible-title">
            {isPaymentsOpen ? <ChevronDown size={19} /> : <ChevronRight size={19} />}
            <Banknote color="var(--green)" size={20} />
            <strong>Movimientos cobrados</strong>
          </span>
          <strong>{finance.payments.length} movimientos · {formatGuarani(finance.totals.totalCollected)}</strong>
        </button>
        {isPaymentsOpen ? <div className="module-list finance-collapsible-body">
          {finance.payments.length === 0 ? <div className="empty-state">No hay cobros registrados en el período.</div> : null}
          {finance.payments.map((payment) => (
            <article className={`finance-movement-card origin-${sourceTone(payment)}`} key={payment.id}>
              <div className="finance-movement-top">
                <div className="finance-movement-title">
                  <strong>{paymentDetail(payment)}</strong>
                  <p className="muted">
                    {paymentPerson(payment)}
                    {payment.customerName ? ` · Responsable: ${payment.customerName}` : ''}
                  </p>
                </div>
                <strong className="finance-movement-amount">{formatGuarani(payment.totalPaid)}</strong>
              </div>
              <div className="finance-movement-meta">
                <StatusPill tone={sourceTone(payment)}>{sourceLabel(payment)}</StatusPill>
                <span>{payment.paidAt ? payment.paidAt.toLocaleString('es-PY') : 'Sin fecha'}</span>
                <span>{methodText(payment)}</span>
              </div>
              <div className="finance-movement-actions">
                <button className="button ghost small-button" onClick={() => setSelectedPayment(payment)} type="button">
                  Ver detalle
                </button>
              </div>
            </article>
          ))}
        </div> : null}
      </article>

      <article className="panel finance-collapsible-panel">
        <button className="finance-collapsible-header" onClick={() => setIsPendingOpen((current) => !current)} type="button">
          <span className="finance-collapsible-title">
            {isPendingOpen ? <ChevronDown size={19} /> : <ChevronRight size={19} />}
            <WalletCards color="var(--yellow)" size={20} />
            <strong>Saldos pendientes actuales</strong>
          </span>
          <strong>{formatGuarani(finance.totals.pendingAmount)}</strong>
        </button>
        {isPendingOpen ? <div className="pending-grid finance-collapsible-body">
          {finance.totals.pendingAmount <= 0 ? <div className="empty-state">No existen cuentas pendientes actualmente.</div> : null}
          {finance.pendingVisits.map((visit) => (
            <Link className="pending-card" key={visit.id} to="/admin/recepcion">
              <span>{visit.childName} - Visita activa</span>
              <strong>{formatGuarani(visit.amountCharged ?? visit.defaultAmount ?? 0)}</strong>
              <small>Ir a cobrar</small>
            </Link>
          ))}
          {finance.openCanteen.map((order) => (
            <Link className="pending-card" key={order.id} to="/admin/cantina">
              <span>{order.accountName} - Cantina</span>
              <strong>{formatGuarani(order.total)}</strong>
              <small>Cargar o cobrar</small>
            </Link>
          ))}
          {finance.pendingEventItems.map((event) => (
            <Link className="pending-card" key={event.id} to={`/admin/reservas?eventId=${event.id}`}>
              <span>{event.title} - Evento</span>
              <strong>{formatGuarani(finance.pendingEventAmounts[event.id] ?? getEventPendingAmount(event, finance.payments))}</strong>
              <small>Ver evento</small>
            </Link>
          ))}
        </div> : null}
      </article>

      <article className="panel finance-collapsible-panel">
        <button className="finance-collapsible-header" onClick={() => setIsClosuresOpen((current) => !current)} type="button">
          <span className="finance-collapsible-title">
            {isClosuresOpen ? <ChevronDown size={19} /> : <ChevronRight size={19} />}
            <FileText color="var(--orange)" size={20} />
            <strong>Cierres generados</strong>
          </span>
          <strong>{finance.closures.length} cierres</strong>
        </button>
        {isClosuresOpen ? <div className="module-list finance-collapsible-body">
          {finance.closures.length === 0 ? <div className="empty-state">Todavía no hay cierres generados.</div> : null}
          {finance.closures.map((closure) => (
            <article className="finance-closure-card" key={closure.id}>
              <div className="finance-closure-main">
                <strong>Cierre financiero</strong>
                <p className="muted">
                  Período: {closure.dateFrom} al {closure.dateTo}
                </p>
                <p className="muted">
                  Generado: {closure.generatedAt?.toLocaleString('es-PY') ?? 'Sin fecha'} · Usuario: {displayUserName(closure.generatedBy, closure.generatedByName)}
                </p>
              </div>
              <div className="finance-closure-side">
                <div className="finance-closure-summary">
                  <span>
                    <small>Total cobrado</small>
                    <strong>{formatGuarani(closure.totalCollected)}</strong>
                  </span>
                  <span>
                    <small>Gastos</small>
                    <strong>{formatGuarani(closure.totalExpenses)}</strong>
                  </span>
                  <span>
                    <small>Resultado</small>
                    <strong>{formatGuarani(closure.netResult)}</strong>
                  </span>
                </div>
                <div className="finance-closure-actions">
                  {closure.pdfUrl ? (
                    <a className="button ghost small-button" href={closure.pdfUrl} rel="noreferrer" target="_blank">
                      Descargar PDF
                    </a>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div> : null}
      </article>

      {isExpenseOpen ? <ExpenseModal events={eventOptions} onClose={() => setIsExpenseOpen(false)} /> : null}

      {selectedMethodKey ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card closed-order-detail-modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Movimientos por método</p>
                <h2>Cobros realizados por {selectedMethodLabel}</h2>
              </div>
              <button className="button ghost" onClick={() => setSelectedMethodKey(null)} type="button">Cerrar</button>
            </div>
            <div className="module-list">
              {selectedMethodPayments.map((payment) => (
                <div className="module-row finance-movement-row" key={payment.id}>
                  <span>{payment.paidAt?.toLocaleString('es-PY') ?? 'Sin fecha'}</span>
                  <StatusPill tone={sourceTone(payment)}>{sourceLabel(payment)}</StatusPill>
                  <span>
                    <strong>{paymentDetail(payment)}</strong>
                    <small>{paymentPerson(payment)} · Registrado por {displayUserName(payment.createdBy, payment.createdByName)}</small>
                  </span>
                  <strong>{formatGuarani(payment.totalPaid)}</strong>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {selectedPayment ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card closed-order-detail-modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Movimiento cobrado</p>
                <h2>{paymentDetail(selectedPayment)}</h2>
              </div>
              <button className="button ghost" onClick={() => setSelectedPayment(null)} type="button">Cerrar</button>
            </div>
            <div className="checkout-detail-list">
              <div className="checkout-line"><span>Origen</span><strong>{sourceLabel(selectedPayment)}</strong></div>
              <div className="checkout-line"><span>Cliente / evento</span><strong>{paymentPerson(selectedPayment)}</strong></div>
              <div className="checkout-line"><span>Método</span><strong>{methodText(selectedPayment)}</strong></div>
              <div className="checkout-line"><span>Fecha</span><strong>{selectedPayment.paidAt?.toLocaleString('es-PY') ?? 'Sin fecha'}</strong></div>
              <div className="checkout-line"><span>Usuario</span><strong>{displayUserName(selectedPayment.createdBy, selectedPayment.createdByName)}</strong></div>
            </div>
            <div className="checkout-total-bar">
              <span>Total cobrado</span>
              <strong>{formatGuarani(selectedPayment.totalPaid)}</strong>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
