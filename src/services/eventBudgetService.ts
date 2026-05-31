import { PDFDocument, PDFFont, rgb, StandardFonts } from 'pdf-lib'
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL, getBytes, deleteObject } from 'firebase/storage'
import { storage } from '../config/firebase'
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
      category: input.category ?? '',
      level: Number(input.level) || 1,
      description: optionalText(input.description),
      includes: cleanIncludes(input.includes),
      price: parseCurrencyInput(input.price),
      imageUrl: input.imageUrl ?? '',
      isActive: input.isActive,
      updatedAt: serverTimestamp(),
      ...(input.id ? {} : { createdAt: serverTimestamp(), createdBy: userAudit.uid, createdByName: userAudit.name }),
    },
    { merge: true },
  )
  return decorationRef.id
}

export const uploadDecorationImage = async (file: File, decorationId: string): Promise<string> => {
  const ext = file.name.split('.').pop() ?? 'jpg'
  const imageRef = storageRef(storage, `decoration-images/${decorationId}/main.${ext}`)
  await uploadBytes(imageRef, file, { contentType: file.type })
  return getDownloadURL(imageRef)
}

const getFirebaseStoragePathFromUrl = (url: string) => {
  const trimmedUrl = url.trim()
  if (!trimmedUrl) return null
  if (trimmedUrl.startsWith('gs://')) {
    return decodeURIComponent(trimmedUrl.replace(/^gs:\/\/[^/]+\//, ''))
  }
  try {
    const parsed = new URL(trimmedUrl)
    const marker = '/o/'
    const markerIndex = parsed.pathname.indexOf(marker)
    if (markerIndex < 0) return null
    const decodedPath = decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length))
    return decodedPath || null
  } catch {
    return null
  }
}

const getDecorationImageRef = (imageUrl?: string) => {
  if (!imageUrl) return null
  const path = getFirebaseStoragePathFromUrl(imageUrl)
  if (!path || !path.startsWith('decoration-images/')) return null
  return storageRef(storage, path)
}

