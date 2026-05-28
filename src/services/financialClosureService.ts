import { PDFDocument, PDFImage, PDFPage, PDFFont, StandardFonts, rgb } from 'pdf-lib'
import { Timestamp, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { auth, storage } from '../config/firebase'
import { ensureReceptionSession } from './authSession'
import { getCollectionRef } from './firestoreCollections'
import { getCurrentUserAudit } from './userAudit'
import { getEventPaidAmount, getEventPendingAmount } from '../utils/eventFinance'
import type { ActiveVisit, CanteenOrder, ExpenseRecord, FinancialClosureRecord, LuccaEvent, PaymentRecord } from '../types'

interface ClosurePdfInput {
  canteenOrders?: CanteenOrder[]
  dateFrom: string
  dateTo: string
  events?: LuccaEvent[]
  expenses: ExpenseRecord[]
  generatedBy?: string
  methodTotals: Record<string, number>
  payments: PaymentRecord[]
  pendingAmount: number
  pendingEvents?: LuccaEvent[]
  pendingOrders?: CanteenOrder[]
  pendingVisits?: ActiveVisit[]
  totals: {
    canteenCollected: number
    eventCollected: number
    netResult: number
    parkCollected: number
    totalCollected: number
    totalExpenses: number
  }
  visits?: ActiveVisit[]
}

export const generateAndSaveFinancialClosure = async (input: ClosurePdfInput): Promise<FinancialClosureRecord> => {
  await ensureReceptionSession()
  const userAudit = await getCurrentUserAudit()
  const userId = userAudit.uid
  const closureRef = doc(getCollectionRef('financialClosures'))
  const now = new Date()
  const pdfBytes = await buildPremiumPdf(input, now)
  const fileName = `cierre-financiero-lucca-park-${input.dateFrom}-a-${input.dateTo}.pdf`
  const storageRef = ref(storage, `financial-closures/${closureRef.id}/${fileName}`)
  await uploadBytes(storageRef, pdfBytes, { contentType: 'application/pdf' })
  const pdfUrl = await getDownloadURL(storageRef)

  const payload = {
    id: closureRef.id,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    generatedAt: Timestamp.fromDate(now),
    generatedBy: userId,
    generatedByName: userAudit.name,
    totalCollected: input.totals.totalCollected,
    totalExpenses: input.totals.totalExpenses,
    netResult: input.totals.netResult,
    pendingAmount: input.pendingAmount,
    pdfUrl,
    totalsSnapshot: {
      methodTotals: input.methodTotals,
      totals: input.totals,
      paymentsCount: input.payments.length,
      expensesCount: input.expenses.length,
      canteenOrdersCount: input.canteenOrders?.length ?? 0,
      eventsCount: input.events?.length ?? 0,
    },
    createdAt: serverTimestamp(),
  }
  await setDoc(closureRef, payload)

  return {
    ...payload,
    generatedAt: now,
  }
}

type Fonts = {
  bold: PDFFont
  regular: PDFFont
}

type PdfContext = {
  doc: PDFDocument
  fonts: Fonts
  logo?: PDFImage
  pages: PDFPage[]
}

type TableColumn<T> = {
  align?: 'left' | 'center' | 'right'
  header: string
  render: (row: T) => string
  width: number
}

const pageWidth = 595.28
const pageHeight = 841.89
const marginX = 32
const contentTop = 712
const black = rgb(0.07, 0.08, 0.09)
const darkGray = rgb(0.18, 0.19, 0.2)
const midGray = rgb(0.62, 0.64, 0.66)
const lineGray = rgb(0.78, 0.8, 0.82)
const lightGray = rgb(0.94, 0.95, 0.96)
const softGray = rgb(0.97, 0.97, 0.98)

const money = (value: number) => `Gs. ${Math.round(value || 0).toLocaleString('es-PY')}`
const percent = (value: number) => (Number.isFinite(value) ? `${Math.round(value)}%` : '-')
const safe = (value: unknown, fallback = '-') => {
  const text = String(value ?? '').trim()
  return text || fallback
}
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const formatDateKey = (value: string) => {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : safe(value)
}
const formatDate = (date?: Date | null) => (date ? date.toLocaleDateString('es-PY') : '-')
const formatDateTime = (date?: Date | null) =>
  date
    ? `${date.toLocaleDateString('es-PY')} - ${date.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}`
    : '-'

const methodLabel = (payment: Pick<PaymentRecord | ExpenseRecord, 'paymentMethod' | 'cardType'>) => {
  if (payment.paymentMethod === 'card' && payment.cardType === 'debit') return 'Tarjeta débito'
  if (payment.paymentMethod === 'card' && payment.cardType === 'credit') return 'Tarjeta crédito'
  if (payment.paymentMethod === 'cash') return 'Efectivo'
  if (payment.paymentMethod === 'transfer') return 'Transferencia'
  if (payment.paymentMethod === 'qr') return 'QR'
  if (payment.paymentMethod === 'other') return 'Otro'
  return 'Sin método registrado'
}

const moduleLabel = (payment: PaymentRecord) => {
  if (payment.source === 'canteen' || payment.concepts === 'canteen') return 'Cantina'
  if (payment.source === 'event_payment' || payment.concepts === 'event') return 'Eventos'
  if (payment.source === 'reception_entry' || payment.source === 'reception_exit') return 'Recepción'
  if (payment.concepts === 'park') return 'Parque'
  return 'Anterior'
}

const expenseCategoryLabel = (category: ExpenseRecord['category']) =>
  ({
    canteen_purchase: 'Cantina / productos',
    cleaning: 'Limpieza',
    decoration: 'DecoraciÃ³n',
    maintenance: 'Mantenimiento',
    operations: 'Compra operativa',
    other: 'Otro',
    services: 'Servicios',
    wages: 'Sueldos / jornales',
  })[category] ?? safe(category)

const fitText = (text: string, font: PDFFont, size: number, maxWidth: number) => {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  let fitted = text
  while (fitted.length > 3 && font.widthOfTextAtSize(`${fitted}...`, size) > maxWidth) fitted = fitted.slice(0, -1)
  return `${fitted.trim()}...`
}

const wrapText = (text: string, font: PDFFont, size: number, maxWidth: number, maxLines = 3) => {
  const words = safe(text, '').split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate
      return
    }
    if (line) lines.push(line)
    line = word
  })
  if (line) lines.push(line)
  if (lines.length <= maxLines) return lines
  return [...lines.slice(0, maxLines - 1), fitText(lines.slice(maxLines - 1).join(' '), font, size, maxWidth)]
}

