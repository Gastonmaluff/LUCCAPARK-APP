import { ChevronDown, Plus, UserPlus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { timePlans } from '../../config/timePlans'
import { useVisitPricing } from '../../hooks/useVisitPricing'
import { createNormalVisit, findResponsibleByDocument, normalizeDocumentNumber } from '../../services/visitService'
import { calculateAgeMonths, calculateAgeYears, formatAgeLabel, formatBirthDateInput, formatMonthsLabel, parseBirthDateDisplay } from '../../utils/birthDate'
import { formatGuarani } from '../../utils/money'
import { formatParaguayanPhone, formatPersonName, phoneDigits } from '../../utils/textFormat'
import { PaymentMethodSelector } from '../payments/PaymentMethodSelector'
import type { ChildProfile, CreateVisitInput, PaymentMethod, PaymentStatus, TimePlan } from '../../types'

type ChildEntryMode = 'existing' | 'new'
type PromotionAdjustmentType = 'percentage' | 'finalAmount'

interface ChildEntry {
  localId: string
  mode: ChildEntryMode
  childId?: string
  childName: string
  childBirthDateInput: string
  childExactAge: string
  childGender: string
  childNotes: string
  planId: TimePlan['id']
  startedAtTime: string
  amountCharged: string
  customAmount: boolean
  isPromotionOpen: boolean
  promotionType: PromotionAdjustmentType
  discountPercentage: string
  specialFinalAmount: string
  promotionReason: string
  babyFreeRequested: boolean
  babyFreeReason: string
  notes: string
}

const formatTimeValue = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

const parseTodayTime = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number)
  const date = new Date()
  date.setHours(hours || 0, minutes || 0, 0, 0)
  return date
}

