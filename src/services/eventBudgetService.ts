import { PDFDocument, PDFFont, rgb, StandardFonts } from 'pdf-lib'
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { ensureReceptionSession } from './authSession'
import { createEvent } from './eventService'
import { getCollectionRef, getDocumentRef } from './firestoreCollections'
import { getCurrentUserAudit } from './userAudit'
import { formatGuarani, parseCurrencyInput } from '../utils/money'
import { formatEventTitle, formatPersonName, normalizeWhitespace, phoneDigits } from '../utils/textFormat'
import type {
  BudgetAddon,
  BudgetDecoration,
  BudgetGuestPackage,
  EventBudget,
  EventBudgetStatus,
  UpsertBudgetAddonInput,
  UpsertBudgetDecorationInput,
  UpsertBudgetGuestPackageInput,
  UpsertEventBudgetInput,
} from '../types'

const optionalText = (value?: string) => normalizeWhitespace(value ?? '')

const cleanIncludes = (includes: string[]) => includes.map(optionalText).filter(Boolean)

export const upsertBudgetGuestPackage = async (input: UpsertBudgetGuestPackageInput) => {
  await ensureReceptionSession()
  const userAudit = await getCurrentUserAudit()
  const packageRef = input.id ? getDocumentRef('budgetGuestPackages', input.id) : doc(getCollectionRef('budgetGuestPackages'))
  await setDoc(
    packageRef,
    {
      id: packageRef.id,
      name: optionalText(input.name),
      minGuests: Number(input.minGuests) || 0,
      maxGuests: Number(input.maxGuests) || 0,
      basePrice: parseCurrencyInput(input.basePrice),
      extraGuestPrice: parseCurrencyInput(input.extraGuestPrice),
      isActive: input.isActive,
      updatedAt: serverTimestamp(),
      ...(input.id ? {} : { createdAt: serverTimestamp(), createdBy: userAudit.uid, createdByName: userAudit.name }),
    },
    { merge: true },
  )
  return packageRef.id
}

export const upsertBudgetAddon = async (input: UpsertBudgetAddonInput) => {
  await ensureReceptionSession()
  const userAudit = await getCurrentUserAudit()
  const addonRef = input.id ? getDocumentRef('budgetAddons', input.id) : doc(getCollectionRef('budgetAddons'))
  await setDoc(
    addonRef,
    {
      id: addonRef.id,
      name: optionalText(input.name),
      description: optionalText(input.description),
      unitPrice: parseCurrencyInput(input.unitPrice),
      calculationType: input.calculationType,
      isActive: input.isActive,
      updatedAt: serverTimestamp(),
      ...(input.id ? {} : { createdAt: serverTimestamp(), createdBy: userAudit.uid, createdByName: userAudit.name }),
    },
    { merge: true },
  )
  return addonRef.id
}

export const upsertBudgetDecoration = async (input: UpsertBudgetDecorationInput) => {
  await ensureReceptionSession()
  const userAudit = await getCurrentUserAudit()
  const decorationRef = input.id ? getDocumentRef('budgetDecorations', input.id) : doc(getCollectionRef('budgetDecorations'))
  await setDoc(
    decorationRef,
    {
      id: decorationRef.id,
      name: optionalText(input.name),
      level: Number(input.level) || 1,
      description: optionalText(input.description),
      includes: cleanIncludes(input.includes),
      price: parseCurrencyInput(input.price),
      isActive: input.isActive,
      updatedAt: serverTimestamp(),
      ...(input.id ? {} : { createdAt: serverTimestamp(), createdBy: userAudit.uid, createdByName: userAudit.name }),
    },
    { merge: true },
  )
  return decorationRef.id
}