const drawText = (page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, options: { color?: ReturnType<typeof rgb>; maxWidth?: number; align?: 'left' | 'center' | 'right' } = {}) => {
  const value = options.maxWidth ? fitText(text, font, size, options.maxWidth) : text
  const width = font.widthOfTextAtSize(value, size)
  const alignedX = options.align === 'right' ? x - width : options.align === 'center' ? x - width / 2 : x
  page.drawText(value, { x: alignedX, y, size, font, color: options.color ?? black })
}

const drawFittedText = (page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, maxWidth: number, options: { align?: 'left' | 'center' | 'right'; minSize?: number } = {}) => {
  let nextSize = size
  const minSize = options.minSize ?? 8
  while (nextSize > minSize && font.widthOfTextAtSize(text, nextSize) > maxWidth) nextSize -= 0.6
  const width = font.widthOfTextAtSize(text, nextSize)
  const alignedX = options.align === 'right' ? x - width : options.align === 'center' ? x - width / 2 : x
  page.drawText(text, { x: alignedX, y, size: nextSize, font, color: black })
}

const drawRoundedBox = (page: PDFPage, x: number, y: number, width: number, height: number, options: { fill?: ReturnType<typeof rgb>; border?: ReturnType<typeof rgb>; borderWidth?: number } = {}) => {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: options.fill,
    borderColor: options.border ?? lineGray,
    borderWidth: options.borderWidth ?? 0.7,
  })
}

const drawSectionTitleAt = (page: PDFPage, fonts: Fonts, icon: string, title: string, x: number, y: number, width = pageWidth - marginX * 2) => {
  page.drawCircle({ x: x + 13, y: y + 8, size: 12, borderColor: black, borderWidth: 1.1 })
  drawText(page, icon, x + 13, y + 3.2, fonts.bold, 9, { align: 'center' })
  drawFittedText(page, title.toUpperCase(), x + 34, y + 1, fonts.bold, 15, width - 34, { minSize: 11 })
}

const drawSectionTitle = (page: PDFPage, fonts: Fonts, icon: string, title: string, y: number) => {
  drawSectionTitleAt(page, fonts, icon, title, marginX, y)
}

const drawMetricCard = (page: PDFPage, fonts: Fonts, x: number, y: number, width: number, height: number, label: string, value: string, icon: string, detail?: string) => {
  drawRoundedBox(page, x, y, width, height, { fill: rgb(1, 1, 1), border: lineGray, borderWidth: 0.8 })
  if (height < 64) {
    page.drawCircle({ x: x + 28, y: y + height - 18, size: 14, color: lightGray })
    drawText(page, icon, x + 28, y + height - 22, fonts.bold, 9.8, { align: 'center' })
    drawFittedText(page, label, x + 50, y + height - 22, fonts.regular, 8.1, width - 58, { minSize: 6.6 })
    drawFittedText(page, value, x + 14, y + 10, fonts.bold, 15, width - 28, { minSize: 9 })
    return
  }
  page.drawCircle({ x: x + 25, y: y + height - 26, size: 16, color: lightGray })
  drawText(page, icon, x + 25, y + height - 31, fonts.bold, 11, { align: 'center' })
  drawFittedText(page, label, x + 48, y + height - 29, fonts.regular, 8.4, width - 56, { minSize: 6.7 })
  drawFittedText(page, value, x + 14, detail ? y + 30 : y + 14, fonts.bold, detail ? 15.5 : 16.8, width - 28, { minSize: 9.5 })
  if (detail) {
    page.drawLine({ start: { x: x + 14, y: y + 24 }, end: { x: x + width - 14, y: y + 24 }, color: lineGray, thickness: 0.6 })
    drawText(page, detail, x + width / 2, y + 10, fonts.regular, 8, { align: 'center', color: darkGray, maxWidth: width - 20 })
  }
}

type SummaryRowInput = {
  label: string
  note?: string
  value: string
}

const drawSummaryRow = (
  page: PDFPage,
  fonts: Fonts,
  x: number,
  y: number,
  width: number,
  row: SummaryRowInput,
  options: { accent?: ReturnType<typeof rgb>; compact?: boolean; height?: number; valueSize?: number } = {},
) => {
  const compact = options.compact ?? width < 190
  const height = options.height ?? (compact ? 42 : 34)
  const accent = options.accent ?? black
  drawRoundedBox(page, x, y, width, height, { fill: rgb(1, 1, 1), border: lineGray, borderWidth: 0.75 })
  page.drawRectangle({ x, y, width: 4, height, color: accent })
  if (compact) {
    drawText(page, row.label, x + 12, y + height - 13.2, fonts.regular, 7.6, { color: darkGray, maxWidth: width - 20 })
    drawFittedText(page, row.value, x + 12, y + (row.note ? 16.2 : 12.2), fonts.bold, options.valueSize ?? 12.4, width - 20, { minSize: 8.4 })
    if (row.note) {
      drawText(page, row.note, x + 12, y + 4.6, fonts.regular, 6.9, { color: midGray, maxWidth: width - 20 })
    }
    return
  }
  drawText(page, row.label, x + 14, y + height - 13.2, fonts.regular, 8.4, { color: darkGray, maxWidth: width - 130 })
  drawFittedText(page, row.value, x + width - 14, y + 10.5, fonts.bold, options.valueSize ?? 13.5, width - 170, { align: 'right', minSize: 9.2 })
  if (row.note) {
    drawText(page, row.note, x + 14, y + 7.4, fonts.regular, 7.7, { color: midGray, maxWidth: width - 122 })
  }
}

