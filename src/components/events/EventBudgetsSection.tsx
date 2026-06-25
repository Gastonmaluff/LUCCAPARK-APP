import {
  BookImage,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Edit3,
  FileText,
  PackagePlus,
  Plus,
  Send,
  Settings2,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { StatusPill } from '../StatusPill'
import { useEventBudgetData } from '../../hooks/useEventBudgets'
import { useUserProfile } from '../../hooks/useUserProfile'
import {
  addonSnapshotFromConfig,
  convertBudgetToReservation,
  deleteBudgetDecoration,
  decorationSnapshotFromConfig,
  downloadDecorationCatalogPdf,
  downloadEventBudgetPdf,
  packageSnapshotFromConfig,
  saveEventBudget,
  updateEventBudgetStatus,
  uploadDecorationImage,
  upsertBudgetAddon,
  upsertBudgetDecoration,
  upsertBudgetGuestPackage,
} from '../../services/eventBudgetService'
import { formatGuarani, parseCurrencyInput } from '../../utils/money'
import { formatParaguayanPhone } from '../../utils/textFormat'
import type {
  BudgetAddon,
  BudgetAddonCalculationType,
  BudgetAddonSnapshot,
  BudgetDecoration,
  BudgetDecorationSnapshot,
  BudgetGuestPackage,
  DecorationMode,
  EventBudget,
  EventBudgetStatus,
  UpsertEventBudgetInput,
} from '../../types'

type BudgetFilter = 'all' | EventBudgetStatus

const statusLabels: Record<EventBudgetStatus, string> = {
  approved: 'Aprobado',
  converted: 'Convertido en reserva',
  draft: 'Borrador',
  rejected: 'Rechazado',
  sent: 'Enviado',
}

const statusTone: Record<EventBudgetStatus, 'available' | 'blocked' | 'info' | 'warning'> = {
  approved: 'available',
  converted: 'available',
  draft: 'warning',
  rejected: 'blocked',
  sent: 'info',
}

const formatDate = (value?: Date | string | null) => {
  if (!value) return 'Sin fecha'
  const date = typeof value === 'string' ? new Date(`${value}T12:00:00`) : value
  return new Intl.DateTimeFormat('es-PY', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

const newBudgetForm = (): UpsertEventBudgetInput => ({
  alternativeTotals: [],
  baseSubtotal: 0,
  childName: '',
  decorationAlternatives: [],
  decorationMode: 'selected',
  extraGuestUnitPrice: 0,
  extraGuestsCount: 0,
  extraGuestsSubtotal: 0,
  finalTotal: null,
  guestCount: 0,
  notes: '',
  packageSnapshot: null,
  responsibleName: '',
  responsiblePhone: '',
  selectedAddons: [],
  selectedDecoration: null,
  status: 'draft',
  tentativeEndTime: '',
  tentativeEventDate: '',
  tentativeStartTime: '',
})

const newDecorationForm = () => ({ category: 'Unisex', description: '', id: '', imageUrl: '', includes: '', isActive: true, level: '1', name: '', price: '' })

const snapshotTotal = (addons: BudgetAddonSnapshot[]) => addons.reduce((sum, addon) => sum + addon.subtotal, 0)

const buildBudgetPayload = (
  form: UpsertEventBudgetInput,
  packages: BudgetGuestPackage[],
  addons: BudgetAddonSnapshot[],
  decorationMode: DecorationMode,
  selectedDecoration: BudgetDecorationSnapshot | null,
  alternatives: BudgetDecorationSnapshot[],
): UpsertEventBudgetInput => {
  const guestCount = Number(form.guestCount) || 0
  const selectedPackage =
    form.packageSnapshot ??
    packages.find((item) => item.isActive && guestCount >= item.minGuests && guestCount <= item.maxGuests) ??
    packages.filter((item) => item.isActive).sort((a, b) => b.maxGuests - a.maxGuests)[0]
  const packageSnapshot = selectedPackage && 'basePrice' in selectedPackage ? selectedPackage : selectedPackage ? packageSnapshotFromConfig(selectedPackage) : null
  const extraGuestsCount = packageSnapshot ? Math.max(0, guestCount - packageSnapshot.maxGuests) : 0
  const extraGuestUnitPrice = packageSnapshot?.extraGuestPrice ?? 0
  const extraGuestsSubtotal = extraGuestsCount * extraGuestUnitPrice
  const baseSubtotal = (packageSnapshot?.basePrice ?? 0) + extraGuestsSubtotal + snapshotTotal(addons)
  const finalTotal = decorationMode === 'selected' ? baseSubtotal + (selectedDecoration?.price ?? 0) : null
  const alternativeTotals = decorationMode === 'alternatives'
    ? alternatives.map((decoration) => ({ decoration, total: baseSubtotal + decoration.price }))
    : []

  return {
    ...form,
    baseSubtotal,
    decorationAlternatives: alternatives,
    decorationMode,
    extraGuestUnitPrice,
    extraGuestsCount,
    extraGuestsSubtotal,
    finalTotal,
    alternativeTotals,
    guestCount,
    packageSnapshot,
    selectedAddons: addons,
    selectedDecoration: decorationMode === 'selected' ? selectedDecoration : null,
    status: form.status ?? 'draft',
  }
}

function BudgetStatusPill({ status }: { status: EventBudgetStatus }) {
  return <StatusPill tone={statusTone[status]}>{statusLabels[status]}</StatusPill>
}

function BudgetConfigPanel({ onClose }: { onClose: () => void }) {
  const { addons, decorations, packages } = useEventBudgetData()
  const [packageForm, setPackageForm] = useState({ basePrice: '', extraGuestPrice: '', id: '', isActive: true, maxGuests: '', minGuests: '', name: '' })
  const [addonForm, setAddonForm] = useState<{ calculationType: BudgetAddonCalculationType; description: string; id: string; isActive: boolean; name: string; unitPrice: string }>({ calculationType: 'fixed', description: '', id: '', isActive: true, name: '', unitPrice: '' })
  const [decorationForm, setDecorationForm] = useState(newDecorationForm)
  const [decorationImageFile, setDecorationImageFile] = useState<File | null>(null)
  const decorationImageInputRef = useRef<HTMLInputElement | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const resetDecorationForm = () => {
    setDecorationForm(newDecorationForm())
    setDecorationImageFile(null)
    if (decorationImageInputRef.current) decorationImageInputRef.current.value = ''
  }

  const savePackage = async () => {
    setSaving(true)
    await upsertBudgetGuestPackage({
      basePrice: parseCurrencyInput(packageForm.basePrice),
      extraGuestPrice: parseCurrencyInput(packageForm.extraGuestPrice),
      id: packageForm.id || undefined,
      isActive: packageForm.isActive,
      maxGuests: Number(packageForm.maxGuests),
      minGuests: Number(packageForm.minGuests),
      name: packageForm.name,
    })
    setPackageForm({ basePrice: '', extraGuestPrice: '', id: '', isActive: true, maxGuests: '', minGuests: '', name: '' })
    setMessage('Paquete guardado.')
    setSaving(false)
  }

  const saveAddon = async () => {
    setSaving(true)
    await upsertBudgetAddon({
      calculationType: addonForm.calculationType,
      description: addonForm.description,
      id: addonForm.id || undefined,
      isActive: addonForm.isActive,
      name: addonForm.name,
      unitPrice: parseCurrencyInput(addonForm.unitPrice),
    })
    setAddonForm({ calculationType: 'fixed', description: '', id: '', isActive: true, name: '', unitPrice: '' })
    setMessage('Adicional guardado.')
    setSaving(false)
  }

  const saveDecoration = async () => {
    setSaving(true)
    setMessage('')
    try {
      const decorationId = await upsertBudgetDecoration({
        category: decorationForm.category,
        description: decorationForm.description,
        id: decorationForm.id || undefined,
        imageUrl: decorationForm.imageUrl,
        includes: decorationForm.includes.split('\n'),
        isActive: decorationForm.isActive,
        level: Number(decorationForm.level),
        name: decorationForm.name,
        price: parseCurrencyInput(decorationForm.price),
      })
      if (decorationImageFile) {
        const imageUrl = await uploadDecorationImage(decorationImageFile, decorationId)
        await upsertBudgetDecoration({
          category: decorationForm.category,
          description: decorationForm.description,
          id: decorationId,
          imageUrl,
          includes: decorationForm.includes.split('\n'),
          isActive: decorationForm.isActive,
          level: Number(decorationForm.level),
          name: decorationForm.name,
          price: parseCurrencyInput(decorationForm.price),
        })
      }
      resetDecorationForm()
      setMessage('Decoración guardada correctamente.')
    } catch (err) {
      setMessage(`Error al guardar: ${err instanceof Error ? err.message : 'Intentá de nuevo.'}`)
    } finally {
      setSaving(false)
    }
  }

  const removeDecoration = async (decoration: BudgetDecoration) => {
    const confirmed = window.confirm(`¿Eliminar la decoración "${decoration.name}"?`)
    if (!confirmed) return
    setSaving(true)
    setMessage('')
    try {
      const result = await deleteBudgetDecoration(decoration)
      if (decorationForm.id === decoration.id) resetDecorationForm()
      setMessage(result.imageDeleteFailed ? 'Decoración eliminada. No se pudo borrar la imagen de Storage.' : 'Decoración eliminada.')
    } catch (error) {
      setMessage(`Error al eliminar: ${error instanceof Error ? error.message : 'Intentá de nuevo.'}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card budget-config-modal" role="dialog" aria-modal="true">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Presupuestos</p>
            <h2>Configurar precios y servicios</h2>
          </div>
          <button className="button ghost" onClick={onClose} type="button"><X size={18} /> Cerrar</button>
        </div>
        {message ? <div className={`form-alert ${message.startsWith('Error') ? 'error' : 'success'}`}>{message}</div> : null}
        <div className="budget-config-grid">
          <article className="budget-config-card">
            <h3>Paquetes por cantidad de invitados</h3>
            <div className="compact-form">
              <label className="field"><span>Nombre</span><input value={packageForm.name} onChange={(event) => setPackageForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label className="field"><span>Mínimo</span><input type="number" value={packageForm.minGuests} onChange={(event) => setPackageForm((current) => ({ ...current, minGuests: event.target.value }))} /></label>
              <label className="field"><span>Máximo</span><input type="number" value={packageForm.maxGuests} onChange={(event) => setPackageForm((current) => ({ ...current, maxGuests: event.target.value }))} /></label>
              <label className="field"><span>Precio base</span><input value={packageForm.basePrice} onChange={(event) => setPackageForm((current) => ({ ...current, basePrice: event.target.value }))} /></label>
              <label className="field"><span>Invitado adicional</span><input value={packageForm.extraGuestPrice} onChange={(event) => setPackageForm((current) => ({ ...current, extraGuestPrice: event.target.value }))} /></label>
              <label className="settings-toggle"><input type="checkbox" checked={packageForm.isActive} onChange={(event) => setPackageForm((current) => ({ ...current, isActive: event.target.checked }))} /> Activo</label>
            </div>
            <button className="button primary" disabled={saving || !packageForm.name} onClick={savePackage} type="button">Guardar paquete</button>
            <div className="budget-config-list">
              {packages.map((item) => (
                <button className="user-row-button" key={item.id} onClick={() => setPackageForm({ basePrice: String(item.basePrice), extraGuestPrice: String(item.extraGuestPrice), id: item.id, isActive: item.isActive, maxGuests: String(item.maxGuests), minGuests: String(item.minGuests), name: item.name })} type="button">
                  <strong>{item.name}</strong><small>{item.minGuests}-{item.maxGuests} invitados · {formatGuarani(item.basePrice)} · extra {formatGuarani(item.extraGuestPrice)}</small>
                </button>
              ))}
            </div>
          </article>

          <article className="budget-config-card">
            <h3>Adicionales del evento</h3>
            <div className="compact-form">
              <label className="field"><span>Nombre</span><input value={addonForm.name} onChange={(event) => setAddonForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label className="field"><span>Descripción</span><input value={addonForm.description} onChange={(event) => setAddonForm((current) => ({ ...current, description: event.target.value }))} /></label>
              <label className="field"><span>Precio unitario</span><input value={addonForm.unitPrice} onChange={(event) => setAddonForm((current) => ({ ...current, unitPrice: event.target.value }))} /></label>
              <label className="field"><span>Tipo de cálculo</span><select value={addonForm.calculationType} onChange={(event) => setAddonForm((current) => ({ ...current, calculationType: event.target.value as BudgetAddonCalculationType }))}><option value="fixed">Precio fijo</option><option value="per_unit">Precio por unidad</option></select></label>
              <label className="settings-toggle"><input type="checkbox" checked={addonForm.isActive} onChange={(event) => setAddonForm((current) => ({ ...current, isActive: event.target.checked }))} /> Activo</label>
            </div>
            <button className="button primary" disabled={saving || !addonForm.name} onClick={saveAddon} type="button">Guardar adicional</button>
            <div className="budget-config-list">
              {addons.map((item) => (
                <button className="user-row-button" key={item.id} onClick={() => setAddonForm({ calculationType: item.calculationType, description: item.description ?? '', id: item.id, isActive: item.isActive, name: item.name, unitPrice: String(item.unitPrice) })} type="button">
                  <strong>{item.name}</strong><small>{formatGuarani(item.unitPrice)} · {item.isActive ? 'Activo' : 'Inactivo'}</small>
                </button>
              ))}
            </div>
          </article>

          <article className="budget-config-card">
            <h3>Opciones de decoración</h3>
            <div className="compact-form">
              <label className="field"><span>Título visible</span><input value={decorationForm.name} onChange={(event) => setDecorationForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label className="field">
                <span>Categoría</span>
                <select value={decorationForm.category} onChange={(event) => setDecorationForm((current) => ({ ...current, category: event.target.value }))}>
                  <option value="Masculino">Masculino</option>
                  <option value="Femenino">Femenino</option>
                  <option value="Unisex">Unisex</option>
                </select>
              </label>
              <label className="field">
                <span>Nivel</span>
                <select value={decorationForm.level} onChange={(event) => setDecorationForm((current) => ({ ...current, level: event.target.value }))}>
                  <option value="1">Nivel 1</option>
                  <option value="2">Nivel 2</option>
                  <option value="3">Nivel 3</option>
                </select>
              </label>
              <label className="field"><span>Descripción corta</span><input value={decorationForm.description} onChange={(event) => setDecorationForm((current) => ({ ...current, description: event.target.value }))} /></label>
              <label className="field"><span>Incluye (una línea por ítem)</span><textarea rows={4} value={decorationForm.includes} onChange={(event) => setDecorationForm((current) => ({ ...current, includes: event.target.value }))} /></label>
              <label className="field"><span>Precio</span><input value={decorationForm.price} onChange={(event) => setDecorationForm((current) => ({ ...current, price: event.target.value }))} /></label>
              <label className="field">
                <span>Imagen principal</span>
                {decorationForm.imageUrl ? <img src={decorationForm.imageUrl} alt="Imagen actual" style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 4, marginBottom: 4, display: 'block' }} /> : null}
                <input ref={decorationImageInputRef} type="file" accept="image/*" onChange={(event) => setDecorationImageFile(event.target.files?.[0] ?? null)} />
                {decorationImageFile ? <small style={{ color: 'var(--green)' }}>📎 {decorationImageFile.name}</small> : null}
              </label>
              <label className="settings-toggle"><input type="checkbox" checked={decorationForm.isActive} onChange={(event) => setDecorationForm((current) => ({ ...current, isActive: event.target.checked }))} /> Activo</label>
            </div>
            <button className="button primary" disabled={saving || !decorationForm.name} onClick={saveDecoration} type="button">Guardar decoración</button>
            <div className="budget-config-list">
              {decorations.map((item) => (
                <div className="user-row-button" key={item.id} style={{ alignItems: 'center', gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
                  <button
                  onClick={() => {
                    setDecorationForm({ category: item.category ?? 'Unisex', description: item.description ?? '', id: item.id, imageUrl: item.imageUrl ?? '', includes: item.includes.join('\n'), isActive: item.isActive, level: String(item.level), name: item.name, price: String(item.price) })
                    setDecorationImageFile(null)
                    if (decorationImageInputRef.current) decorationImageInputRef.current.value = ''
                  }}
                  style={{ background: 'transparent', border: 0, color: 'inherit', padding: 0, textAlign: 'left', width: '100%' }}
                  type="button"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0' }}>
                    {item.imageUrl
                      ? <img src={item.imageUrl} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                      : <div style={{ width: 64, height: 64, background: 'var(--bg-muted, #f0f0f0)', borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#bbb' }}>Sin imagen</div>}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                      <strong style={{ fontSize: 14 }}>{item.name}</strong>
                      <small style={{ color: 'var(--text-muted, #888)' }}>{[item.category, `Nivel ${item.level}`].filter(Boolean).join(' · ')}</small>
                      <span style={{ fontWeight: 600, color: 'var(--orange)', fontSize: 13 }}>{formatGuarani(item.price)}</span>
                    </div>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: item.isActive ? 'var(--green-light, #e6f9f0)' : '#f5f5f5', color: item.isActive ? 'var(--green, #1a9e6a)' : '#aaa', flexShrink: 0 }}>
                      {item.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  </button>
                  <button className="button ghost small-button" disabled={saving} onClick={() => removeDecoration(item)} type="button"><Trash2 size={15} /> Eliminar</button>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>
    </div>
  )
}

function BudgetFormModal({ budget, onClose }: { budget?: EventBudget | null; onClose: () => void }) {
  const { addons, decorations, packages } = useEventBudgetData()
  const [form, setForm] = useState<UpsertEventBudgetInput>(() => budget ? { ...budget } : newBudgetForm())
  const [selectedAddons, setSelectedAddons] = useState<BudgetAddonSnapshot[]>(() => budget?.selectedAddons ?? [])
  const [decorationMode, setDecorationMode] = useState<DecorationMode>(() => budget?.decorationMode ?? 'selected')
  const [selectedDecoration, setSelectedDecoration] = useState<BudgetDecorationSnapshot | null>(() => budget?.selectedDecoration ?? null)
  const [alternatives, setAlternatives] = useState<BudgetDecorationSnapshot[]>(() => budget?.decorationAlternatives ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const activePackages = packages.filter((item) => item.isActive)
  const activeAddons = addons.filter((item) => item.isActive)
  const activeDecorations = decorations.filter((item) => item.isActive)
  const payload = buildBudgetPayload(form, activePackages, selectedAddons, decorationMode, selectedDecoration, alternatives)

  const setField = (field: keyof UpsertEventBudgetInput, value: string | number | null) => setForm((current) => ({ ...current, [field]: value }))
  const setPackage = (packageId: string) => {
    const item = packages.find((candidate) => candidate.id === packageId)
    setForm((current) => ({ ...current, packageSnapshot: item ? packageSnapshotFromConfig(item) : null }))
  }
  const addAddon = (addon: BudgetAddon) => {
    setSelectedAddons((current) => {
      const existing = current.find((item) => item.id === addon.id)
      if (existing) return current.map((item) => item.id === addon.id ? { ...item, quantity: item.quantity + 1, subtotal: (item.quantity + 1) * item.unitPrice } : item)
      return [...current, addonSnapshotFromConfig(addon, 1)]
    })
  }
  const changeAddonQty = (addonId: string | undefined, delta: number) => {
    setSelectedAddons((current) => current.flatMap((item) => {
      if (item.id !== addonId) return [item]
      const quantity = item.quantity + delta
      return quantity <= 0 ? [] : [{ ...item, quantity, subtotal: quantity * item.unitPrice }]
    }))
  }
  const toggleAlternative = (decoration: BudgetDecoration) => {
    setAlternatives((current) => {
      if (current.some((item) => item.id === decoration.id)) return current.filter((item) => item.id !== decoration.id)
      return [...current, decorationSnapshotFromConfig(decoration)]
    })
  }
  const save = async (nextStatus: EventBudgetStatus = payload.status) => {
    if (!payload.childName || !payload.responsibleName || !payload.guestCount || (!payload.finalTotal && !payload.alternativeTotals.length)) {
      setError('Completá niño/a, responsable, invitados y al menos un total calculable.')
      return null
    }
    setSaving(true)
    setError('')
    const id = await saveEventBudget({ ...payload, status: nextStatus })
    setSaving(false)
    return { ...payload, id, status: nextStatus } as EventBudget
  }
  const generatePdf = async () => {
    const saved = await save(payload.status)
    if (saved) await downloadEventBudgetPdf(saved)
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card budget-builder-modal" role="dialog" aria-modal="true">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Presupuesto de evento</p>
            <h2>{budget ? 'Editar presupuesto' : 'Crear presupuesto'}</h2>
          </div>
          <button className="button ghost" onClick={onClose} type="button"><X size={18} /> Cerrar</button>
        </div>
        {error ? <div className="form-alert error">{error}</div> : null}
        <div className="budget-builder-grid">
          <div className="budget-form-stack">
            <article className="budget-builder-card">
              <h3>Datos del cliente</h3>
              <div className="compact-form">
                <label className="field"><span>Nombre del niño/a cumpleañero/a</span><input value={form.childName} onChange={(event) => setField('childName', event.target.value)} /></label>
                <label className="field"><span>Nombre del responsable</span><input value={form.responsibleName} onChange={(event) => setField('responsibleName', event.target.value)} /></label>
                <label className="field"><span>Teléfono / WhatsApp</span><input value={form.responsiblePhone} onChange={(event) => setField('responsiblePhone', event.target.value)} /></label>
                <label className="field"><span>Fecha tentativa</span><input type="date" value={form.tentativeEventDate} onChange={(event) => setField('tentativeEventDate', event.target.value)} /></label>
                <label className="field"><span>Inicio</span><input type="time" value={form.tentativeStartTime} onChange={(event) => setField('tentativeStartTime', event.target.value)} /></label>
                <label className="field"><span>Finalización</span><input type="time" value={form.tentativeEndTime} onChange={(event) => setField('tentativeEndTime', event.target.value)} /></label>
                <label className="field full"><span>Observaciones internas</span><textarea rows={3} value={form.notes} onChange={(event) => setField('notes', event.target.value)} /></label>
              </div>
            </article>

            <article className="budget-builder-card">
              <h3>Cantidad de invitados</h3>
              <div className="compact-form">
                <label className="field"><span>Cantidad estimada</span><input type="number" value={form.guestCount || ''} onChange={(event) => setField('guestCount', Number(event.target.value))} /></label>
                <label className="field"><span>Paquete aplicado</span><select value={payload.packageSnapshot?.id ?? ''} onChange={(event) => setPackage(event.target.value)}><option value="">Automático</option>{packages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              </div>
              <div className="budget-subtotal-box">
                <strong>{payload.packageSnapshot?.name ?? 'Sin paquete configurado'}</strong>
                <span>Precio base: {formatGuarani(payload.packageSnapshot?.basePrice ?? 0)}</span>
                <span>Invitados adicionales: {payload.extraGuestsCount} x {formatGuarani(payload.extraGuestUnitPrice)} = {formatGuarani(payload.extraGuestsSubtotal)}</span>
                <strong>Subtotal paquete: {formatGuarani((payload.packageSnapshot?.basePrice ?? 0) + payload.extraGuestsSubtotal)}</strong>
              </div>
            </article>

            <article className="budget-builder-card">
              <h3>Adicionales</h3>
              {activeAddons.length === 0 ? <div className="empty-state">No hay adicionales activos configurados.</div> : null}
              <div className="budget-pick-grid">
                {activeAddons.map((addon) => (
                  <button className="budget-pick-card" key={addon.id} onClick={() => addAddon(addon)} type="button">
                    <strong>{addon.name}</strong>
                    <small>{addon.description || 'Adicional configurable'}</small>
                    <span>{formatGuarani(addon.unitPrice)}</span>
                    <i>+ Agregar</i>
                  </button>
                ))}
              </div>
              <div className="budget-selected-list">
                {selectedAddons.map((addon) => (
                  <div className="budget-selected-row" key={addon.id ?? addon.name}>
                    <span><strong>{addon.name}</strong><small>{addon.quantity} x {formatGuarani(addon.unitPrice)} = {formatGuarani(addon.subtotal)}</small></span>
                    <div>
                      <button className="button ghost small-button" onClick={() => changeAddonQty(addon.id, -1)} type="button">-</button>
                      <button className="button ghost small-button" onClick={() => changeAddonQty(addon.id, 1)} type="button">+</button>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="budget-builder-card">
              <h3>Decoración</h3>
              <div className="reservation-filter-row secondary">
                <button className={decorationMode === 'selected' ? 'active' : ''} onClick={() => setDecorationMode('selected')} type="button">Decoración definida</button>
                <button className={decorationMode === 'alternatives' ? 'active' : ''} onClick={() => setDecorationMode('alternatives')} type="button">Alternativas para elegir</button>
              </div>
              <div className="budget-pick-grid">
                {activeDecorations.map((decoration) => {
                  const snapshot = decorationSnapshotFromConfig(decoration)
                  const active = decorationMode === 'selected' ? selectedDecoration?.id === decoration.id : alternatives.some((item) => item.id === decoration.id)
                  return (
                    <button
                      className={`budget-pick-card ${active ? 'selected' : ''}`}
                      key={decoration.id}
                      onClick={() => decorationMode === 'selected' ? setSelectedDecoration(snapshot) : toggleAlternative(decoration)}
                      type="button"
                    >
                      {decoration.imageUrl ? <img src={decoration.imageUrl} alt="" style={{ width: '100%', height: 56, objectFit: 'cover', borderRadius: 4, marginBottom: 4, display: 'block' }} /> : null}
                      <strong>{decoration.name}</strong>
                      <small>{decoration.category ? `${decoration.category} · Nivel ${decoration.level}` : `Nivel ${decoration.level}`}</small>
                      <small>{decoration.description}</small>
                      <span>{formatGuarani(decoration.price)}</span>
                      <i>{active ? 'Seleccionada' : '+ Agregar opción'}</i>
                    </button>
                  )
                })}
              </div>
            </article>
          </div>

          <aside className="budget-live-summary">
            <h3>Resumen del presupuesto</h3>
            <div className="budget-summary-lines">
              <span>Responsable <strong>{payload.responsibleName || 'Sin cargar'}</strong></span>
              <span>Cumpleañero/a <strong>{payload.childName || 'Sin cargar'}</strong></span>
              <span>Fecha tentativa <strong>{payload.tentativeEventDate ? formatDate(payload.tentativeEventDate) : 'A definir'}</strong></span>
              <span>Invitados <strong>{payload.guestCount || 0}</strong></span>
              <span>Paquete <strong>{payload.packageSnapshot?.name ?? 'Sin paquete'}</strong></span>
              <span>Adicionales <strong>{formatGuarani(snapshotTotal(payload.selectedAddons))}</strong></span>
              <span>Subtotal sin decoración <strong>{formatGuarani(payload.baseSubtotal)}</strong></span>
            </div>
            {payload.decorationMode === 'selected' ? (
              <div className="budget-total-box">
                <span>Decoración: {payload.selectedDecoration?.name ?? 'Sin decoración'}</span>
                <strong>{formatGuarani(payload.finalTotal ?? payload.baseSubtotal)}</strong>
              </div>
            ) : (
              <div className="budget-alternative-box">
                {payload.alternativeTotals.length === 0 ? <small>Seleccioná dos o tres decoraciones para enviar alternativas.</small> : null}
                {payload.alternativeTotals.map((item) => (
                  <span key={item.decoration.id}>{item.decoration.name}<strong>{formatGuarani(item.total)}</strong></span>
                ))}
              </div>
            )}
            <div className="budget-summary-actions">
              <button className="button ghost" disabled={saving} onClick={() => save('draft').then((saved) => saved && onClose())} type="button"><FileText size={17} /> Guardar borrador</button>
              <button className="button primary" disabled={saving} onClick={generatePdf} type="button"><Download size={17} /> Generar PDF</button>
              <button className="button secondary" disabled={saving} onClick={() => save('sent').then((saved) => saved && onClose())} type="button"><Send size={17} /> Marcar enviado</button>
            </div>
          </aside>
        </div>
      </section>
    </div>
  )
}

function DecorationCatalogModal({ decorations, onClose }: { decorations: BudgetDecoration[]; onClose: () => void }) {
  const [selected, setSelected] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)
  const active = decorations.filter((d) => d.isActive)

  const toggle = (id: string) => {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((x) => x !== id)
      if (current.length >= 3) return current
      return [...current, id]
    })
  }

  const generate = async () => {
    setGenerating(true)
    await downloadDecorationCatalogPdf(active.filter((d) => selected.includes(d.id)))
    setGenerating(false)
    onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card" role="dialog" aria-modal="true" style={{ maxWidth: 520 }}>
        <div className="panel-header">
          <div>
            <p className="eyebrow">Decoración</p>
            <h2>Generar catálogo de decoración</h2>
          </div>
          <button className="button ghost" onClick={onClose} type="button"><X size={18} /> Cerrar</button>
        </div>
        <p className="muted" style={{ marginBottom: 12 }}>Seleccioná hasta 3 opciones para incluir en el PDF.</p>
        {active.length === 0 ? <div className="empty-state">No hay opciones de decoración activas configuradas.</div> : null}
        <div className="budget-config-list">
          {active.map((decoration) => {
            const isSelected = selected.includes(decoration.id)
            const isDisabled = !isSelected && selected.length >= 3
            return (
              <button
                className={`user-row-button ${isSelected ? 'selected' : ''}`}
                disabled={isDisabled}
                key={decoration.id}
                onClick={() => toggle(decoration.id)}
                style={{ opacity: isDisabled ? 0.4 : 1 }}
                type="button"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                  {decoration.imageUrl
                    ? <img src={decoration.imageUrl} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                    : <div style={{ width: 44, height: 44, background: 'var(--bg-muted, #f4f4f4)', borderRadius: 4, flexShrink: 0 }} />}
                  <div>
                    <strong>{decoration.name}</strong>
                    <small>{[decoration.category, `Nivel ${decoration.level}`].filter(Boolean).join(' · ')} · {formatGuarani(decoration.price)}</small>
                  </div>
                </div>
                {isSelected ? <CheckCircle2 size={18} color="var(--green)" style={{ flexShrink: 0 }} /> : null}
              </button>
            )
          })}
        </div>
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end' }}>
          <small className="muted">{selected.length}/3 seleccionadas</small>
          <button className="button primary" disabled={selected.length === 0 || generating} onClick={generate} type="button">
            <Download size={17} /> {generating ? 'Generando PDF…' : 'Descargar PDF'}
          </button>
        </div>
      </section>
    </div>
  )
}

export function EventBudgetsSection() {
  const { budgets, decorations, error, isLoading } = useEventBudgetData()
  const { profile } = useUserProfile()
  const canManageConfig = profile?.role === 'admin' || profile?.role === 'socio'
  const canManageBudgets = profile?.role === 'admin' || profile?.role === 'socio' || profile?.role === 'encargado_eventos'
  const [filter, setFilter] = useState<BudgetFilter>('all')
  const [showForm, setShowForm] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [showCatalog, setShowCatalog] = useState(false)
  const [isCreateSectionOpen, setIsCreateSectionOpen] = useState(false)
  const [isListSectionOpen, setIsListSectionOpen] = useState(false)
  const [editingBudget, setEditingBudget] = useState<EventBudget | null>(null)
  const [actionError, setActionError] = useState('')
  const filteredBudgets = useMemo(() => (filter === 'all' ? budgets : budgets.filter((budget) => budget.status === filter)), [budgets, filter])

  const changeStatus = async (budget: EventBudget, status: EventBudgetStatus) => {
    setActionError('')
    try {
      await updateEventBudgetStatus(budget.id, status)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No se pudo actualizar el presupuesto.')
    }
  }

  const convert = async (budget: EventBudget) => {
    setActionError('')
    try {
      let decorationId: string | undefined
      if (budget.decorationMode === 'alternatives') {
        const options = budget.decorationAlternatives.map((item, index) => `${index + 1}. ${item.name}`).join('\n')
        const answer = window.prompt(`¿Qué decoración eligió el cliente?\n${options}`)
        const index = Number(answer) - 1
        decorationId = budget.decorationAlternatives[index]?.id
        if (!decorationId) return
      }
      const eventId = await convertBudgetToReservation(budget, decorationId)
      window.alert(`Reserva creada correctamente: ${eventId}`)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No se pudo convertir en reserva.')
    }
  }

  return (
    <article className="panel event-budgets-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Eventos</p>
          <h2 className="panel-title"><Calculator color="var(--orange)" /> Presupuestos de eventos</h2>
          <p className="muted">Generá propuestas personalizadas para cumpleaños y eventos privados en minutos.</p>
        </div>
        <div className="module-actions">
          <StatusPill tone="info">{budgets.length} presupuestos</StatusPill>
          {canManageBudgets ? <button className="button ghost" onClick={() => setShowCatalog(true)} type="button"><BookImage size={17} /> Catálogo de decoración</button> : null}
          {canManageConfig ? <button className="button ghost" onClick={() => setShowConfig(true)} type="button"><Settings2 size={17} /> Configurar precios y servicios</button> : null}
          {canManageBudgets ? <button className="button primary" onClick={() => { setEditingBudget(null); setShowForm(true) }} type="button"><Plus size={18} /> Crear presupuesto</button> : null}
        </div>
      </div>
      {actionError || error ? <div className="form-alert error">{actionError || error}</div> : null}
      <section className="budget-collapsible-section">
        <button className="budget-collapsible-header" onClick={() => setIsCreateSectionOpen((current) => !current)} type="button">
          <span>{isCreateSectionOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />} Crear presupuesto de evento</span>
          <StatusPill tone="info">Herramienta comercial</StatusPill>
        </button>
        {isCreateSectionOpen ? (
          <div className="budget-collapsible-body">
            <p className="muted">Armá una propuesta con datos del cliente, invitados, adicionales, decoración y PDF.</p>
            {canManageBudgets ? (
              <button className="button primary" onClick={() => { setEditingBudget(null); setShowForm(true) }} type="button"><Plus size={18} /> Crear presupuesto</button>
            ) : <div className="empty-state">Tu rol no permite crear presupuestos.</div>}
          </div>
        ) : null}
      </section>

      <section className="budget-collapsible-section">
        <button className="budget-collapsible-header" onClick={() => setIsListSectionOpen((current) => !current)} type="button">
          <span>{isListSectionOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />} Presupuestos creados</span>
          <StatusPill tone="info">{filteredBudgets.length} visibles</StatusPill>
        </button>
        {isListSectionOpen ? (
          <div className="budget-collapsible-body">
            <div className="reservation-filter-row secondary">
              {([
                ['all', 'Todos'],
                ['draft', 'Borradores'],
                ['sent', 'Enviados'],
                ['approved', 'Aprobados'],
                ['rejected', 'Rechazados'],
                ['converted', 'Convertidos en reserva'],
              ] as Array<[BudgetFilter, string]>).map(([value, label]) => (
                <button className={filter === value ? 'active' : ''} key={value} onClick={() => setFilter(value)} type="button">{label}</button>
              ))}
            </div>
            {isLoading ? <div className="empty-state">Cargando presupuestos...</div> : null}
            {!isLoading && filteredBudgets.length === 0 ? <div className="empty-state">Todavía no hay presupuestos para mostrar.</div> : null}
            <div className="event-budget-list">
              {filteredBudgets.map((budget) => (
                <article className="event-budget-card" key={budget.id}>
                  <div className="event-budget-main">
                    <strong>{budget.childName || 'Sin niño/a'}</strong>
                    <p>Responsable: {budget.responsibleName || 'Sin responsable'}</p>
                    <small>{budget.responsiblePhone ? formatParaguayanPhone(budget.responsiblePhone) : 'Sin teléfono'} · Fecha tentativa: {formatDate(budget.tentativeEventDate)} · Creado por: {budget.createdByName || 'Sin usuario'}</small>
                  </div>
                  <div className="event-budget-total">
                    <BudgetStatusPill status={budget.status} />
                    <strong>{budget.decorationMode === 'alternatives' ? 'Según opción seleccionada' : formatGuarani(budget.finalTotal ?? budget.baseSubtotal)}</strong>
                    <small>Creado: {formatDate(budget.createdAt)}</small>
                  </div>
                  <div className="event-budget-actions">
                    <button className="button ghost" onClick={() => { setEditingBudget(budget); setShowForm(true) }} type="button"><Edit3 size={16} /> Ver detalle</button>
                    <button className="button ghost" onClick={() => { setEditingBudget(budget); setShowForm(true) }} type="button"><Edit3 size={16} /> Editar</button>
                    <button className="button ghost" onClick={() => downloadEventBudgetPdf(budget)} type="button"><Download size={16} /> PDF</button>
                    {budget.status === 'draft' ? <button className="button secondary" onClick={() => changeStatus(budget, 'sent')} type="button"><Send size={16} /> Enviado</button> : null}
                    {budget.status !== 'approved' && budget.status !== 'converted' ? <button className="button secondary" onClick={() => changeStatus(budget, 'approved')} type="button"><CheckCircle2 size={16} /> Aprobar</button> : null}
                    {budget.status !== 'rejected' && budget.status !== 'converted' ? <button className="button ghost" onClick={() => changeStatus(budget, 'rejected')} type="button"><XCircle size={16} /> Rechazar</button> : null}
                    {budget.status === 'approved' ? <button className="button primary" onClick={() => convert(budget)} type="button"><PackagePlus size={16} /> Convertir en reserva</button> : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </section>
      {showForm ? <BudgetFormModal budget={editingBudget} onClose={() => setShowForm(false)} /> : null}
      {showConfig ? <BudgetConfigPanel onClose={() => setShowConfig(false)} /> : null}
      {showCatalog ? <DecorationCatalogModal decorations={decorations} onClose={() => setShowCatalog(false)} /> : null}
    </article>
  )
}