export const saveEventBudget = async (input: UpsertEventBudgetInput) => {
  await ensureReceptionSession()
  const userAudit = await getCurrentUserAudit()
  const budgetRef = input.id ? getDocumentRef('eventBudgets', input.id) : doc(getCollectionRef('eventBudgets'))
  const isNew = !input.id
  const payload = {
    ...input,
    id: budgetRef.id,
    childName: formatPersonName(input.childName),
    responsibleName: formatPersonName(input.responsibleName),
    responsiblePhone: phoneDigits(input.responsiblePhone ?? ''),
    notes: optionalText(input.notes),
    guestCount: Number(input.guestCount) || 0,
    extraGuestsCount: Number(input.extraGuestsCount) || 0,
    extraGuestUnitPrice: parseCurrencyInput(input.extraGuestUnitPrice),
    extraGuestsSubtotal: parseCurrencyInput(input.extraGuestsSubtotal),
    baseSubtotal: parseCurrencyInput(input.baseSubtotal),
    finalTotal: input.finalTotal === null || input.finalTotal === undefined ? null : parseCurrencyInput(input.finalTotal),
    updatedAt: serverTimestamp(),
    ...(isNew
      ? {
          createdAt: serverTimestamp(),
          createdByName: userAudit.name,
          createdByUid: userAudit.uid,
        }
      : {}),
  }
  await setDoc(budgetRef, payload, { merge: true })
  return budgetRef.id
}

export const updateEventBudgetStatus = async (budgetId: string, status: EventBudgetStatus) => {
  await ensureReceptionSession()
  const payload: Record<string, unknown> = {
    status,
    updatedAt: serverTimestamp(),
  }
  if (status === 'sent') payload.sentAt = serverTimestamp()
  if (status === 'approved') payload.approvedAt = serverTimestamp()
  await updateDoc(getDocumentRef('eventBudgets', budgetId), payload)
}

export const convertBudgetToReservation = async (budget: EventBudget, selectedDecorationId?: string) => {
  await ensureReceptionSession()
  if (budget.status !== 'approved') {
    throw new Error('Solo se pueden convertir presupuestos aprobados.')
  }
  if (!budget.tentativeEventDate || !budget.tentativeStartTime || !budget.tentativeEndTime) {
    throw new Error('Completá fecha y horario tentativos antes de convertir en reserva.')
  }
  const selectedDecoration =
    budget.decorationMode === 'alternatives'
      ? budget.decorationAlternatives.find((item) => item.id === selectedDecorationId) ?? null
      : budget.selectedDecoration ?? null
  if (budget.decorationMode === 'alternatives' && !selectedDecoration) {
    throw new Error('Seleccioná la decoración elegida antes de convertir.')
  }
  const finalTotal =
    budget.decorationMode === 'alternatives'
      ? budget.alternativeTotals.find((item) => item.decoration.id === selectedDecoration?.id)?.total ?? budget.baseSubtotal + (selectedDecoration?.price ?? 0)
      : budget.finalTotal ?? budget.baseSubtotal
  const detailLines = [
    budget.notes ? `Observaciones internas: ${budget.notes}` : '',
    budget.packageSnapshot ? `Paquete: ${budget.packageSnapshot.name}` : '',
    budget.selectedAddons.length ? `Adicionales: ${budget.selectedAddons.map((addon) => `${addon.name} x${addon.quantity}`).join(', ')}` : '',
    selectedDecoration ? `Decoración: ${selectedDecoration.name}` : '',
    `Presupuesto origen: ${budget.id}`,
  ].filter(Boolean)

  const eventId = await createEvent({
    birthdayChildName: budget.childName,
    contractedChildrenCount: budget.guestCount,
    customerName: budget.responsibleName,
    customerPhone: budget.responsiblePhone,
    date: budget.tentativeEventDate || '',
    endTime: budget.tentativeEndTime || '',
    eventType: 'birthday',
    notes: detailLines.join('\n'),
    startTime: budget.tentativeStartTime || '',
    status: 'reserved',
    title: formatEventTitle(`Cumpleaños de ${budget.childName}`),
    totalAmount: finalTotal,
  })
  await updateDoc(getDocumentRef('events', eventId), {
    sourceBudgetId: budget.id,
    budgetSnapshot: {
      packageSnapshot: budget.packageSnapshot ?? null,
      selectedAddons: budget.selectedAddons,
      selectedDecoration,
      baseSubtotal: budget.baseSubtotal,
      finalTotal,
    },
    updatedAt: serverTimestamp(),
  })
  await updateDoc(getDocumentRef('eventBudgets', budget.id), {
    convertedReservationId: eventId,
    finalTotal,
    selectedDecoration,
    status: 'converted',
    updatedAt: serverTimestamp(),
  })
  return eventId
}