const drawSummaryGrid = (
  page: PDFPage,
  fonts: Fonts,
  rows: SummaryRowInput[],
  x: number,
  y: number,
  width: number,
  columns: number,
  options: { gapX?: number; gapY?: number; height?: number; valueSize?: number; accent?: ReturnType<typeof rgb>; compact?: boolean } = {},
) => {
  const gapX = options.gapX ?? 12
  const gapY = options.gapY ?? 8
  const height = options.height ?? 34
  const colWidth = (width - gapX * (columns - 1)) / columns
  const rowCount = Math.ceil(rows.length / columns)

  rows.forEach((row, index) => {
    const col = index % columns
    const rowIndex = Math.floor(index / columns)
    const rowX = x + col * (colWidth + gapX)
    const rowY = y - rowIndex * (height + gapY)
    drawSummaryRow(page, fonts, rowX, rowY, colWidth, row, options)
  })

  return y - rowCount * height - Math.max(0, rowCount - 1) * gapY
}

const drawDataTable = <T,>(page: PDFPage, fonts: Fonts, x: number, y: number, columns: TableColumn<T>[], rows: T[], options: { rowHeight?: number; fontSize?: number; emptyText?: string } = {}) => {
  const rowHeight = options.rowHeight ?? 18
  const fontSize = options.fontSize ?? 8.2
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0)
  const headerHeight = 18

  if (rows.length === 0) {
    drawRoundedBox(page, x, y - 32, tableWidth, 32, { fill: softGray, border: lineGray })
    drawText(page, options.emptyText ?? 'Sin datos para este periodo.', x + 12, y - 20, fonts.regular, 9, { color: darkGray, maxWidth: tableWidth - 24 })
    return 32
  }

  page.drawRectangle({ x, y: y - headerHeight, width: tableWidth, height: headerHeight, color: black })
  let cursorX = x
  columns.forEach((column) => {
    drawText(page, column.header, cursorX + column.width / 2, y - 12, fonts.bold, 8.2, { align: 'center', color: rgb(1, 1, 1), maxWidth: column.width - 8 })
    cursorX += column.width
  })

  rows.forEach((row, rowIndex) => {
    const top = y - headerHeight - rowHeight * rowIndex
    page.drawRectangle({ x, y: top - rowHeight, width: tableWidth, height: rowHeight, color: rowIndex % 2 ? softGray : rgb(1, 1, 1), borderColor: lineGray, borderWidth: 0.35 })
    let cellX = x
    columns.forEach((column) => {
      page.drawLine({ start: { x: cellX, y: top }, end: { x: cellX, y: top - rowHeight }, color: lineGray, thickness: 0.35 })
      const text = column.render(row)
      const textX = column.align === 'right' ? cellX + column.width - 6 : column.align === 'center' ? cellX + column.width / 2 : cellX + 6
      drawText(page, text, textX, top - rowHeight + 5.4, column.align === 'right' ? fonts.bold : fonts.regular, fontSize, { align: column.align, maxWidth: column.width - 10 })
      cellX += column.width
    })
    page.drawLine({ start: { x: x + tableWidth, y: top }, end: { x: x + tableWidth, y: top - rowHeight }, color: lineGray, thickness: 0.35 })
  })
  return headerHeight + rows.length * rowHeight
}

const newContentPage = (ctx: PdfContext) => {
  const page = ctx.doc.addPage([pageWidth, pageHeight])
  ctx.pages.push(page)
  return page
}

const drawHeaderFooter = (ctx: PdfContext, input: ClosurePdfInput, generatedAt: Date) => {
  ctx.pages.forEach((page, index) => {
    if (ctx.logo) page.drawImage(ctx.logo, { x: 39, y: 724, width: 112, height: 84, opacity: 0.88 })
    else {
      drawText(page, 'LUCCA', 50, 762, ctx.fonts.bold, 25)
      drawText(page, 'PARK', 75, 742, ctx.fonts.regular, 13)
    }
    page.drawLine({ start: { x: 172, y: 724 }, end: { x: 172, y: 808 }, color: black, thickness: 0.9 })
    drawFittedText(page, 'CIERRE FINANCIERO - LUCCA PARK', 192, 779, ctx.fonts.bold, index === 0 ? 22 : 20, 360, { minSize: 16 })
    drawText(page, `Periodo: ${formatDateKey(input.dateFrom)} al ${formatDateKey(input.dateTo)}`, 196, 754, ctx.fonts.bold, 9.8)
    if (index === 0) {
      drawText(page, `Generado: ${formatDateTime(generatedAt)}`, 196, 737, ctx.fonts.bold, 9.8)
      drawText(page, `Generado por: ${safe(input.generatedBy, auth.currentUser?.email ?? 'Usuario')}`, 196, 720, ctx.fonts.bold, 9.8, { maxWidth: 350 })
    } else {
      drawText(page, `Pagina ${index + 1} de ${ctx.pages.length}`, 196, 732, ctx.fonts.bold, 9.8)
    }
    page.drawLine({ start: { x: marginX, y: 704 }, end: { x: pageWidth - marginX, y: 704 }, color: midGray, thickness: 0.9 })
    page.drawLine({ start: { x: marginX, y: 28 }, end: { x: pageWidth - marginX, y: 28 }, color: midGray, thickness: 0.7 })
    drawText(page, `Pagina ${index + 1} de ${ctx.pages.length}`, pageWidth / 2, 13, ctx.fonts.regular, 8.6, { align: 'center', color: darkGray })
  })
}