const makeLocalId = () => `child-entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const getPlanPrice = (planId: TimePlan['id']) => timePlans.find((plan) => plan.id === planId)?.defaultPrice ?? null

const birthDateIsoToDisplay = (value?: string) => {
  if (!value) return ''
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : ''
}

const genderLabel = (value?: string) => {
  if (value === 'female') return 'Femenino'
  if (value === 'male') return 'Masculino'
  return value || ''
}

const createChildEntry = (overrides: Partial<ChildEntry> = {}): ChildEntry => {
  const defaultPlan = 'one-hour' as TimePlan['id']
  return {
    localId: makeLocalId(),
    mode: 'new',
    childId: undefined,
    childName: '',
    childBirthDateInput: '',
    childExactAge: '',
    childGender: '',
    childNotes: '',
    planId: defaultPlan,
    startedAtTime: formatTimeValue(new Date()),
    amountCharged: String(getPlanPrice(defaultPlan) ?? ''),
    customAmount: false,
    isPromotionOpen: false,
    promotionType: 'percentage',
    discountPercentage: '',
    specialFinalAmount: '',
    promotionReason: '',
    babyFreeRequested: false,
    babyFreeReason: '',
    notes: '',
    ...overrides,
  }
}

const createEntryFromChild = (child: ChildProfile) =>
  createChildEntry({
    mode: 'existing',
    childId: child.id,
    childName: child.name ?? '',
    childBirthDateInput: birthDateIsoToDisplay(child.birthDate),
    childGender: child.gender ?? '',
    childNotes: child.notes ?? '',
  })

const initialResponsibleForm = () => ({
  customerDocumentNumber: '',
  customerName: '',
  customerPhone: '',
  customerRelation: '',
  paymentStatus: 'paid' as PaymentStatus,
})

const getPromotionPreview = (entry: ChildEntry, defaultAmount: number | null) => {
  if (!defaultAmount || !entry.isPromotionOpen) {
    return { isApplied: false, finalAmount: defaultAmount ?? 0, discountAmount: 0 }
  }
  if (entry.promotionType === 'percentage') {
    const percentage = Number(entry.discountPercentage)
    if (!Number.isFinite(percentage) || percentage <= 0 || percentage >= 100) {
      return { isApplied: false, finalAmount: defaultAmount, discountAmount: 0 }
    }
    const finalAmount = Math.round(defaultAmount * (100 - percentage) / 100)
    return { isApplied: true, finalAmount, discountAmount: defaultAmount - finalAmount }
  }
  const finalAmount = Number(entry.specialFinalAmount)
  if (!Number.isSafeInteger(finalAmount) || finalAmount <= 0 || finalAmount >= defaultAmount) {
    return { isApplied: false, finalAmount: defaultAmount, discountAmount: 0 }
  }
  return { isApplied: true, finalAmount, discountAmount: defaultAmount - finalAmount }
}

interface BabyEligibility {
  ageMonths: number | null
  hasBirthDate: boolean
  autoEligible: boolean
  configReady: boolean
}

const getBabyEligibility = (
  birthDateIso: string,
  reference: Date,
  config: { babyFreeEntryEnabled: boolean; babyFreeMaxAgeMonths: number | null },
): BabyEligibility => {
  const ageMonths = calculateAgeMonths(birthDateIso, reference)
  const configReady = config.babyFreeEntryEnabled && config.babyFreeMaxAgeMonths !== null
  const autoEligible = configReady && ageMonths !== null && ageMonths <= (config.babyFreeMaxAgeMonths ?? 0)
  return { ageMonths, hasBirthDate: Boolean(birthDateIso), autoEligible, configReady }
}

interface VisitFormProps {
  compact?: boolean
  onCancel?: () => void
  onCreated?: (visitId: string) => void
}

export function VisitForm({ compact = false, onCancel, onCreated }: VisitFormProps) {
  const documentInputRef = useRef<HTMLInputElement | null>(null)
  const [responsibleForm, setResponsibleForm] = useState(initialResponsibleForm)
  const [childEntries, setChildEntries] = useState<ChildEntry[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isLookingUpDocument, setIsLookingUpDocument] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pendingPaidEntries, setPendingPaidEntries] = useState<CreateVisitInput[] | null>(null)
  const [entryPaymentMethod, setEntryPaymentMethod] = useState<Exclude<PaymentMethod, ''> | ''>('')
  const [entryCardType, setEntryCardType] = useState<'debit' | 'credit' | ''>('')
  const [responsibleLookup, setResponsibleLookup] = useState<Awaited<ReturnType<typeof findResponsibleByDocument>> | null>(null)
  const [showRegisteredPicker, setShowRegisteredPicker] = useState(false)
  const babyConfig = useVisitPricing().config

  const normalizedDocumentNumber = useMemo(
    () => normalizeDocumentNumber(responsibleForm.customerDocumentNumber),
    [responsibleForm.customerDocumentNumber],
  )
  const selectedChildIds = useMemo(
    () => new Set(childEntries.map((entry) => entry.childId).filter(Boolean) as string[]),
    [childEntries],
  )
  const availableLinkedChildren = useMemo(
    () => (responsibleLookup?.children ?? []).filter((child) => !selectedChildIds.has(child.id)),
    [responsibleLookup?.children, selectedChildIds],
  )
  const totalAmount = useMemo(
    () => childEntries.reduce((sum, entry) => {
      const plan = timePlans.find((item) => item.id === entry.planId)
      const preview = getPromotionPreview(entry, plan?.defaultPrice ?? null)
      return plan?.isUnlimited ? sum : sum + (preview.isApplied ? preview.finalAmount : Number(plan?.defaultPrice ?? entry.amountCharged ?? 0))
    }, 0),
    [childEntries],
  )
  const hasUnlimitedEntry = useMemo(
    () => childEntries.some((entry) => timePlans.find((plan) => plan.id === entry.planId)?.isUnlimited),
    [childEntries],
  )

  useEffect(() => {
    documentInputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (hasUnlimitedEntry && responsibleForm.paymentStatus === 'paid') {
      setResponsibleForm((current) => ({ ...current, paymentStatus: 'payAtExit' }))
    }
  }, [hasUnlimitedEntry, responsibleForm.paymentStatus])

  const setResponsibleField = (field: keyof ReturnType<typeof initialResponsibleForm>, value: string) => {
    setResponsibleForm((current) => ({ ...current, [field]: value }))
  }

  const updateChildEntry = (localId: string, updates: Partial<ChildEntry>) => {
    setChildEntries((current) =>
      current.map((entry) => (entry.localId === localId ? { ...entry, ...updates } : entry)),
    )
  }

  const handlePlanChange = (localId: string, planId: TimePlan['id']) => {
    const nextPlan = timePlans.find((plan) => plan.id === planId)
    const nextPrice = nextPlan?.defaultPrice ?? null
    setChildEntries((current) =>
      current.map((entry) =>
        entry.localId === localId
          ? {
              ...entry,
              planId,
              customAmount: false,
              isPromotionOpen: false,
              promotionType: 'percentage',
              discountPercentage: '',
              specialFinalAmount: '',
              promotionReason: '',
              amountCharged: nextPlan?.isUnlimited ? '' : String(nextPrice ?? ''),
            }
          : entry,
      ),
    )
    if (nextPlan?.isUnlimited) {
      setResponsibleField('paymentStatus', 'payAtExit')
    }
  }

  const toggleExistingChild = (child: ChildProfile) => {
    setError(null)
    setShowRegisteredPicker(false)
    setChildEntries((current) => {
      if (current.some((entry) => entry.childId === child.id)) {
        return current.filter((entry) => entry.childId !== child.id)
      }
      return [...current, createEntryFromChild(child)]
    })
  }

  const addNewChild = () => {
    setError(null)
    setShowRegisteredPicker(false)
    setChildEntries((current) => [...current, createChildEntry()])
  }

  const removeChildEntry = (localId: string) => {
    setChildEntries((current) => current.filter((entry) => entry.localId !== localId))
  }

  const cancelPromotionAdjustment = (localId: string) => {
    setChildEntries((current) =>
      current.map((entry) => {
        if (entry.localId !== localId) return entry
        const defaultAmount = getPlanPrice(entry.planId)
        return {
          ...entry,
          customAmount: false,
          isPromotionOpen: false,
          promotionType: 'percentage',
          discountPercentage: '',
          specialFinalAmount: '',
          promotionReason: '',
          amountCharged: String(defaultAmount ?? ''),
        }
      }),
    )
  }

  const togglePromotionAdjustment = (entry: ChildEntry) => {
    if (entry.isPromotionOpen) {
      cancelPromotionAdjustment(entry.localId)
      return
    }
    updateChildEntry(entry.localId, { isPromotionOpen: true })
  }

  const resetForm = () => {
    setResponsibleForm(initialResponsibleForm())
    setChildEntries([])
    setResponsibleLookup(null)
    setShowRegisteredPicker(false)
    setPendingPaidEntries(null)
    setEntryPaymentMethod('')
    setEntryCardType('')
  }

  useEffect(() => {
    if (normalizedDocumentNumber.length === 0) {
      setResponsibleLookup(null)
      setChildEntries([])
      setShowRegisteredPicker(false)
      setIsLookingUpDocument(false)
      return
    }

    if (normalizedDocumentNumber.length < 4) {
      setResponsibleLookup(null)
      setChildEntries([])
      setShowRegisteredPicker(false)
      setIsLookingUpDocument(false)
      return
    }

    let cancelled = false
    setIsLookingUpDocument(true)
    const timeout = window.setTimeout(() => {
      findResponsibleByDocument(responsibleForm.customerDocumentNumber)
        .then((result) => {
          if (cancelled) return
          setResponsibleLookup(result)
          setShowRegisteredPicker(false)
          if (!result) {
            setChildEntries([])
            return
          }
          setResponsibleForm((current) => ({
            ...current,
            customerName: result.name || current.customerName,
            customerPhone: result.phone ? formatParaguayanPhone(result.phone) : current.customerPhone,
            customerRelation: result.relation || current.customerRelation,
          }))
          setChildEntries(result.children.length === 1 ? [createEntryFromChild(result.children[0])] : [])
        })
        .catch(() => {
          if (!cancelled) {
            setResponsibleLookup(null)
            setChildEntries([])
          }
        })
        .finally(() => {
          if (!cancelled) setIsLookingUpDocument(false)
        })
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [responsibleForm.customerDocumentNumber, normalizedDocumentNumber])

  const buildPayloads = () => {
    const customerName = formatPersonName(responsibleForm.customerName)
    const normalizedPhone = phoneDigits(responsibleForm.customerPhone)

    if (!customerName || !responsibleForm.paymentStatus) {
      throw new Error('Completá responsable y estado de pago.')
    }

    if (normalizedDocumentNumber.length > 0 && normalizedDocumentNumber.length < 4) {
      throw new Error('La cédula del responsable parece demasiado corta.')
    }

    if (childEntries.length === 0) {
      throw new Error('Seleccioná o registrá al menos un niño para ingresar.')
    }

    const groupEntryId = childEntries.length > 1 ? `group-entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : undefined

    return childEntries.map((entry) => {
      const childName = formatPersonName(entry.childName)
      const birthDateResult = parseBirthDateDisplay(entry.childBirthDateInput)
      const selectedPlan = timePlans.find((plan) => plan.id === entry.planId) ?? timePlans[0]
      const defaultAmount = selectedPlan.defaultPrice ?? null
      const isUnlimitedPlan = selectedPlan.isUnlimited
      const startedAt = parseTodayTime(entry.startedAtTime)
      const babyEligibility = getBabyEligibility(birthDateResult.iso, startedAt, babyConfig)
      const applyBaby = babyEligibility.autoEligible || entry.babyFreeRequested
      const promotionPreview = getPromotionPreview(entry, defaultAmount)
      const hasPromotionInput = entry.isPromotionOpen && (
        entry.discountPercentage.trim()
        || entry.specialFinalAmount.trim()
        || entry.promotionReason.trim()
      )

      if (!childName || !entry.planId) {
        throw new Error('Completá nombre del niño y plan de todos los ingresos.')
      }

      if (birthDateResult.error) {
        throw new Error(`${childName}: ${birthDateResult.error}`)
      }

      if (applyBaby && isUnlimitedPlan) {
        throw new Error(`${childName}: la entrada gratuita por bebé no se combina con el plan libre. Elegí otro plan.`)
      }

      // Selección manual (no cumple por edad o no hay config automática) exige motivo.
      if (applyBaby && !babyEligibility.autoEligible && !entry.babyFreeReason.trim()) {
        throw new Error(`${childName}: indica el motivo de la entrada gratuita por bebé.`)
      }

      if (!applyBaby && !isUnlimitedPlan && entry.isPromotionOpen) {
        if (!promotionPreview.isApplied) {
          throw new Error(`${childName}: completa un descuento o monto final valido menor al precio normal.`)
        }
        if (!entry.promotionReason.trim()) {
          throw new Error(`${childName}: indica el motivo del descuento o monto especial.`)
        }
      }

      if (!applyBaby && !isUnlimitedPlan && hasPromotionInput && !promotionPreview.isApplied) {
        throw new Error(`${childName}: cancela el ajuste o completalo correctamente.`)
      }

      const babyFreeEntry = applyBaby
        ? { requested: true, reason: babyEligibility.autoEligible ? '' : entry.babyFreeReason.trim() }
        : null

      const finalAmount = applyBaby ? 0 : isUnlimitedPlan ? null : promotionPreview.isApplied ? promotionPreview.finalAmount : defaultAmount
      const promotionalAdjustment = !applyBaby && !isUnlimitedPlan && promotionPreview.isApplied
        ? {
            type: entry.promotionType,
            percentage: entry.promotionType === 'percentage' ? Number(entry.discountPercentage) : null,
            finalAmount: entry.promotionType === 'finalAmount' ? promotionPreview.finalAmount : null,
            reason: entry.promotionReason.trim(),
          }
        : null

      return {
        childId: entry.childId,
        childName,
        childBirthDate: birthDateResult.iso,
        childExactAge: birthDateResult.iso ? null : entry.childExactAge ? Number(entry.childExactAge) : null,
        childAgeCalculated: calculateAgeYears(birthDateResult.iso),
        childGender: entry.childGender,
        childNotes: entry.childNotes,
        customerId: responsibleLookup?.id,
        customerName,
        customerPhone: normalizedPhone,
        customerRelation: responsibleForm.customerRelation,
        customerDocumentNumber: responsibleForm.customerDocumentNumber,
        customerDocumentNumberNormalized: normalizedDocumentNumber,
        childrenCount: 1,
        planId: selectedPlan.id,
        startedAt,
        paymentStatus: applyBaby ? 'paid' : isUnlimitedPlan ? 'payAtExit' : responsibleForm.paymentStatus,
        paymentMethod: responsibleForm.paymentStatus === 'paid' ? '' : '',
        cardType: '',
        amountCharged: finalAmount,
        defaultAmount: applyBaby || isUnlimitedPlan ? null : defaultAmount,
        customAmount: applyBaby ? false : isUnlimitedPlan ? false : promotionPreview.isApplied,
        promotionalAdjustment,
        babyFreeEntry,
        notes: entry.notes,
        groupEntryId,
      } satisfies CreateVisitInput
    })
  }

  const createVisits = async (payloads: CreateVisitInput[]) => {
    const createdIds: string[] = []
    for (const payload of payloads) {
      const visitId = await createNormalVisit(payload)
      createdIds.push(visitId)
    }
    return createdIds
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSaving) return
    setError(null)
    setSuccess(null)

    let payloads: CreateVisitInput[]
    try {
      payloads = buildPayloads()
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : 'No se pudo validar el ingreso.')
      return
    }

    const paidTotal = payloads.reduce((sum, payload) => sum + Number(payload.amountCharged ?? payload.defaultAmount ?? 0), 0)
    if (responsibleForm.paymentStatus === 'paid' && !hasUnlimitedEntry && paidTotal > 0) {
      setPendingPaidEntries(payloads)
      setEntryPaymentMethod('')
      setEntryCardType('')
      return
    }

    setIsSaving(true)
    try {
      const ids = await createVisits(payloads)
      setSuccess(payloads.length === 1 ? 'Ingreso registrado correctamente.' : `${payloads.length} ingresos registrados correctamente.`)
      resetForm()
      onCreated?.(ids[0])
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudieron registrar los ingresos.')
    } finally {
      setIsSaving(false)
    }
  }

  const confirmPaidEntry = async () => {
    if (!pendingPaidEntries?.length || isSaving) return
    if (!entryPaymentMethod) {
      setError('Seleccioná un método de pago para confirmar el ingreso.')
      return
    }
    if (entryPaymentMethod === 'card' && !entryCardType) {
      setError('Seleccioná si la tarjeta es débito o crédito.')
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      const ids = await createVisits(
        pendingPaidEntries.map((payload) => ({
          ...payload,
          paymentMethod: entryPaymentMethod,
          cardType: entryPaymentMethod === 'card' ? entryCardType : '',
        })),
      )
      setSuccess(pendingPaidEntries.length === 1 ? 'Cobro e ingreso registrados correctamente.' : `Cobro y ${pendingPaidEntries.length} ingresos registrados correctamente.`)
      resetForm()
      onCreated?.(ids[0])
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudieron registrar los ingresos.')
    } finally {
      setIsSaving(false)
    }
  }

  const submitLabel = childEntries.length <= 1 ? 'Registrar ingreso' : `Registrar ${childEntries.length} ingresos`
  const paidModalTotal = pendingPaidEntries?.reduce((sum, payload) => sum + Number(payload.amountCharged ?? payload.defaultAmount ?? 0), 0) ?? 0

  return (
    <>
      <form className="form-grid visit-entry-form" onSubmit={handleSubmit}>
        {error ? <div className="form-alert error">{error}</div> : null}
        {success ? <div className="form-alert success">{success}</div> : null}

        <section className="visit-form-section">
          <div className="visit-form-section-header">
            <span>1</span>
            <div>
              <strong>Responsable</strong>
              <p>Buscá por cédula para autocompletar datos y niños vinculados.</p>
            </div>
          </div>

          <label className="field">
            <span>Cedula del responsable</span>
            <input
              inputMode="numeric"
              onChange={(event) => setResponsibleField('customerDocumentNumber', event.target.value)}
              placeholder="Ej. 1.234.567"
              ref={documentInputRef}
              value={responsibleForm.customerDocumentNumber}
            />
            <small className="field-hint">
              {isLookingUpDocument
                ? 'Buscando responsable...'
                : responsibleLookup
                  ? 'Responsable encontrado. Seleccioná los niños que ingresan hoy.'
                  : normalizedDocumentNumber.length >= 4
                    ? 'No hay responsable registrado con esa cédula. Podés cargarlo como nuevo.'
                    : 'Ingresa al menos 4 digitos para buscar.'}
            </small>
          </label>

          <label className="field">
            <span>Nombre del responsable *</span>
            <input
              onBlur={() => setResponsibleField('customerName', formatPersonName(responsibleForm.customerName))}
              onChange={(event) => setResponsibleField('customerName', event.target.value)}
              placeholder="Nombre del responsable"
              value={responsibleForm.customerName}
            />
          </label>

          <div className="form-inline">
            <label className="field">
              <span>Telefono</span>
              <input
                inputMode="numeric"
                onChange={(event) => setResponsibleField('customerPhone', formatParaguayanPhone(event.target.value))}
                placeholder="Ej. 0983 626 000"
                value={responsibleForm.customerPhone}
              />
            </label>
            <label className="field">
              <span>Relacion</span>
              <input
                onChange={(event) => setResponsibleField('customerRelation', event.target.value)}
                placeholder="Madre, padre, tutor..."
                value={responsibleForm.customerRelation}
              />
            </label>
          </div>
        </section>

        <section className="visit-form-section">
          <div className="visit-form-section-header">
            <span>2</span>
            <div>
              <strong>Niños que ingresan hoy</strong>
              <p>Seleccioná uno o varios niños del mismo responsable.</p>
            </div>
          </div>

          {responsibleLookup && responsibleLookup.children.length > 0 ? (
            <div className="linked-children-panel">
              <div>
                <strong>¿Qué niños ingresan hoy?</strong>
                <p>
                  {responsibleLookup.children.length === 1
                    ? 'Hay un nino vinculado y queda preseleccionado. Podes desmarcarlo.'
                    : 'Marcá todos los niños que ingresan en esta operación.'}
                </p>
              </div>
              <div className="linked-children-list linked-children-list--multi">
                {responsibleLookup.children.map((child) => {
                  const isSelected = selectedChildIds.has(child.id)
                  const age = child.birthDate ? formatAgeLabel(calculateAgeYears(child.birthDate)) : child.ageRange || 'Edad sin dato'
                  return (
                    <button
                      className={isSelected ? 'selected' : ''}
                      key={child.id}
                      onClick={() => toggleExistingChild(child)}
                      type="button"
                    >
                      <span className="linked-child-check" aria-hidden="true">{isSelected ? '✓' : ''}</span>
                      <strong>{child.name}</strong>
                      <span>{age}{genderLabel(child.gender) ? ` · Sexo: ${genderLabel(child.gender)}` : ''}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          {childEntries.length === 0 ? (
            <div className="empty-state compact">
              {normalizedDocumentNumber.length >= 4 && !responsibleLookup
                ? 'Carga el primer nino para este responsable nuevo.'
                : 'Seleccioná un niño vinculado o agregá uno nuevo.'}
            </div>
          ) : null}

          <div className="selected-children-stack">
            {childEntries.map((entry, index) => {
              const selectedPlan = timePlans.find((plan) => plan.id === entry.planId) ?? timePlans[0]
              const birthDateResult = parseBirthDateDisplay(entry.childBirthDateInput)
              const calculatedAge = calculateAgeYears(birthDateResult.iso)
              const ageLabel = formatAgeLabel(calculatedAge)
              const defaultAmount = selectedPlan.defaultPrice ?? null
              const isUnlimitedPlan = selectedPlan.isUnlimited
              const babyEligibility = getBabyEligibility(birthDateResult.iso, parseTodayTime(entry.startedAtTime), babyConfig)
              const babyApplied = babyEligibility.autoEligible || entry.babyFreeRequested

              return (
                <article className="child-entry-card" key={entry.localId}>
                  <header>
                    <div>
                      <strong>Nino {index + 1}</strong>
                      <small>{entry.mode === 'existing' ? 'Registrado' : 'Nuevo registro'}</small>
                    </div>
                    <button className="text-button danger" onClick={() => removeChildEntry(entry.localId)} type="button">
                      Quitar
                    </button>
                  </header>

                  <label className="field">
                    <span>Nombre del nino *</span>
                    <input
                      onBlur={() => updateChildEntry(entry.localId, { childName: formatPersonName(entry.childName) })}
                      onChange={(event) => updateChildEntry(entry.localId, { childName: event.target.value })}
                      placeholder="Ej. Mateo Rios"
                      value={entry.childName}
                    />
                  </label>

                  {!compact ? (
                    <div className="form-inline">
                      <label className="field">
                        <span>Fecha de nacimiento</span>
                        <input
                          inputMode="numeric"
                          maxLength={10}
                          onChange={(event) => updateChildEntry(entry.localId, {
                            childBirthDateInput: formatBirthDateInput(event.target.value),
                            childExactAge: event.target.value ? '' : entry.childExactAge,
                          })}
                          placeholder="DD/MM/AAAA"
                          value={entry.childBirthDateInput}
                        />
                        {birthDateResult.error ? <small className="field-error">{birthDateResult.error}</small> : null}
                      </label>
                      <label className="field">
                        <span>{birthDateResult.iso ? 'Edad' : 'Edad exacta'}</span>
                        <input
                          disabled={Boolean(birthDateResult.iso)}
                          min={0}
                          onChange={(event) => updateChildEntry(entry.localId, { childExactAge: event.target.value })}
                          placeholder={birthDateResult.iso ? '' : 'Ej. 7'}
                          type={birthDateResult.iso ? 'text' : 'number'}
                          value={birthDateResult.iso ? ageLabel : entry.childExactAge}
                        />
                      </label>
                    </div>
                  ) : null}

                  {!compact ? (
                    <label className="field">
                      <span>Sexo</span>
                      <select onChange={(event) => updateChildEntry(entry.localId, { childGender: event.target.value })} value={entry.childGender}>
                        <option value="">Sin especificar</option>
                        <option value="female">Femenino</option>
                        <option value="male">Masculino</option>
                        <option value="other">Otro</option>
                      </select>
                    </label>
                  ) : null}

                  <div className="form-inline">
                    <label className="field">
                      <span>Plan contratado *</span>
                      <select onChange={(event) => handlePlanChange(entry.localId, event.target.value as TimePlan['id'])} value={entry.planId}>
                        {timePlans.map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Hora de ingreso</span>
                      <input
                        onChange={(event) => updateChildEntry(entry.localId, { startedAtTime: event.target.value })}
                        type="time"
                        value={entry.startedAtTime}
                      />
                    </label>
                  </div>

                  {!isUnlimitedPlan ? (
                    <section className={`baby-free-entry ${babyApplied ? 'active' : ''}`}>
                      <label className="checkbox-option compact baby-free-toggle">
                        <input
                          checked={babyApplied}
                          disabled={babyEligibility.autoEligible}
                          onChange={(event) => updateChildEntry(entry.localId, {
                            babyFreeRequested: event.target.checked,
                            babyFreeReason: event.target.checked ? entry.babyFreeReason : '',
                          })}
                          type="checkbox"
                        />
                        <span className="baby-tag">BEBÉ</span>
                        Entrada gratuita por bebé
                      </label>
                      {babyEligibility.autoEligible ? (
                        <small className="baby-note">
                          Aplicada automáticamente por edad ({formatMonthsLabel(babyEligibility.ageMonths)}). No genera cargo del parque.
                        </small>
                      ) : entry.babyFreeRequested ? (
                        <>
                          {!babyEligibility.hasBirthDate ? (
                            <small className="field-error">No se puede determinar la edad porque falta la fecha de nacimiento. Selección manual auditada.</small>
                          ) : babyEligibility.configReady ? (
                            <small className="baby-note">El niño ({formatMonthsLabel(babyEligibility.ageMonths)}) supera la edad configurada: se aplica como excepción manual.</small>
                          ) : (
                            <small className="baby-note">Detección automática sin configurar: excepción manual auditada.</small>
                          )}
                          <label className="field">
                            <span>Motivo de la excepción *</span>
                            <input
                              onChange={(event) => updateChildEntry(entry.localId, { babyFreeReason: event.target.value })}
                              placeholder="Bebé sin documento, autorización del dueño..."
                              value={entry.babyFreeReason}
                            />
                          </label>
                        </>
                      ) : null}
                    </section>
                  ) : null}

                  {isUnlimitedPlan ? (
                    <div className="form-alert info">
                      El importe se calculara y confirmara al finalizar la visita.
                    </div>
                  ) : (
                    <section className={`promotion-adjustment ${entry.isPromotionOpen ? 'expanded' : 'collapsed'}`}>
                      <button
                        aria-expanded={entry.isPromotionOpen}
                        className="promotion-adjustment-toggle"
                        onClick={() => togglePromotionAdjustment(entry)}
                        type="button"
                      >
                        <span>
                          <strong>Aplicar descuento o monto especial</strong>
                          <small>Precio normal: {defaultAmount ? formatGuarani(defaultAmount) : 'Sin precio'}</small>
                        </span>
                        <ChevronDown size={18} />
                      </button>
                      {entry.isPromotionOpen ? (
                        <div className="promotion-adjustment-panel">
                          <label className="field">
                            <span>Tipo de ajuste</span>
                            <select
                              onChange={(event) => updateChildEntry(entry.localId, {
                                promotionType: event.target.value as PromotionAdjustmentType,
                                discountPercentage: '',
                                specialFinalAmount: '',
                              })}
                              value={entry.promotionType}
                            >
                              <option value="percentage">Porcentaje de descuento</option>
                              <option value="finalAmount">Monto final personalizado</option>
                            </select>
                          </label>
                          {entry.promotionType === 'percentage' ? (
                            <label className="field">
                              <span>Porcentaje</span>
                              <input
                                inputMode="decimal"
                                min={0}
                                max={99}
                                onChange={(event) => updateChildEntry(entry.localId, { discountPercentage: event.target.value })}
                                placeholder="Ej. 10"
                                type="number"
                                value={entry.discountPercentage}
                              />
                            </label>
                          ) : (
                            <label className="field">
                              <span>Monto final</span>
                              <input
                                inputMode="numeric"
                                min={1}
                                onChange={(event) => updateChildEntry(entry.localId, { specialFinalAmount: event.target.value })}
                                placeholder={defaultAmount ? String(defaultAmount) : 'Ej. 25000'}
                                type="number"
                                value={entry.specialFinalAmount}
                              />
                            </label>
                          )}
                          {(() => {
                            const preview = getPromotionPreview(entry, defaultAmount)
                            return (
                              <div className="promotion-preview">
                                <span>Total promocional</span>
                                <strong>{formatGuarani(preview.finalAmount)}</strong>
                                <small>Descuento: {formatGuarani(preview.discountAmount)}</small>
                              </div>
                            )
                          })()}
                          <label className="field promotion-reason">
                            <span>Motivo *</span>
                            <textarea
                              onChange={(event) => updateChildEntry(entry.localId, { promotionReason: event.target.value })}
                              placeholder="Ej. Promocion remera de Paraguay"
                              rows={2}
                              value={entry.promotionReason}
                            />
                          </label>
                          <button className="button ghost promotion-cancel" onClick={() => cancelPromotionAdjustment(entry.localId)} type="button">
                            <X size={16} />
                            Cancelar ajuste
                          </button>
                        </div>
                      ) : null}
                    </section>
                  )}

                  {!compact ? (
                    <label className="field">
                      <span>Observaciones del nino</span>
                      <textarea
                        onChange={(event) => updateChildEntry(entry.localId, { childNotes: event.target.value })}
                        placeholder="Alergias, cuidados, cumpleanos..."
                        rows={2}
                        value={entry.childNotes}
                      />
                    </label>
                  ) : null}

                  <label className="field">
                    <span>Nota interna de este ingreso</span>
                    <textarea
                      onChange={(event) => updateChildEntry(entry.localId, { notes: event.target.value })}
                      placeholder="Agregar alguna observacion..."
                      rows={compact ? 2 : 3}
                      value={entry.notes}
                    />
                  </label>
                </article>
              )
            })}
          </div>

          <div className="add-child-actions">
            <button className="button ghost" disabled={availableLinkedChildren.length === 0} onClick={() => setShowRegisteredPicker((current) => !current)} type="button">
              Seleccionar niño ya registrado
            </button>
            <button className="button ghost" onClick={addNewChild} type="button">
              <UserPlus size={17} />
              Registrar nuevo nino
            </button>
          </div>

          {showRegisteredPicker ? (
            <div className="linked-children-list linked-children-list--picker">
              {availableLinkedChildren.length === 0 ? (
                <div className="empty-state compact">No quedan niños registrados sin seleccionar.</div>
              ) : availableLinkedChildren.map((child) => (
                <button key={child.id} onClick={() => toggleExistingChild(child)} type="button">
                  <strong>{child.name}</strong>
                  <span>{child.birthDate ? formatAgeLabel(calculateAgeYears(child.birthDate)) : child.ageRange || 'Edad sin dato'}</span>
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section className="visit-form-section">
          <div className="visit-form-section-header">
            <span>3</span>
            <div>
              <strong>Pago y confirmacion</strong>
              <p>Revisa el total antes de registrar los ingresos.</p>
            </div>
          </div>

          <div className="entry-summary-panel">
            <strong>Resumen del ingreso</strong>
            {childEntries.length === 0 ? (
              <p>No hay niños seleccionados.</p>
            ) : (
              <div className="entry-summary-list">
                {childEntries.map((entry) => {
                  const plan = timePlans.find((item) => item.id === entry.planId) ?? timePlans[0]
                  const preview = getPromotionPreview(entry, plan.defaultPrice ?? null)
                  const amount = plan.isUnlimited ? 0 : preview.isApplied ? preview.finalAmount : Number(plan.defaultPrice ?? 0)
                  return (
                    <div key={entry.localId}>
                      <span>{entry.childName || 'Nino sin nombre'} - {plan.name}</span>
                      <strong>{plan.isUnlimited ? 'A definir al salir' : formatGuarani(amount)}</strong>
                    </div>
                  )
                })}
                <div className="entry-summary-total">
                  <span>Total</span>
                  <strong>{formatGuarani(totalAmount)}</strong>
                </div>
              </div>
            )}
          </div>

          <section className="payment-status-panel" aria-label="Estado de pago">
            <strong>ESTADO DE PAGO</strong>
            <div className="payment-status-options">
              <button
                className={responsibleForm.paymentStatus === 'paid' ? 'active paid' : 'paid'}
                disabled={hasUnlimitedEntry}
                onClick={() => setResponsibleField('paymentStatus', 'paid')}
                type="button"
              >
                Pagado al entrar
              </button>
              <button
                className={responsibleForm.paymentStatus === 'payAtExit' ? 'active pay-at-exit' : 'pay-at-exit'}
                onClick={() => setResponsibleField('paymentStatus', 'payAtExit')}
                type="button"
              >
                Paga al salir
              </button>
            </div>
          </section>
        </section>

        <div className="module-actions visit-entry-actions">
          {onCancel ? (
            <button className="button ghost" onClick={onCancel} type="button">
              Cancelar
            </button>
          ) : null}
          <button className="button primary action-button" disabled={isSaving || childEntries.length === 0} type="submit">
            <Plus size={18} />
            {isSaving ? 'Registrando...' : submitLabel}
          </button>
        </div>
      </form>

      {pendingPaidEntries ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card checkout-modal" role="dialog" aria-modal="true">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Cobro al ingresar</p>
                <h2>Confirmar cobro e ingreso</h2>
                <p className="muted">
                  {pendingPaidEntries.length === 1
                    ? `${pendingPaidEntries[0].childName} - Responsable: ${pendingPaidEntries[0].customerName}`
                    : `${pendingPaidEntries.length} ingresos - Responsable: ${pendingPaidEntries[0].customerName}`}
                </p>
              </div>
            </div>
            <div className="checkout-block">
              {pendingPaidEntries.map((entry) => (
                <div className="checkout-line" key={`${entry.childName}-${entry.planId}`}>
                  <span>Parque - {entry.childName}</span>
                  <strong>{formatGuarani(entry.amountCharged ?? entry.defaultAmount ?? 0)}</strong>
                </div>
              ))}
            </div>
            <div className="checkout-total">
              <span>Total a cobrar</span>
              <strong>{formatGuarani(paidModalTotal)}</strong>
            </div>
            <PaymentMethodSelector
              cardType={entryCardType}
              disabled={isSaving}
              onCardTypeChange={setEntryCardType}
              onPaymentMethodChange={setEntryPaymentMethod}
              paymentMethod={entryPaymentMethod}
            />
            <div className="module-actions">
              <button className="button ghost" disabled={isSaving} onClick={() => setPendingPaidEntries(null)} type="button">
                Cancelar
              </button>
              <button className="button primary" disabled={isSaving || !entryPaymentMethod || (entryPaymentMethod === 'card' && !entryCardType)} onClick={confirmPaidEntry} type="button">
                Confirmar cobro e ingreso
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