const pageWidth = 595.28
const pageHeight = 841.89
const margin = 42
const orange = rgb(1, 0.35, 0.07)
const turquoise = rgb(0.03, 0.61, 0.66)
const green = rgb(0.34, 0.64, 0.06)
const black = rgb(0.08, 0.12, 0.18)
const gray = rgb(0.42, 0.47, 0.55)
const light = rgb(0.95, 0.97, 0.98)
const line = rgb(0.84, 0.87, 0.91)

type PdfFonts = { bold: PDFFont; regular: PDFFont }

const drawText = (
  page: ReturnType<PDFDocument['addPage']>,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  options: { color?: ReturnType<typeof rgb>; maxWidth?: number; align?: 'left' | 'right' | 'center' } = {},
) => {
  let value = text
  if (options.maxWidth) {
    while (value.length > 4 && font.widthOfTextAtSize(value, size) > options.maxWidth) {
      value = `${value.slice(0, -4).trim()}...`
    }
  }
  const width = font.widthOfTextAtSize(value, size)
  const alignedX = options.align === 'right' ? x - width : options.align === 'center' ? x - width / 2 : x
  page.drawText(value, { x: alignedX, y, font, size, color: options.color ?? black })
}

const wrapText = (text: string, font: PDFFont, size: number, width: number, maxLines = 3) => {
  const words = optionalText(text).split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      current = candidate
    } else {
      if (current) lines.push(current)
      current = word
    }
  })
  if (current) lines.push(current)
  return lines.slice(0, maxLines)
}

const drawWrapped = (
  page: ReturnType<PDFDocument['addPage']>,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  width: number,
  maxLines = 3,
) => {
  const lines = wrapText(text, font, size, width, maxLines)
  lines.forEach((lineText, index) => drawText(page, lineText, x, y - index * (size + 4), font, size, { color: gray }))
  return y - Math.max(1, lines.length) * (size + 4)
}

const drawBox = (page: ReturnType<PDFDocument['addPage']>, x: number, y: number, width: number, height: number, fill = rgb(1, 1, 1)) => {
  page.drawRectangle({ x, y, width, height, color: fill, borderColor: line, borderWidth: 0.8 })
}

const formatDateKey = (value?: string) => {
  if (!value) return 'A definir'
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat('es-PY', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(year, month - 1, day))
}