const loadLogo = async (doc: PDFDocument) => {
  try {
    const base = import.meta.env.BASE_URL || '/'
    const response = await fetch(`${base}assets/lucca-logo-cropped.png`)
    if (!response.ok) return undefined
    const bytes = await response.arrayBuffer()
    if (typeof document !== 'undefined') {
      const image = new Image()
      const objectUrl = URL.createObjectURL(new Blob([bytes]))
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('No se pudo cargar el logo.'))
        image.src = objectUrl
      })
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')
      if (context) {
        context.drawImage(image, 0, 0)
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
        for (let index = 0; index < imageData.data.length; index += 4) {
          const gray = imageData.data[index] * 0.299 + imageData.data[index + 1] * 0.587 + imageData.data[index + 2] * 0.114
          imageData.data[index] = gray
          imageData.data[index + 1] = gray
          imageData.data[index + 2] = gray
        }
        context.putImageData(imageData, 0, 0)
        const grayscaleBytes = await new Promise<ArrayBuffer>((resolve) => {
          canvas.toBlob(async (blob) => resolve(blob ? await blob.arrayBuffer() : bytes), 'image/png')
        })
        URL.revokeObjectURL(objectUrl)
        return await doc.embedPng(new Uint8Array(grayscaleBytes))
      }
      URL.revokeObjectURL(objectUrl)
    }
    return await doc.embedPng(bytes)
  } catch {
    return undefined
  }
}

const paymentClient = (payment: PaymentRecord) => safe(payment.childName || payment.customerName || payment.eventName, 'Sin referencia')
const paymentConcept = (payment: PaymentRecord) => safe(payment.description || payment.concepts || 'Cobro', 'Cobro')

const buildObservations = (input: ClosurePdfInput) => {
  const observations: string[] = []
  if (input.pendingAmount > 0) observations.push(`Existe pendiente de cobro por ${money(input.pendingAmount)}.`)
  const cash = input.methodTotals.cash ?? 0
  if (input.totals.totalCollected > 0) observations.push(`El ${Math.round((cash / input.totals.totalCollected) * 100)}% de los cobros fueron en efectivo.`)
  if ((input.methodTotals.missing ?? 0) > 0) observations.push(`Existen movimientos sin método de pago registrado por ${money(input.methodTotals.missing ?? 0)}.`)
  const eventExpenses = input.expenses.filter((expense) => expense.type === 'event').length
  observations.push(eventExpenses > 0 ? `Se registraron ${eventExpenses} gastos asociados a eventos.` : 'No se registraron gastos asociados a eventos en el periodo.')
  if (observations.length === 0) observations.push('No se detectaron observaciones automáticas para este periodo.')
  return observations
}

const buildFindings = (input: ClosurePdfInput, topProducts: Array<{ name: string; revenue: number }>, expenseCategories: Array<{ category: string; amount: number }>) => {
  const findings: string[] = []
  if (input.totals.totalCollected > 0) {
    findings.push(`La cantina representó el ${Math.round((input.totals.canteenCollected / input.totals.totalCollected) * 100)}% del total cobrado durante el periodo.`)
    findings.push(`El resultado neto del periodo fue ${input.totals.netResult >= 0 ? 'positivo' : 'negativo'} por ${money(Math.abs(input.totals.netResult))}.`)
  }
  if (topProducts[0]) findings.push(`${topProducts[0].name} fue el producto de mayor facturación de cantina.`)
  if (expenseCategories[0]) findings.push(`${expenseCategories[0].category} fue la categoría de gasto con mayor importe registrado.`)
  if ((input.methodTotals.missing ?? 0) > 0) findings.push(`Existen movimientos sin método de pago registrado por revisar.`)
  if (findings.length === 0) findings.push('No existen datos suficientes para generar recomendaciones adicionales.')
  return findings
}

const groupTopProducts = (orders: CanteenOrder[]) => {
  const map = new Map<string, { name: string; quantity: number; revenue: number }>()
  orders.forEach((order) => {
    order.items.forEach((item) => {
      const current = map.get(item.productId || item.productName) ?? { name: item.productName, quantity: 0, revenue: 0 }
      current.quantity += item.quantity
      current.revenue += item.subtotal
      map.set(item.productId || item.productName, current)
    })
  })
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
}

const groupExpenses = (expenses: ExpenseRecord[]) => {
  const map = new Map<string, number>()
  expenses.forEach((expense) => map.set(expenseCategoryLabel(expense.category), (map.get(expenseCategoryLabel(expense.category)) ?? 0) + expense.amount))
  return Array.from(map.entries()).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount)
}

const drawBullets = (page: PDFPage, fonts: Fonts, items: string[], x: number, y: number, width: number, options: { fontSize?: number; lineHeight?: number; maxLines?: number } = {}) => {
  let cursorY = y
  const fontSize = options.fontSize ?? 9
  const lineHeight = options.lineHeight ?? 11
  const maxLines = options.maxLines ?? 2
  items.forEach((item) => {
    page.drawCircle({ x: x + 4, y: cursorY + 3, size: 1.8, color: black })
    const lines = wrapText(item, fonts.regular, fontSize, width - 20, maxLines)
    lines.forEach((line, index) => drawText(page, line, x + 16, cursorY - index * lineHeight, fonts.regular, fontSize, { maxWidth: width - 20 }))
    cursorY -= Math.max(lineHeight + 3, lines.length * lineHeight + 3)
  })
}

const drawBarList = (page: PDFPage, fonts: Fonts, rows: Array<{ label: string; value: number; percent: number }>, x: number, y: number, width: number, height: number) => {
  drawRoundedBox(page, x, y - height, width, height, { fill: rgb(1, 1, 1), border: lineGray })
  const maxBar = Math.max(...rows.map((row) => row.percent), 1)
  rows.slice(0, 6).forEach((row, index) => {
    const rowY = y - 25 - index * 21
    drawText(page, row.label, x + 12, rowY, fonts.regular, 8, { maxWidth: 82 })
    const barWidth = ((width - 145) * row.percent) / maxBar
    page.drawRectangle({ x: x + 100, y: rowY - 1, width: Math.max(2, barWidth), height: 10, color: black })
    drawText(page, percent(row.percent), x + 107 + barWidth, rowY, fonts.regular, 8, { maxWidth: 35 })
  })
}

const splitRows = <T,>(rows: T[], firstPageSize: number, nextPageSize: number) => {
  const chunks: T[][] = []
  let cursor = 0
  chunks.push(rows.slice(cursor, cursor + firstPageSize))
  cursor += firstPageSize
  while (cursor < rows.length) {
    chunks.push(rows.slice(cursor, cursor + nextPageSize))
    cursor += nextPageSize
  }
  return chunks
}