export const deleteBudgetDecoration = async (decoration: Pick<BudgetDecoration, 'id' | 'imageUrl'>) => {
  await ensureReceptionSession()
  await deleteDoc(getDocumentRef('budgetDecorations', decoration.id))
  const imageRef = getDecorationImageRef(decoration.imageUrl)
  if (!imageRef) return { imageDeleteFailed: false }
  try {
    await deleteObject(imageRef)
    return { imageDeleteFailed: false }
  } catch {
    return { imageDeleteFailed: true }
  }
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


const formatDateKey = (value?: string) => {
  if (!value) return 'A definir'
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat('es-PY', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(year, month - 1, day))
}

const loadLogo = async (doc: PDFDocument) => {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL || '/'}assets/lucca-logo-transparent.png`)
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
) => {
  const tableW = pageWidth - margin * 2
  const headerH = 28
  const rowH = 36
  const colConcept = 148
  const colDetail = tableW - colConcept - 118

  page.drawRectangle({ x: margin, y, width: tableW, height: headerH, color: orange })
  drawText(page, 'Concepto', margin + 12, y + 9, fonts.bold, 9, { color: rgb(1, 1, 1) })
  drawText(page, 'Detalle', margin + colConcept + 10, y + 9, fonts.bold, 9, { color: rgb(1, 1, 1) })
  drawText(page, 'Monto', pageWidth - margin - 12, y + 9, fonts.bold, 9, { align: 'right', color: rgb(1, 1, 1) })
  y -= headerH

  if (!rows.length) {
    page.drawRectangle({ x: margin, y: y - 36, width: tableW, height: 36, color: light, borderColor: line, borderWidth: 0.6 })
    drawText(page, 'Sin conceptos económicos configurados.', margin + 12, y - 22, fonts.regular, 9, { color: gray })
    return y - 46
  }

  rows.forEach((row, index) => {
    const bg = index % 2 === 0 ? rgb(1, 1, 1) : rgb(0.984, 0.988, 0.994)
    page.drawRectangle({ x: margin, y: y - rowH, width: tableW, height: rowH, color: bg })
    page.drawLine({ start: { x: margin, y: y - rowH }, end: { x: margin + tableW, y: y - rowH }, color: line, thickness: 0.5 })
    drawText(page, row.concept, margin + 12, y - rowH + 13, fonts.bold, 9, { maxWidth: colConcept - 20 })
    drawText(page, row.detail, margin + colConcept + 10, y - rowH + 13, fonts.regular, 9, { maxWidth: colDetail - 10, color: black })
    drawText(page, formatGuarani(row.amount), pageWidth - margin - 12, y - rowH + 13, fonts.bold, 9, { align: 'right' })
    y -= rowH
  })

  return y - 8
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

  // ENCABEZADO
  if (logo) page.drawImage(logo, { x: margin, y: pageHeight - 90, width: 110, height: 68 })
  page.drawLine({ start: { x: margin + 124, y: pageHeight - 26 }, end: { x: margin + 124, y: pageHeight - 98 }, color: orange, thickness: 1.3 })
  drawText(page, 'Presupuesto de evento', pageWidth - margin, pageHeight - 44, fonts.bold, 22, { align: 'right' })
  drawText(page, `Emitido: ${new Intl.DateTimeFormat('es-PY').format(new Date())}`, pageWidth - margin, pageHeight - 68, fonts.regular, 9.5, { align: 'right', color: gray })
  drawText(page, `Código: ${budget.id.slice(0, 8).toUpperCase()}`, pageWidth - margin, pageHeight - 84, fonts.regular, 9.5, { align: 'right', color: gray })
  page.drawLine({ start: { x: margin, y: pageHeight - 110 }, end: { x: pageWidth - margin, y: pageHeight - 110 }, color: line, thickness: 0.8 })

  // INTRODUCCIÓN
  let y = pageHeight - 130
  const introLines = wrapText(
    `Estimado/a ${budget.responsibleName}, preparamos el siguiente presupuesto para el cumpleaños de ${budget.childName} en Lucca Park.`,
    fonts.regular, 11, pageWidth - margin * 2, 3,
  )
  introLines.forEach((ln, i) => drawText(page, ln, margin, y - i * 16, fonts.regular, 11, { color: black }))
  y -= introLines.length * 16 + 18
  page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, color: line, thickness: 0.8 })
  y -= 20

  // FICHA DE EVENTO
  const infoItems = [
    { label: 'Cumpleañero/a', value: budget.childName },
    { label: 'Responsable', value: budget.responsibleName },
    { label: 'Fecha tentativa', value: formatDateKey(budget.tentativeEventDate) },
    { label: 'Horario tentativo', value: `${budget.tentativeStartTime || 'A definir'} a ${budget.tentativeEndTime || 'A definir'}` },
    { label: 'Invitados estimados', value: `${budget.guestCount || 0} niños` },
  ]
  const INFO_ROW_H = 48
  const INFO_COL_W = (pageWidth - margin * 2) / 2
  const infoRowCount = Math.ceil(infoItems.length / 2)
  const infoTotalH = infoRowCount * INFO_ROW_H

  page.drawRectangle({ x: margin, y: y - infoTotalH, width: pageWidth - margin * 2, height: infoTotalH, color: rgb(1, 1, 1), borderColor: line, borderWidth: 0.8 })
  for (let r = 1; r < infoRowCount; r++) {
    page.drawLine({ start: { x: margin, y: y - r * INFO_ROW_H }, end: { x: pageWidth - margin, y: y - r * INFO_ROW_H }, color: line, thickness: 0.6 })
  }
  page.drawLine({ start: { x: margin + INFO_COL_W, y }, end: { x: margin + INFO_COL_W, y: y - infoTotalH }, color: line, thickness: 0.6 })

  infoItems.forEach((item, idx) => {
    const col = idx % 2
    const row = Math.floor(idx / 2)
    const itemX = margin + col * INFO_COL_W
    const centerY = y - row * INFO_ROW_H - INFO_ROW_H / 2
    page.drawCircle({ x: itemX + 22, y: centerY, size: 9, color: rgb(1, 0.93, 0.88), borderColor: orange, borderWidth: 0.9 })
    drawText(page, item.label, itemX + 38, centerY + 9, fonts.regular, 7.5, { color: gray })
    drawText(page, item.value, itemX + 38, centerY - 5, fonts.bold, 10.5, { color: black, maxWidth: INFO_COL_W - 55 })
  })
  y -= infoTotalH + 22

  // TABLA DE CONCEPTOS
  y = drawTable(page, fonts, y, economicRows(budget))

  // TOTAL O ALTERNATIVAS DE DECORACIÓN
  if (budget.decorationMode === 'alternatives') {
    drawText(page, 'Subtotal sin decoración', pageWidth - margin, y, fonts.bold, 11, { align: 'right', color: gray })
    drawText(page, formatGuarani(budget.baseSubtotal), pageWidth - margin, y - 18, fonts.bold, 16, { align: 'right', color: orange })
    y -= 52
    drawText(page, 'Elegí tu opción de decoración', margin, y, fonts.bold, 12, { color: orange })
    y -= 16
    budget.alternativeTotals.forEach((item) => {
      page.drawRectangle({ x: margin, y: y - 68, width: pageWidth - margin * 2, height: 60, color: rgb(1, 1, 1), borderColor: line, borderWidth: 0.8 })
      drawText(page, item.decoration.name, margin + 12, y - 24, fonts.bold, 10.5)
      drawWrapped(page, item.decoration.description || item.decoration.includes.join(', '), margin + 12, y - 40, fonts.regular, 8.2, 330, 2)
      drawText(page, `Decoración: ${formatGuarani(item.decoration.price)}`, pageWidth - margin - 12, y - 30, fonts.regular, 8.5, { align: 'right', color: gray })
      drawText(page, `Total: ${formatGuarani(item.total)}`, pageWidth - margin - 12, y - 50, fonts.bold, 12, { align: 'right', color: orange })
      y -= 74
    })
  } else {
    y -= 14
    drawText(page, 'Total estimado', pageWidth - margin, y, fonts.bold, 10.5, { align: 'right', color: gray })
    y -= 12
    const totalBoxW = 210
    const totalBoxH = 44
    page.drawRectangle({ x: pageWidth - margin - totalBoxW, y: y - totalBoxH, width: totalBoxW, height: totalBoxH, color: rgb(1, 1, 1), borderColor: orange, borderWidth: 1.5 })
    drawText(page, formatGuarani(budget.finalTotal ?? budget.baseSubtotal), pageWidth - margin - 14, y - totalBoxH / 2 - 9, fonts.bold, 20, { align: 'right', color: orange })
    y -= totalBoxH + 12
  }

  // PIE
  page.drawLine({ start: { x: margin, y: 42 }, end: { x: pageWidth - margin, y: 42 }, color: orange, thickness: 1.3 })
  if (logo) page.drawImage(logo, { x: pageWidth / 2 - 28, y: 8, width: 56, height: 30, opacity: 0.4 })

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
  category: item.category,
  description: item.description,
  id: item.id,
  imageUrl: item.imageUrl,
  includes: item.includes,
  level: item.level,
  name: item.name,
  price: item.price,
})

const canvasToPng = (blobUrl: string): Promise<Uint8Array | null> =>
  new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const maxDim = 1400
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight, 1))
        canvas.width = Math.round(img.naturalWidth * scale)
        canvas.height = Math.round(img.naturalHeight * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) { resolve(null); return }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(
          (blob) => {
            if (!blob) { resolve(null); return }
            blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf))).catch(() => resolve(null))
          },
          'image/png',
        )
      } catch { resolve(null) }
    }
    img.onerror = () => resolve(null)
    img.src = blobUrl
  })

const embedBytesInPdf = async (docInstance: PDFDocument, bytes: ArrayBuffer, mimeHint = '') => {
  const h = new Uint8Array(bytes, 0, 4)
  const isPng = h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47
  const isJpg = h[0] === 0xff && h[1] === 0xd8
  const normalizedMimeHint = mimeHint.toLowerCase()
  if (isPng || normalizedMimeHint.includes('png')) {
    try { return await docInstance.embedPng(bytes) } catch {}
  }
  if (isJpg || normalizedMimeHint.includes('jpeg') || normalizedMimeHint.includes('jpg')) {
    try { return await docInstance.embedJpg(bytes) } catch {}
  }
  // WebP u otro: convertir a PNG via canvas con blobUrl (mismo origen, sin CORS)
  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mimeHint || 'image/webp' }))
  try {
    const png = await canvasToPng(blobUrl)
    if (png) return await docInstance.embedPng(png)
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
  return null
}

const fetchImageForPdf = async (docInstance: PDFDocument, url: string) => {
  // Para URLs de Firebase Storage: usar SDK (usa Firebase Auth, evita CORS del browser)
  const imageRef = getDecorationImageRef(url)
  if (imageRef) {
    try {
      const bytes = await getBytes(imageRef)
      const result = await embedBytesInPdf(docInstance, bytes)
      if (result) return result
    } catch { /* fallback a fetch */ }
  }
  // Fallback: fetch directo + blobUrl para canvas (para URLs no-Firebase o si SDK falló)
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const bytes = await response.arrayBuffer()
    const ct = response.headers.get('content-type') ?? ''
    return await embedBytesInPdf(docInstance, bytes, ct)
  } catch { return null }
}

export const buildDecorationCatalogPdf = async (decorations: BudgetDecoration[]) => {
  const doc = await PDFDocument.create()
  const fonts: PdfFonts = {
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    regular: await doc.embedFont(StandardFonts.Helvetica),
  }
  const logo = await loadLogo(doc)
  const selected = decorations.slice(0, 3)
  const images = await Promise.all(
    selected.map((d) => d.imageUrl ? fetchImageForPdf(doc, d.imageUrl) : Promise.resolve(null)),
  )

  const BLOCK_H = 190
  const BLOCK_GAP = 12
  const headerH = 152
  const footerY = 42

  let page = doc.addPage([pageWidth, pageHeight])
  page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: rgb(1, 1, 1) })

  // ENCABEZADO
  if (logo) page.drawImage(logo, { x: pageWidth / 2 - 55, y: pageHeight - 84, width: 110, height: 68 })
  const titleY = pageHeight - 104
  drawText(page, 'Opciones de decoración', pageWidth / 2, titleY, fonts.bold, 20, { align: 'center', color: black })
  page.drawLine({ start: { x: margin, y: titleY + 6 }, end: { x: 96, y: titleY + 6 }, color: orange, thickness: 1.2 })
  page.drawLine({ start: { x: pageWidth - 96, y: titleY + 6 }, end: { x: pageWidth - margin, y: titleY + 6 }, color: orange, thickness: 1.2 })
  drawText(page, 'Elegí la opción ideal para tu evento', pageWidth / 2, pageHeight - 122, fonts.regular, 10.5, { align: 'center', color: gray })
  page.drawLine({ start: { x: margin, y: pageHeight - headerH }, end: { x: pageWidth - margin, y: pageHeight - headerH }, color: line, thickness: 0.8 })

  let y = pageHeight - headerH - 8

  for (let idx = 0; idx < selected.length; idx++) {
    const decoration = selected[idx]
    const image = images[idx]

    if (idx > 0 && y - BLOCK_H < footerY + 8) {
      page.drawLine({ start: { x: margin, y: footerY }, end: { x: pageWidth - margin, y: footerY }, color: orange, thickness: 1.3 })
      if (logo) page.drawImage(logo, { x: pageWidth / 2 - 28, y: 8, width: 56, height: 30, opacity: 0.4 })
      page = doc.addPage([pageWidth, pageHeight])
      page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: rgb(1, 1, 1) })
      y = pageHeight - 40
    }

    const blockBottom = y - BLOCK_H
    page.drawRectangle({ x: margin, y: blockBottom, width: pageWidth - margin * 2, height: BLOCK_H, color: rgb(1, 1, 1), borderColor: line, borderWidth: 0.8 })

    const imgW = 200
    const imgH = BLOCK_H - 16
    if (image) {
      page.drawImage(image, { x: margin + 8, y: blockBottom + 8, width: imgW, height: imgH })
    } else {
      page.drawRectangle({ x: margin + 8, y: blockBottom + 8, width: imgW, height: imgH, color: light })
      drawText(page, 'Sin imagen', margin + 8 + imgW / 2, blockBottom + 8 + imgH / 2 - 4, fonts.regular, 8, { align: 'center', color: gray })
    }
    page.drawLine({ start: { x: margin + imgW + 12, y: y - 12 }, end: { x: margin + imgW + 12, y: blockBottom + 12 }, color: line, thickness: 0.6 })

    const textX = margin + imgW + 20
    const contentW = pageWidth - margin - textX - 12
    let textY = y - 18

    drawText(page, decoration.name, textX, textY, fonts.bold, 13, { color: black, maxWidth: contentW })
    textY -= 15

    const catLevel = [decoration.category || '', `Nivel ${decoration.level}`].filter(Boolean).join(' · ')
    drawText(page, catLevel, textX, textY, fonts.regular, 8.5, { color: gray })
    textY -= 12

    page.drawLine({ start: { x: textX, y: textY }, end: { x: pageWidth - margin - 12, y: textY }, color: line, thickness: 0.5 })
    textY -= 12

    if (decoration.description) {
      const descLines = wrapText(decoration.description, fonts.regular, 8.5, contentW, 2)
      descLines.forEach((ln, i) => drawText(page, ln, textX, textY - i * 12, fonts.regular, 8.5, { color: black }))
      textY -= descLines.length * 12 + 6
    }

    if (decoration.includes.length > 0) {
      drawText(page, 'Incluye:', textX, textY, fonts.bold, 8.5, { color: orange })
      textY -= 12
      const maxItems = Math.min(decoration.includes.length, 4)
      for (let i = 0; i < maxItems; i++) {
        drawText(page, `• ${decoration.includes[i]}`, textX, textY, fonts.regular, 8, { color: black, maxWidth: contentW })
        textY -= 11
      }
      if (decoration.includes.length > maxItems) {
        drawText(page, `+ ${decoration.includes.length - maxItems} más…`, textX, textY, fonts.regular, 7.5, { color: gray })
      }
    }

    const priceBoxW = 152
    const priceBoxH = 30
    page.drawRectangle({ x: pageWidth - margin - priceBoxW - 8, y: blockBottom + 10, width: priceBoxW, height: priceBoxH, color: rgb(1, 1, 1), borderColor: orange, borderWidth: 1.3 })
    drawText(page, formatGuarani(decoration.price), pageWidth - margin - 18, blockBottom + 10 + priceBoxH / 2 - 8, fonts.bold, 13, { align: 'right', color: orange })

    y = blockBottom - BLOCK_GAP
  }

  page.drawLine({ start: { x: margin, y: footerY }, end: { x: pageWidth - margin, y: footerY }, color: orange, thickness: 1.3 })
  if (logo) page.drawImage(logo, { x: pageWidth / 2 - 28, y: 8, width: 56, height: 30, opacity: 0.4 })

  return doc.save()
}

export const downloadDecorationCatalogPdf = async (decorations: BudgetDecoration[]) => {
  const bytes = await buildDecorationCatalogPdf(decorations)
  const pdfBytes = new Uint8Array(bytes)
  const blob = new Blob([pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength)], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `catalogo-decoracion-lucca-park-${new Date().toISOString().slice(0, 10)}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