const loadLogo = async (doc: PDFDocument) => {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL || '/'}assets/lucca-logo-cropped.png`)
    if (!response.ok) return null
    return doc.embedPng(await response.arrayBuffer())
  } catch {
    return null
  }
}

const economicRows = (budget: EventBudget) => {
  const rows = [
    budget.packageSnapshot
      ? {
          concept: 'Paquete base',
          detail: budget.packageSnapshot.name,
          amount: budget.packageSnapshot.basePrice,
        }
      : null,
    budget.extraGuestsCount > 0
      ? {
          concept: 'Invitados adicionales',
          detail: `${budget.extraGuestsCount} x ${formatGuarani(budget.extraGuestUnitPrice)}`,
          amount: budget.extraGuestsSubtotal,
        }
      : null,
    ...budget.selectedAddons.map((addon) => ({
      concept: 'Adicional',
      detail: `${addon.name} x ${addon.quantity}`,
      amount: addon.subtotal,
    })),
  ].filter(Boolean) as Array<{ amount: number; concept: string; detail: string }>
  if (budget.decorationMode === 'selected' && budget.selectedDecoration) {
    rows.push({ amount: budget.selectedDecoration.price, concept: 'Decoración', detail: budget.selectedDecoration.name })
  }
  return rows
}

const drawTable = (
  page: ReturnType<PDFDocument['addPage']>,
  fonts: PdfFonts,
  y: number,
  rows: Array<{ amount: number; concept: string; detail: string }>,
  title: string,
) => {
  drawText(page, title, margin, y, fonts.bold, 13)
  y -= 24
  page.drawRectangle({ x: margin, y, width: pageWidth - margin * 2, height: 22, color: black })
  drawText(page, 'Concepto', margin + 10, y + 7, fonts.bold, 8.5, { color: rgb(1, 1, 1) })
  drawText(page, 'Detalle', margin + 150, y + 7, fonts.bold, 8.5, { color: rgb(1, 1, 1) })
  drawText(page, 'Monto', pageWidth - margin - 10, y + 7, fonts.bold, 8.5, { align: 'right', color: rgb(1, 1, 1) })
  y -= 22
  if (!rows.length) {
    drawBox(page, margin, y - 30, pageWidth - margin * 2, 30, light)
    drawText(page, 'Sin conceptos económicos configurados.', margin + 12, y - 18, fonts.regular, 9, { color: gray })
    return y - 40
  }
  rows.forEach((row, index) => {
    drawBox(page, margin, y - 24, pageWidth - margin * 2, 24, index % 2 ? light : rgb(1, 1, 1))
    drawText(page, row.concept, margin + 10, y - 15, fonts.regular, 8.6, { maxWidth: 126 })
    drawText(page, row.detail, margin + 150, y - 15, fonts.regular, 8.6, { maxWidth: 250 })
    drawText(page, formatGuarani(row.amount), pageWidth - margin - 10, y - 15, fonts.bold, 8.6, { align: 'right' })
    y -= 24
  })
  return y - 14
}

export const buildEventBudgetPdf = async (budget: EventBudget) => {
  const doc = await PDFDocument.create()
  const fonts = {
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    regular: await doc.embedFont(StandardFonts.Helvetica),
  }
  const logo = await loadLogo(doc)
  const page = doc.addPage([pageWidth, pageHeight])
  page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: rgb(1, 1, 1) })
  page.drawRectangle({ x: 0, y: pageHeight - 96, width: pageWidth, height: 96, color: light })
  if (logo) page.drawImage(logo, { x: margin, y: pageHeight - 86, width: 92, height: 54 })
  drawText(page, 'Presupuesto de evento', pageWidth - margin, pageHeight - 48, fonts.bold, 21, { align: 'right' })
  drawText(page, `Emitido: ${new Intl.DateTimeFormat('es-PY').format(new Date())}`, pageWidth - margin, pageHeight - 68, fonts.regular, 9.5, { align: 'right', color: gray })
  drawText(page, `Código: ${budget.id.slice(0, 8).toUpperCase()}`, pageWidth - margin, pageHeight - 84, fonts.regular, 9.5, { align: 'right', color: gray })

  let y = pageHeight - 132
  y = drawWrapped(
    page,
    `Estimado/a ${budget.responsibleName}, preparamos el siguiente presupuesto para el cumpleaños de ${budget.childName} en Lucca Park.`,
    margin,
    y,
    fonts.regular,
    12,
    pageWidth - margin * 2,
    3,
  ) - 14

  drawBox(page, margin, y - 88, pageWidth - margin * 2, 88, rgb(1, 1, 1))
  drawText(page, 'Información del evento', margin + 14, y - 22, fonts.bold, 12.5, { color: orange })
  const infoRows = [
    ['Cumpleañero/a', budget.childName],
    ['Responsable', budget.responsibleName],
    ['Fecha tentativa', formatDateKey(budget.tentativeEventDate)],
    ['Horario tentativo', `${budget.tentativeStartTime || 'A definir'} a ${budget.tentativeEndTime || 'A definir'}`],
    ['Invitados estimados', `${budget.guestCount || 0} niños`],
  ]
  infoRows.forEach(([label, value], index) => {
    const x = margin + 14 + (index % 2) * 248
    const rowY = y - 42 - Math.floor(index / 2) * 22
    drawText(page, label, x, rowY, fonts.bold, 8, { color: gray })
    drawText(page, value, x + 88, rowY, fonts.regular, 9, { maxWidth: 150 })
  })
  y -= 116

  y = drawTable(page, fonts, y, economicRows(budget), budget.decorationMode === 'alternatives' ? 'Conceptos base' : 'Detalle económico')

  if (budget.decorationMode === 'alternatives') {
    drawText(page, 'Subtotal sin decoración', pageWidth - margin, y, fonts.bold, 13, { align: 'right' })
    drawText(page, formatGuarani(budget.baseSubtotal), pageWidth - margin, y - 18, fonts.bold, 16, { align: 'right', color: turquoise })
    y -= 54
    drawText(page, 'Elegí tu opción de decoración', margin, y, fonts.bold, 13, { color: orange })
    y -= 18
    budget.alternativeTotals.forEach((item) => {
      drawBox(page, margin, y - 70, pageWidth - margin * 2, 62, rgb(1, 1, 1))
      drawText(page, item.decoration.name, margin + 12, y - 26, fonts.bold, 10.5)
      drawWrapped(page, item.decoration.description || item.decoration.includes.join(', '), margin + 12, y - 42, fonts.regular, 8.2, 330, 2)
      drawText(page, `Decoración: ${formatGuarani(item.decoration.price)}`, pageWidth - margin - 12, y - 30, fonts.regular, 8.5, { align: 'right', color: gray })
      drawText(page, `Total: ${formatGuarani(item.total)}`, pageWidth - margin - 12, y - 50, fonts.bold, 12, { align: 'right', color: green })
      y -= 74
    })
  } else {
    drawText(page, 'Total estimado', pageWidth - margin, y, fonts.bold, 13, { align: 'right' })
    drawText(page, formatGuarani(budget.finalTotal ?? budget.baseSubtotal), pageWidth - margin, y - 22, fonts.bold, 20, { align: 'right', color: green })
    y -= 62
  }

  if (y < 170) y = 170
  drawBox(page, margin, y - 88, pageWidth - margin * 2, 78, light)
  drawText(page, 'Condiciones comerciales', margin + 14, y - 30, fonts.bold, 11.5, { color: orange })
  ;[
    'Presupuesto sujeto a disponibilidad de fecha y horario.',
    'La reserva se confirma mediante el pago de una seña.',
    'Los valores indicados tienen una validez de 7 días.',
    'Los servicios adicionales están sujetos a disponibilidad.',
  ].forEach((text, index) => drawText(page, `• ${text}`, margin + 18, y - 48 - index * 11, fonts.regular, 8.5, { color: gray }))

  drawText(page, 'Será un gusto acompañar este momento especial en Lucca Park.', pageWidth / 2, 54, fonts.bold, 11, { align: 'center', color: turquoise })
  drawText(page, 'Página 1 de 1', pageWidth / 2, 28, fonts.regular, 8, { align: 'center', color: gray })
  return doc.save()
}

export const downloadEventBudgetPdf = async (budget: EventBudget) => {
  const bytes = await buildEventBudgetPdf(budget)
  const pdfBytes = new Uint8Array(bytes)
  const blob = new Blob([pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength)], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `presupuesto-lucca-park-${budget.childName.replace(/\s+/g, '-').toLocaleLowerCase('es-PY')}-${budget.id.slice(0, 8)}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export const packageSnapshotFromConfig = (item: BudgetGuestPackage) => ({
  basePrice: item.basePrice,
  extraGuestPrice: item.extraGuestPrice,
  id: item.id,
  maxGuests: item.maxGuests,
  minGuests: item.minGuests,
  name: item.name,
})

export const addonSnapshotFromConfig = (item: BudgetAddon, quantity: number) => ({
  calculationType: item.calculationType,
  description: item.description,
  id: item.id,
  name: item.name,
  quantity,
  subtotal: item.unitPrice * quantity,
  unitPrice: item.unitPrice,
})

export const decorationSnapshotFromConfig = (item: BudgetDecoration) => ({
  description: item.description,
  id: item.id,
  includes: item.includes,
  level: item.level,
  name: item.name,
  price: item.price,
})