const buildPremiumPdf = async (input: ClosurePdfInput, generatedAt: Date) => {
  const doc = await PDFDocument.create()
  const fonts = {
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    regular: await doc.embedFont(StandardFonts.Helvetica),
  }
  const ctx: PdfContext = { doc, fonts, logo: await loadLogo(doc), pages: [] }

  const canteenOrders = input.canteenOrders ?? []
  const visits = input.visits ?? []
  const pendingOrders = input.pendingOrders ?? []
  const pendingEvents = input.pendingEvents ?? []
  const pendingVisits = input.pendingVisits ?? []
  const topProducts = groupTopProducts(canteenOrders)
  const expenseCategories = groupExpenses(input.expenses)
  const totalCanteenRevenue = Math.max(1, topProducts.reduce((sum, item) => sum + item.revenue, 0))
  const totalExpenseAmount = Math.max(1, input.expenses.reduce((sum, expense) => sum + expense.amount, 0))
  const parkMovements = input.payments.filter((payment) => (payment.parkAmountPaid ?? 0) > 0 || payment.concepts === 'park').length
  const canteenMovements = input.payments.filter((payment) => (payment.canteenAmountPaid ?? 0) > 0 || payment.concepts === 'canteen' || payment.source === 'canteen').length
  const eventMovements = input.payments.filter((payment) => (payment.eventAmountPaid ?? 0) > 0 || payment.concepts === 'event' || payment.source === 'event_payment').length
  const visitsWithConsumption = new Set(canteenOrders.map((order) => order.visitId || order.childId || order.childName).filter(Boolean)).size
  const totalVisits = visits.length
  const totalOperations = Math.max(input.payments.length, 1)
  const days = Math.max(1, Math.round((new Date(`${input.dateTo}T12:00:00`).getTime() - new Date(`${input.dateFrom}T12:00:00`).getTime()) / 86400000) + 1)

  const page1 = newContentPage(ctx)
  drawSectionTitle(page1, fonts, 'R', 'Resumen ejecutivo', 674)
  let page1Y = drawSummaryGrid(
    page1,
    fonts,
    [
      { label: 'Total cobrado', value: money(input.totals.totalCollected) },
      { label: 'Gastos registrados', value: money(input.totals.totalExpenses) },
      { label: 'Resultado neto', value: money(input.totals.netResult) },
      { label: 'Pendiente de cobro', value: money(input.pendingAmount) },
    ],
    32,
    640,
    532,
    4,
    { gapX: 8, gapY: 8, height: 42, valueSize: 12.4 },
  )

  page1.drawLine({ start: { x: marginX, y: page1Y - 12 }, end: { x: pageWidth - marginX, y: page1Y - 12 }, color: lineGray, thickness: 0.7 })
  drawSectionTitle(page1, fonts, 'I', 'Ingresos por área', page1Y - 36)
  page1Y = drawSummaryGrid(
    page1,
    fonts,
    [
      { label: 'Parque', note: `${parkMovements} movimientos`, value: money(input.totals.parkCollected) },
      { label: 'Cantina', note: `${canteenMovements} movimientos`, value: money(input.totals.canteenCollected) },
      { label: 'Eventos', note: `${eventMovements} movimientos`, value: money(input.totals.eventCollected) },
    ],
    32,
    page1Y - 70,
    532,
    3,
    { gapX: 10, gapY: 8, height: 42, valueSize: 12.2, compact: true },
  )

  page1.drawLine({ start: { x: marginX, y: page1Y - 12 }, end: { x: pageWidth - marginX, y: page1Y - 12 }, color: lineGray, thickness: 0.7 })
  drawSectionTitle(page1, fonts, '$', 'Cobros por método de pago', page1Y - 36)
  const methodRows = [
    ['Efectivo', input.methodTotals.cash ?? 0],
    ['Transferencia', input.methodTotals.transfer ?? 0],
    ['QR', input.methodTotals.qr ?? 0],
    ['Tarjeta débito', input.methodTotals.debit ?? 0],
    ['Tarjeta crédito', input.methodTotals.credit ?? 0],
    ['Otro', input.methodTotals.other ?? 0],
    ['Sin método registrado', input.methodTotals.missing ?? 0],
    ['TOTAL', input.totals.totalCollected],
  ]
  const methodHeight = drawDataTable(page1, fonts, 32, page1Y - 64, [
    { header: 'Método de pago', render: (row) => row[0] as string, width: 265 },
    { align: 'right', header: 'Monto cobrado', render: (row) => money(row[1] as number), width: 266 },
  ], methodRows, { rowHeight: 17, fontSize: 8.5 })

  page1Y = page1Y - 64 - methodHeight
  page1.drawLine({ start: { x: marginX, y: page1Y - 12 }, end: { x: pageWidth - marginX, y: page1Y - 12 }, color: lineGray, thickness: 0.7 })
  drawSectionTitle(page1, fonts, 'K', 'Indicadores clave del período', page1Y - 36)
  const ticketPark = parkMovements > 0 ? money(input.totals.parkCollected / parkMovements) : '-'
  const ticketCanteen = canteenMovements > 0 ? money(input.totals.canteenCollected / canteenMovements) : '-'
  page1Y = drawSummaryGrid(
    page1,
    fonts,
    [
      { label: 'Niños ingresados', value: String(totalVisits || 0) },
      { label: 'Ventas de cantina', value: String(canteenMovements || 0) },
      { label: 'Ticket promedio parque', value: ticketPark },
      { label: 'Ticket promedio cantina', value: ticketCanteen },
    ],
    32,
    page1Y - 70,
    532,
    4,
    { gapX: 8, gapY: 8, height: 42, valueSize: 12.2, compact: true },
  )

  page1.drawLine({ start: { x: marginX, y: page1Y - 12 }, end: { x: pageWidth - marginX, y: page1Y - 12 }, color: lineGray, thickness: 0.7 })
  drawSectionTitle(page1, fonts, '!', 'Alertas y observaciones', page1Y - 36)
  drawBullets(page1, fonts, buildObservations(input), 42, 61, 500, { fontSize: 7.7, lineHeight: 8.7, maxLines: 1 })

  const incomeRows = input.payments.map((payment) => ({
    client: paymentClient(payment),
    concept: paymentConcept(payment),
    date: formatDateTime(payment.paidAt ?? payment.createdAt),
    method: methodLabel(payment),
    module: moduleLabel(payment),
    total: payment.totalPaid,
  }))
  const expenseRows = input.expenses.map((expense) => ({
    amount: expense.amount,
    category: expenseCategoryLabel(expense.category),
    date: formatDate(expense.spentAt ?? expense.createdAt),
    description: expense.description,
    method: methodLabel(expense),
    relation: expense.type === 'event' ? `Evento: ${safe(expense.eventName, 'Sin nombre')}` : 'Operativa general',
  }))

  const incomeChunks = splitRows(incomeRows, 12, 20)
  const expenseChunks = splitRows(expenseRows, Math.max(0, 16 - incomeChunks[0].length), 20)
  const detailPagesCount = Math.max(incomeChunks.length, expenseChunks.length, 1)
  for (let index = 0; index < detailPagesCount; index += 1) {
    let page = newContentPage(ctx)
    let y = contentTop - 32
    drawSectionTitle(page, fonts, 'I', index === 0 ? 'Detalle de ingresos cobrados' : 'Detalle de ingresos cobrados - continuaciÃ³n', y)
    y -= 28
    const incomeHeight = drawDataTable(page, fonts, 32, y, [
      { header: 'Fecha y hora', render: (row) => row.date, width: 92 },
      { header: 'Modulo', render: (row) => row.module, width: 60 },
      { header: 'Concepto', render: (row) => row.concept, width: 112 },
      { header: 'Cliente / evento', render: (row) => row.client, width: 106 },
      { header: 'MÃ©todo de pago', render: (row) => row.method, width: 88 },
      { align: 'right', header: 'Monto', render: (row) => money(row.total), width: 74 },
    ], incomeChunks[index] ?? [], { emptyText: 'No se registraron ingresos cobrados en este periodo.', fontSize: 7.6, rowHeight: 18 })
    y -= incomeHeight + 22
    if (index === detailPagesCount - 1) {
      drawText(page, 'Subtotal ingresos cobrados', 470, y + 4, fonts.bold, 9, { align: 'right' })
      drawText(page, money(input.totals.totalCollected), 564, y + 4, fonts.bold, 9.5, { align: 'right' })
      y -= 28
    }
    if (y < 150) {
      page = newContentPage(ctx)
      y = contentTop - 32
    }
    drawSectionTitle(page, fonts, 'G', index === 0 ? 'Detalle de gastos registrados' : 'Detalle de gastos registrados - continuaciÃ³n', y)
    y -= 28
    const expenseHeight = drawDataTable(page, fonts, 32, y, [
      { header: 'Fecha', render: (row) => row.date, width: 66 },
      { header: 'CategorÃ­a', render: (row) => row.category, width: 86 },
      { header: 'DescripciÃ³n', render: (row) => row.description, width: 134 },
      { header: 'RelaciÃ³n', render: (row) => row.relation, width: 118 },
      { header: 'MÃ©todo', render: (row) => row.method, width: 74 },
      { align: 'right', header: 'Monto', render: (row) => money(row.amount), width: 54 },
    ], expenseChunks[index] ?? [], { emptyText: 'No se registraron gastos en este periodo.', fontSize: 7.4, rowHeight: 18 })
    y -= expenseHeight + 20
    if (index === detailPagesCount - 1) {
      drawText(page, 'Subtotal gastos registrados', 470, y + 4, fonts.bold, 9, { align: 'right' })
      drawText(page, money(input.totals.totalExpenses), 564, y + 4, fonts.bold, 9.5, { align: 'right' })
      y -= 30
      if (y < 150) {
        page = newContentPage(ctx)
        y = contentTop - 32
      }
      drawSectionTitle(page, fonts, 'O', 'Observaciones de cierre', y)
      drawRoundedBox(page, 32, y - 74, 532, 58, { fill: rgb(1, 1, 1), border: lineGray })
      drawBullets(page, fonts, [
        input.payments.length ? 'Se registraron cobros provenientes de los mÃ³dulos operativos.' : 'No se registraron cobros en el periodo.',
        input.expenses.length ? `Se registraron ${input.expenses.length} gastos clasificados.` : 'No se registraron gastos en el periodo.',
        (input.methodTotals.missing ?? 0) > 0 ? `Quedan ${money(input.methodTotals.missing ?? 0)} sin mÃ©todo registrado.` : 'Los cobros del periodo tienen mÃ©todo registrado.',
      ], 44, y - 32, 500)
    }
  }

  const page3 = newContentPage(ctx)
  drawSectionTitle(page3, fonts, 'A', 'Análisis operativo del período', 674)
  const conversion = totalVisits > 0 ? (visitsWithConsumption / totalVisits) * 100 : Number.NaN
  const margin = input.totals.totalCollected > 0 ? (input.totals.netResult / input.totals.totalCollected) * 100 : Number.NaN
  const page3Y = drawSummaryGrid(
    page3,
    fonts,
    [
      { label: 'Niños con consumo', value: totalVisits > 0 ? `${visitsWithConsumption} de ${totalVisits}` : '-' },
      { label: 'Conversión cantina', value: percent(conversion) },
      { label: 'Ticket promedio total', value: input.payments.length ? money(input.totals.totalCollected / totalOperations) : '-' },
      { label: 'Ingreso promedio diario', value: input.totals.totalCollected ? money(input.totals.totalCollected / days) : '-' },
      { label: 'Margen operativo', value: percent(margin) },
    ],
    32,
    640,
    532,
    1,
    { gapY: 8, height: 32, valueSize: 12.6 },
  )

  page3.drawLine({ start: { x: marginX, y: page3Y - 12 }, end: { x: pageWidth - marginX, y: page3Y - 12 }, color: lineGray, thickness: 0.7 })
  drawSectionTitle(page3, fonts, '*', 'Top productos de cantina', page3Y - 36)
  const topRows = topProducts.map((item) => ({ ...item, percent: (item.revenue / totalCanteenRevenue) * 100 }))
  drawDataTable(page3, fonts, 32, page3Y - 64, [
    { header: 'Producto', render: (row) => row.name, width: 112 },
    { align: 'center', header: 'Unidades', render: (row) => String(row.quantity), width: 55 },
    { align: 'right', header: 'Ingreso', render: (row) => money(row.revenue), width: 70 },
    { align: 'right', header: 'Participación', render: (row) => percent(row.percent), width: 70 },
  ], topRows, { emptyText: 'No se registraron ventas de cantina en este periodo.', rowHeight: 22 })
  drawBarList(page3, fonts, topRows.map((row) => ({ label: row.name, percent: row.percent, value: row.revenue })), 350, page3Y - 64, 214, 132)

  page3.drawLine({ start: { x: marginX, y: page3Y - 274 }, end: { x: pageWidth - marginX, y: page3Y - 274 }, color: lineGray, thickness: 0.7 })
  drawSectionTitle(page3, fonts, 'G', 'Gastos por categoría', page3Y - 294)
  const expenseCategoryRows = expenseCategories.map((row) => ({ ...row, percent: (row.amount / totalExpenseAmount) * 100 }))
  drawDataTable(page3, fonts, 32, page3Y - 320, [
    { header: 'Categoría', render: (row) => row.category, width: 118 },
    { align: 'right', header: 'Monto', render: (row) => money(row.amount), width: 95 },
    { align: 'right', header: 'Participación', render: (row) => percent(row.percent), width: 95 },
  ], expenseCategoryRows.length ? [...expenseCategoryRows, { amount: input.totals.totalExpenses, category: 'TOTAL', percent: 100 }] : [], { emptyText: 'No se registraron gastos en este periodo.', rowHeight: 20 })
  drawBarList(page3, fonts, expenseCategoryRows.map((row) => ({ label: row.category, percent: row.percent, value: row.amount })), 350, page3Y - 320, 214, 140)

  page3.drawLine({ start: { x: marginX, y: page3Y - 496 }, end: { x: pageWidth - marginX, y: page3Y - 496 }, color: lineGray, thickness: 0.7 })
  drawSectionTitle(page3, fonts, 'H', 'Hallazgos y recomendaciones', page3Y - 516)
  drawRoundedBox(page3, 32, 58, 532, 66, { fill: rgb(1, 1, 1), border: lineGray })
  drawBullets(page3, fonts, buildFindings(input, topProducts, expenseCategories), 44, 108, 500, { fontSize: 8.2, lineHeight: 9.5, maxLines: 1 })

  const activeEvents = (input.events ?? []).filter((event) => {
    const hasPayment = input.payments.some((payment) => payment.eventId === event.id)
    const hasExpense = input.expenses.some((expense) => expense.eventId === event.id)
    const hasCanteen = canteenOrders.some((order) => order.eventId === event.id)
    return (event.date >= input.dateFrom && event.date <= input.dateTo) || hasPayment || hasExpense || hasCanteen
  })
  if (activeEvents.length > 4) {
    const chunks = splitRows(activeEvents, 18, 24)
    chunks.forEach((chunk, index) => {
      const page = newContentPage(ctx)
      drawSectionTitle(page, fonts, 'E', index ? 'Detalle financiero de eventos - continuaciÃ³n' : 'Detalle financiero de eventos', 674)
      drawDataTable(page, fonts, 32, 646, [
        { header: 'Evento', render: (row) => safe(row.title || row.birthdayChildName), width: 94 },
        { header: 'Fecha', render: (row) => formatDateKey(row.date), width: 54 },
        { header: 'Responsable', render: (row) => safe(row.customerName), width: 86 },
        { align: 'right', header: 'Contratado', render: (row) => money(row.totalAmount ?? 0), width: 70 },
        { align: 'right', header: 'Cobrado', render: (row) => money(getEventPaidAmount(row, input.payments)), width: 62 },
        { align: 'right', header: 'Pendiente', render: (row) => money(getEventPendingAmount(row, input.payments)), width: 62 },
        { align: 'right', header: 'Cantina', render: (row) => money(canteenOrders.filter((order) => order.eventId === row.id).reduce((sum, order) => sum + order.total, 0)), width: 52 },
        { align: 'right', header: 'Gastos', render: (row) => money(input.expenses.filter((expense) => expense.eventId === row.id).reduce((sum, expense) => sum + expense.amount, 0)), width: 52 },
      ], chunk, { fontSize: 6.8, rowHeight: 20 })
    })
  }

  const page4 = newContentPage(ctx)
  const weekRows = Array.from({ length: days }, (_, index) => {
    const date = new Date(`${input.dateFrom}T12:00:00`)
    date.setDate(date.getDate() + index)
    const key = dateKey(date)
    const ingresos = input.payments.filter((payment) => dateKey(payment.paidAt ?? payment.createdAt ?? date) === key).reduce((sum, payment) => sum + payment.totalPaid, 0)
    const gastos = input.expenses.filter((expense) => dateKey(expense.spentAt ?? expense.createdAt ?? date) === key).reduce((sum, expense) => sum + expense.amount, 0)
    return { gastos, ingresos, label: days > 10 ? `DÃ­a ${index + 1}` : formatDateKey(key), neto: ingresos - gastos }
  }).filter((row) => row.ingresos > 0 || row.gastos > 0).slice(0, 4)
  drawSectionTitle(page4, fonts, 'E', days === 1 ? 'Resumen de la jornada' : days <= 10 ? 'EvoluciÃ³n diaria del periodo' : 'EvoluciÃ³n semanal del periodo', 674)
  drawDataTable(page4, fonts, 32, 646, [
    { header: days > 10 ? 'Periodo' : 'Fecha', render: (row) => row.label, width: 78 },
    { align: 'right', header: 'Ingresos', render: (row) => money(row.ingresos), width: 78 },
    { align: 'right', header: 'Gastos', render: (row) => money(row.gastos), width: 78 },
    { align: 'right', header: 'Resultado neto', render: (row) => money(row.neto), width: 78 },
  ], weekRows.length ? [...weekRows, { gastos: input.totals.totalExpenses, ingresos: input.totals.totalCollected, label: 'TOTAL', neto: input.totals.netResult }] : [], { emptyText: 'Periodo insuficiente o sin movimientos para evoluciÃ³n.', rowHeight: 23 })
  drawBarList(page4, fonts, weekRows.map((row) => ({ label: row.label, percent: input.totals.totalCollected ? (row.ingresos / input.totals.totalCollected) * 100 : 0, value: row.ingresos })), 372, 646, 192, 145)

  page4.drawLine({ start: { x: marginX, y: 478 }, end: { x: pageWidth - marginX, y: 478 }, color: lineGray, thickness: 0.7 })
  drawSectionTitle(page4, fonts, 'P', 'Cuentas pendientes y conciliaciÃ³n', 448)
  const pendingRows = [
    ...pendingVisits.map((visit) => ({ date: formatDate(visit.startedAt), detail: `${safe(visit.childName)} - visita activa`, origin: 'RecepciÃ³n', state: 'Pendiente de cobro', total: Number(visit.amountCharged ?? visit.defaultAmount ?? 0) })),
    ...pendingOrders.map((order) => ({ date: formatDate(order.createdAt), detail: safe(order.accountName), origin: 'Cantina', state: 'Pendiente de cobro', total: order.total })),
    ...pendingEvents.map((event) => ({ date: formatDateKey(event.date), detail: safe(event.title || event.birthdayChildName), origin: 'Evento', state: 'Pendiente de cobro', total: getEventPendingAmount(event, input.payments) })),
    ...(input.methodTotals.missing ? [{ date: formatDateKey(input.dateTo), detail: 'Movimientos sin mÃ©todo registrado', origin: 'Finanzas', state: 'Pendiente de revisiÃ³n', total: input.methodTotals.missing }] : []),
  ].slice(0, 4)
  drawDataTable(page4, fonts, 32, 420, [
    { header: 'Fecha', render: (row) => row.date, width: 72 },
    { header: 'Origen', render: (row) => row.origin, width: 72 },
    { header: 'Detalle', render: (row) => row.detail, width: 190 },
    { header: 'Estado', render: (row) => row.state, width: 112 },
    { align: 'right', header: 'Monto', render: (row) => money(row.total), width: 86 },
  ], pendingRows, { emptyText: 'No existen cuentas pendientes al cierre del periodo.', rowHeight: 20 })
  drawMetricCard(page4, fonts, 32, 248, 168, 55, 'Pendiente al cierre', money(input.pendingAmount), 'P')
  drawMetricCard(page4, fonts, 214, 248, 168, 55, 'Movimientos a revisar', String((input.methodTotals.missing ?? 0) > 0 ? 1 : 0), '?')
  drawMetricCard(page4, fonts, 396, 248, 168, 55, 'Cuentas abiertas', String(pendingOrders.length + pendingVisits.length), 'OK')

  page4.drawLine({ start: { x: marginX, y: 230 }, end: { x: pageWidth - marginX, y: 230 }, color: lineGray, thickness: 0.7 })
  drawSectionTitleAt(page4, fonts, 'C', 'Checklist de cierre', 32, 200, 254)
  drawRoundedBox(page4, 32, 96, 254, 88, { fill: rgb(1, 1, 1), border: lineGray })
  ;[
    ['Cobros de recepciÃ³n registrados', parkMovements > 0],
    ['Cobros de cantina registrados', canteenMovements > 0],
    ['Gastos registrados y clasificados', input.expenses.length > 0],
    ['MÃ©todos de pago completos', (input.methodTotals.missing ?? 0) === 0],
    ['Pendientes identificados', true],
    ['PDF de cierre generado', true],
  ].forEach(([label, ok], index) => {
    const y = 168 - index * 13
    page4.drawCircle({ x: 49, y: y + 3, size: 5.2, borderColor: black, borderWidth: 0.8, color: ok ? rgb(1, 1, 1) : lightGray })
    drawText(page4, ok ? 'OK' : '!', 49, y, fonts.bold, 5.2, { align: 'center' })
    drawText(page4, label as string, 62, y, fonts.regular, 8.4, { maxWidth: 205 })
  })
  drawSectionTitleAt(page4, fonts, '*', 'Conclusiones finales', 310, 200, 254)
  drawRoundedBox(page4, 310, 96, 254, 88, { fill: rgb(1, 1, 1), border: lineGray })
  drawBullets(page4, fonts, [
    input.totals.netResult >= 0 ? `El negocio cerrÃ³ el periodo con resultado neto positivo de ${money(input.totals.netResult)}.` : `El periodo cerrÃ³ con resultado neto negativo de ${money(Math.abs(input.totals.netResult))}.`,
    input.totals.parkCollected >= input.totals.canteenCollected ? 'El parque fue la principal fuente de ingresos del periodo.' : 'La cantina tuvo un peso relevante dentro de los ingresos del periodo.',
    (input.methodTotals.missing ?? 0) > 0 ? 'Conviene revisar los cobros sin mÃ©todo registrado.' : 'Los mÃ©todos de pago del periodo quedaron identificados.',
  ], 322, 166, 230)

  drawSectionTitle(page4, fonts, 'F', 'ValidaciÃ³n y firmas', 88)
  ;['ElaborÃ³', 'RevisÃ³', 'AprobÃ³'].forEach((label, index) => {
    const x = 32 + index * 182
    drawRoundedBox(page4, x, 42, 168, 42, { fill: rgb(1, 1, 1), border: lineGray })
    drawText(page4, label, x + 84, 70, fonts.regular, 8.4, { align: 'center' })
    page4.drawLine({ start: { x: x + 22, y: 55 }, end: { x: x + 146, y: 55 }, color: black, thickness: 0.7 })
    drawText(page4, 'Nombre y firma', x + 84, 46, fonts.regular, 7.8, { align: 'center' })
  })

  drawHeaderFooter(ctx, input, generatedAt)
  return doc.save()
}

