import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, ChevronRight, PackagePlus, Search, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { useCanteenCategories, useCanteenInventoryMovements } from '../../hooks/useCanteen'
import { addCanteenStock, deleteCanteenCategory, setCanteenProductActive, upsertCanteenCategory, upsertCanteenProduct, uploadCanteenProductImage } from '../../services/canteenService'
import { buildCanteenCategoryOptions, filterCanteenProductsByCategory } from '../../utils/canteenCategories'
import { formatGuarani, toNumber } from '../../utils/money'
import { StatusPill } from '../StatusPill'
import { ProductImageView, defaultProductImageFit, normalizeProductImageFit } from './ProductImageView'
import type { CanteenCategory, CanteenCategoryRecord, CanteenProduct, ProductImageFit, UpsertCanteenProductInput } from '../../types'

interface ProductManagerProps {
  products: CanteenProduct[]
  isLoading: boolean
  error: string | null
  defaultOpen?: boolean
}

const emptyProduct: UpsertCanteenProductInput = {
  name: '',
  category: '',
  price: 0,
  unitCost: null,
  stock: null,
  minStock: null,
  imageUrl: '',
  imageFit: defaultProductImageFit,
  isActive: true,
}

const moneyDigits = (value: string) => value.replace(/\D/g, '')
const parseMoneyInput = (value: string) => {
  const digits = moneyDigits(value)
  return digits ? Number(digits) : 0
}
const formatMoneyInput = (value?: number | null) => (value && value > 0 ? new Intl.NumberFormat('es-PY').format(value) : '')

export function ProductManager({ defaultOpen = false, error, isLoading, products }: ProductManagerProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [form, setForm] = useState<UpsertCanteenProductInput>(emptyProduct)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Todas')
  const [categoryForm, setCategoryForm] = useState({ id: '', isActive: true, name: '', sortOrder: '' })
  const [stockTarget, setStockTarget] = useState<CanteenProduct | null>(null)
  const [stockForm, setStockForm] = useState({ quantity: '', reason: '' })
  const [showInactive, setShowInactive] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [imagePreviewUrl, setImagePreviewUrl] = useState('')
  const [isImageFitOpen, setIsImageFitOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const categoriesResult = useCanteenCategories()
  const movementsResult = useCanteenInventoryMovements()

  const activeProductsCount = products.filter((product) => product.isActive).length
  const lowStockCount = products.filter(
    (product) => product.stock !== null && product.minStock !== null && product.stock <= product.minStock,
  ).length

  const categoryOptions = useMemo(
    () => buildCanteenCategoryOptions(products, categoriesResult.categories),
    [categoriesResult.categories, products],
  )
  const activeCategoryOptions = useMemo(
    () => categoryOptions.filter((item) => item.isActive !== false),
    [categoryOptions],
  )

  const filteredProducts = useMemo(
    () =>
      filterCanteenProductsByCategory(products, category === 'Todas' ? 'all' : category).filter((product) => {
        const matchesQuery = product.name.toLowerCase().includes(query.trim().toLowerCase())
        const matchesActive = showInactive || product.isActive
        return matchesQuery && matchesActive
      }),
    [category, products, query, showInactive],
  )

  useEffect(() => {
    if (!form.category && activeCategoryOptions[0]) {
      setForm((current) => ({ ...current, category: activeCategoryOptions[0].name }))
    }
  }, [activeCategoryOptions, form.category])

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl('')
      return undefined
    }

    const objectUrl = URL.createObjectURL(imageFile)
    setImagePreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [imageFile])

  const editProduct = (product: CanteenProduct) => {
    setForm({
      id: product.id,
      name: product.name,
      category: product.category,
      price: product.salePrice ?? product.price,
      unitCost: product.unitCost ?? null,
      stock: product.stock,
      minStock: product.minStock,
      imageUrl: product.imageUrl ?? '',
      imageFit: normalizeProductImageFit(product.imageFit),
      isActive: product.isActive,
    })
    setImageFile(null)
    setIsFormOpen(true)
    setIsOpen(true)
    setMessage(null)
  }

  const resetForm = () => {
    setForm(emptyProduct)
    setImageFile(null)
    setIsImageFitOpen(false)
    setIsFormOpen(false)
  }

  const setImageFit = (patch: Partial<ProductImageFit>) => {
    setForm((current) => ({ ...current, imageFit: { ...normalizeProductImageFit(current.imageFit), ...patch } }))
  }

  const productImageUrl = imagePreviewUrl || form.imageUrl || ''

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)

    if (!form.name.trim() || !form.category || Number(form.price) <= 0) {
      setMessage('Completá nombre, categoría y precio mayor a cero.')
      return
    }

    setIsSaving(true)
    try {
      setIsUploadingImage(Boolean(imageFile))
      const imageUrl = imageFile ? await uploadCanteenProductImage(imageFile, form.id ?? 'new') : form.imageUrl
      setIsUploadingImage(false)
      await upsertCanteenProduct({ ...form, imageUrl, stock: form.id ? undefined : form.stock })
      resetForm()
      setMessage('Producto guardado.')
    } catch (saveError) {
      console.error('[Inventario] No se pudo guardar el producto', saveError)
      setMessage(saveError instanceof Error ? saveError.message : 'No se pudo guardar el producto.')
    } finally {
      setIsUploadingImage(false)
      setIsSaving(false)
    }
  }

  const saveCategory = async () => {
    setMessage(null)
    if (!categoryForm.name.trim()) {
      setMessage('Ingresá el nombre de la categoría.')
      return
    }
    setIsSaving(true)
    try {
      await upsertCanteenCategory({
        id: categoryForm.id || undefined,
        isActive: categoryForm.isActive,
        name: categoryForm.name,
        sortOrder: categoryForm.sortOrder ? Number(categoryForm.sortOrder) : 999,
      })
      setCategoryForm({ id: '', isActive: true, name: '', sortOrder: '' })
      setMessage('Categoría guardada.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar la categoría.')
    } finally {
      setIsSaving(false)
    }
  }

  const editCategory = (item: CanteenCategoryRecord) => {
    setCategoryForm({
      id: item.id,
      isActive: item.isActive,
      name: item.name,
      sortOrder: String(item.sortOrder ?? 999),
    })
  }

  const removeCategory = async (item: CanteenCategoryRecord) => {
    if (!window.confirm(`¿Eliminar la categoría "${item.name}"?`)) return
    setIsSaving(true)
    try {
      await deleteCanteenCategory(item.id, item.normalizedName)
      setMessage('Categoría eliminada.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo eliminar la categoría.')
    } finally {
      setIsSaving(false)
    }
  }

  const openStockEntry = (product: CanteenProduct) => {
    setStockTarget(product)
    setStockForm({ quantity: '', reason: 'Ingreso de stock' })
    setMessage(null)
  }

  const saveStockEntry = async () => {
    if (!stockTarget) return
    const quantity = Number(stockForm.quantity)
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setMessage('Ingresá una cantidad entera mayor a cero.')
      return
    }
    setIsSaving(true)
    try {
      await addCanteenStock({ productId: stockTarget.id, quantity, reason: stockForm.reason || 'Ingreso de stock' })
      setStockTarget(null)
      setMessage('Stock agregado correctamente.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo agregar stock.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <article className="panel inventory-panel">
      <button className="collapsible-title inventory-title" onClick={() => setIsOpen((current) => !current)} type="button">
        <span>
          {isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          <PackagePlus color="var(--orange)" />
          <strong>Inventario</strong>
        </span>
        <span className="inventory-summary">
          <StatusPill tone="info">{activeProductsCount} activos</StatusPill>
          <StatusPill tone={lowStockCount > 0 ? 'warning' : 'available'}>{lowStockCount} bajo stock</StatusPill>
        </span>
      </button>

      {!isOpen ? (
        <div className="inventory-closed">
          <p className="muted">Productos, precios, costos, stock e imagenes de cantina.</p>
          <button className="button ghost" onClick={() => setIsOpen(true)} type="button">
            Ingresar al inventario
          </button>
        </div>
      ) : null}

      {isOpen ? (
        <>
          <div className="module-actions inventory-actions">
            <button
              className="button primary"
              onClick={() => {
                setForm(emptyProduct)
                setImageFile(null)
                setIsFormOpen(true)
              }}
              type="button"
            >
              Agregar producto
            </button>
          </div>

          <section className="inventory-category-manager">
            <div className="section-subheader">
              <div>
                <h3>Categorías de Cantina</h3>
                <p>Creá y ordená categorías para el inventario y la carga de productos.</p>
              </div>
              {categoriesResult.isLoading ? <StatusPill tone="info">Cargando</StatusPill> : <StatusPill tone="available">{categoryOptions.length} categorías</StatusPill>}
            </div>
            {categoriesResult.error ? <div className="form-alert error">No se pudieron cargar categorías: {categoriesResult.error}</div> : null}
            <div className="compact-form inventory-category-form">
              <label className="field">
                <span>Nombre de categoría</span>
                <input value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ej: Bebidas frías" />
              </label>
              <label className="field">
                <span>Orden</span>
                <input inputMode="numeric" value={categoryForm.sortOrder} onChange={(event) => setCategoryForm((current) => ({ ...current, sortOrder: event.target.value.replace(/\D/g, '') }))} placeholder="Opcional" />
              </label>
              <label className="field inline-check">
                <input checked={categoryForm.isActive} onChange={(event) => setCategoryForm((current) => ({ ...current, isActive: event.target.checked }))} type="checkbox" />
                Activa
              </label>
              <div className="module-actions">
                {categoryForm.id ? <button className="button ghost" onClick={() => setCategoryForm({ id: '', isActive: true, name: '', sortOrder: '' })} type="button">Cancelar edición</button> : null}
                <button className="button primary" disabled={isSaving} onClick={saveCategory} type="button">{categoryForm.id ? 'Actualizar categoría' : 'Agregar categoría'}</button>
              </div>
            </div>
            <div className="category-admin-list">
              {categoryOptions.map((item) => (
                <article className={`category-admin-row ${item.isActive ? '' : 'inactive'}`} key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <small>{item.productCount ?? 0} productos · {item.isLegacy ? 'Detectada por productos existentes' : item.isActive ? 'Activa' : 'Inactiva'}</small>
                  </div>
                  <div className="module-actions">
                    {!item.isLegacy ? <button className="button ghost small-button" onClick={() => editCategory(item)} type="button">Editar</button> : null}
                    {!item.isLegacy ? <button className="button ghost small-button" disabled={(item.productCount ?? 0) > 0 || isSaving} onClick={() => removeCategory(item)} type="button"><Trash2 size={14} /> Eliminar</button> : null}
                  </div>
                </article>
              ))}
            </div>
          </section>

          {message ? (
            <div className={message.includes('No se') || message.includes('Completa') || message.includes('permiso') ? 'form-alert error' : 'form-alert success'}>
              {message}
            </div>
          ) : null}

          {isFormOpen ? (
            <form className="product-form inventory-form" onSubmit={handleSubmit}>
              <label className="field">
                <span>Nombre</span>
                <input onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} value={form.name} />
              </label>
              <label className="field">
                <span>Categoría</span>
                <select
                  onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as CanteenCategory }))}
                  value={form.category}
                >
                  {activeCategoryOptions.length === 0 ? <option value="">Creá una categoría primero</option> : null}
                  {activeCategoryOptions.map((item) => (
                    <option key={item.normalizedName} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Precio de venta</span>
                <input
                  inputMode="numeric"
                  onChange={(event) => setForm((current) => ({ ...current, price: parseMoneyInput(event.target.value) }))}
                  placeholder="Ej: 12.000"
                  value={formatMoneyInput(form.price)}
                />
              </label>
              <label className="field">
                <span>Costo unitario</span>
                <input
                  onChange={(event) =>
                    setForm((current) => ({ ...current, unitCost: moneyDigits(event.target.value) === '' ? null : parseMoneyInput(event.target.value) }))
                  }
                  inputMode="numeric"
                  placeholder="Opcional"
                  value={formatMoneyInput(form.unitCost)}
                />
              </label>
              <label className="field">
                <span>Stock actual</span>
                <input
                  disabled={Boolean(form.id)}
                  min={0}
                  onChange={(event) => setForm((current) => ({ ...current, stock: event.target.value === '' ? null : toNumber(event.target.value) }))}
                  placeholder={form.id ? 'Usá Agregar stock' : 'Opcional'}
                  type="number"
                  value={form.stock ?? ''}
                />
                {form.id ? <small>El stock de productos existentes se ajusta con Agregar stock.</small> : null}
              </label>
              <label className="field">
                <span>Stock minimo</span>
                <input
                  min={0}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, minStock: event.target.value === '' ? null : toNumber(event.target.value) }))
                  }
                  placeholder="Opcional"
                  type="number"
                  value={form.minStock ?? ''}
                />
              </label>
              <label className="field">
                <span>Foto PNG sin fondo</span>
                <input accept="image/png,image/jpeg,image/webp" onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} type="file" />
              </label>
              {productImageUrl ? (
                <div className="product-image-preview">
                  <span>{imageFile ? 'Vista previa nueva' : 'Imagen actual'}</span>
                  <ProductImageView alt="Vista previa del producto" fit={form.imageFit} imageUrl={productImageUrl} />
                  {isUploadingImage ? <small>Subiendo imagen...</small> : null}
                </div>
              ) : null}
              <div className="product-image-fit-action">
                <button className="button ghost" disabled={!productImageUrl} onClick={() => setIsImageFitOpen(true)} type="button">
                  <SlidersHorizontal size={16} />
                  Ajustar imagen
                </button>
              </div>
              {form.imageUrl ? (
                <label className="field">
                  <span>URL de imagen actual</span>
                  <input onChange={(event) => setForm((current) => ({ ...current, imageUrl: event.target.value }))} value={form.imageUrl} />
                </label>
              ) : null}
              <label className="field inline-check">
                <input
                  checked={form.isActive}
                  onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                  type="checkbox"
                />
                Activo
              </label>
              <div className="module-actions">
                <button className="button ghost" onClick={resetForm} type="button">
                  Cancelar
                </button>
                <button className="button primary" disabled={isSaving} type="submit">
                  {isUploadingImage ? 'Subiendo imagen...' : form.id ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          ) : null}

          <div className="canteen-filters">
            <label className="field">
              <span>
                <Search size={15} /> Buscar
              </span>
              <input onChange={(event) => setQuery(event.target.value)} placeholder="Producto..." value={query} />
            </label>
            <label className="field">
              <span>Categoría</span>
              <select onChange={(event) => setCategory(event.target.value)} value={category}>
                <option value="Todas">Todas</option>
                {categoryOptions.map((item) => (
                  <option key={item.normalizedName} value={item.normalizedName}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field inline-check">
              <input checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} type="checkbox" />
              Ver inactivos
            </label>
          </div>

          {isLoading ? <div className="empty-state">Cargando productos...</div> : null}
          {error ? <div className="form-alert error">No se pudieron cargar productos: {error}</div> : null}
          {!isLoading && !error && filteredProducts.length === 0 ? <div className="empty-state">No hay productos para mostrar.</div> : null}

          <div className="product-grid real-products">
            {filteredProducts.map((product) => {
              const lowStock = product.stock !== null && product.minStock !== null && product.stock <= product.minStock
              const outOfStock = product.stock !== null && product.stock <= 0
              return (
                <article className={`product-card ${!product.isActive ? 'inactive' : ''}`} key={product.id}>
                  <div className="product-card-image">
                    <ProductImageView alt={product.name} fit={product.imageFit} imageUrl={product.imageUrl} />
                  </div>
                  <div>
                    <strong>{product.name}</strong>
                    <p className="muted">{product.category}</p>
                  </div>
                  <strong>{formatGuarani(product.salePrice ?? product.price)}</strong>
                  {product.unitCost ? <small className="muted">Costo {formatGuarani(product.unitCost)}</small> : null}
                  <div className="metric-row">
                    <StatusPill tone={outOfStock ? 'danger' : lowStock ? 'warning' : 'available'}>
                      {product.stock === null ? 'Sin stock' : `${product.stock} stock`}
                    </StatusPill>
                    <StatusPill tone={product.isActive ? 'available' : 'blocked'}>{product.isActive ? 'Activo' : 'Inactivo'}</StatusPill>
                  </div>
                  <div className="module-actions">
                    <button className="button secondary" onClick={() => openStockEntry(product)} type="button">
                      Agregar stock
                    </button>
                    <button className="button ghost" onClick={() => editProduct(product)} type="button">
                      Editar
                    </button>
                    <button className="button ghost" onClick={() => setCanteenProductActive(product.id, !product.isActive)} type="button">
                      {product.isActive ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>

          <section className="inventory-history-panel">
            <div className="section-subheader">
              <div>
                <h3>Historial de ingresos de stock</h3>
                <p>Movimientos generados por ajustes seguros desde el backend.</p>
              </div>
              <StatusPill tone="info">{movementsResult.movements.filter((item) => item.type === 'stock_entry' || item.type === 'initial_stock').length} ingresos</StatusPill>
            </div>
            {movementsResult.error ? <div className="form-alert error">No se pudieron cargar movimientos: {movementsResult.error}</div> : null}
            {movementsResult.isLoading ? <div className="empty-state">Cargando historial de stock...</div> : null}
            {!movementsResult.isLoading && movementsResult.movements.filter((item) => item.type === 'stock_entry' || item.type === 'initial_stock').length === 0 ? (
              <div className="empty-state">Todavía no hay ingresos de stock registrados.</div>
            ) : null}
            <div className="stock-history-list">
              {movementsResult.movements
                .filter((item) => item.type === 'stock_entry' || item.type === 'initial_stock')
                .slice(0, 20)
                .map((movement) => (
                  <article className="stock-history-row" key={movement.id}>
                    <div>
                      <strong>{movement.productName || 'Producto'}</strong>
                      <small>{movement.createdAt ? new Intl.DateTimeFormat('es-PY', { dateStyle: 'short', timeStyle: 'short' }).format(movement.createdAt) : 'Sin fecha'} · {movement.createdByName || 'Sin usuario'}</small>
                    </div>
                    <span>{movement.quantity} unidades</span>
                    <small>Stock: {movement.stockBefore ?? '-'} → {movement.stockAfter ?? '-'}</small>
                    <small>{movement.reason || 'Sin motivo'}</small>
                  </article>
                ))}
            </div>
          </section>
        </>
      ) : null}
      {stockTarget ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card stock-entry-modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Inventario</p>
                <h3>Agregar stock</h3>
              </div>
              <button className="icon-button" onClick={() => setStockTarget(null)} type="button" aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>
            <p className="muted">{stockTarget.name} · Stock actual: {stockTarget.stock ?? 'sin control'}</p>
            <label className="field">
              <span>Cantidad a ingresar</span>
              <input inputMode="numeric" min={1} onChange={(event) => setStockForm((current) => ({ ...current, quantity: event.target.value.replace(/\D/g, '') }))} value={stockForm.quantity} />
            </label>
            <label className="field">
              <span>Motivo</span>
              <input onChange={(event) => setStockForm((current) => ({ ...current, reason: event.target.value }))} value={stockForm.reason} />
            </label>
            <div className="module-actions">
              <button className="button ghost" onClick={() => setStockTarget(null)} type="button">Cancelar</button>
              <button className="button primary" disabled={isSaving} onClick={saveStockEntry} type="button">Confirmar ingreso</button>
            </div>
          </section>
        </div>
      ) : null}
      {isImageFitOpen ? (
        <ProductImageFitModal
          fit={normalizeProductImageFit(form.imageFit)}
          imageUrl={productImageUrl}
          name={form.name || 'Producto'}
          onChange={setImageFit}
          onClose={() => setIsImageFitOpen(false)}
          onReset={() => setForm((current) => ({ ...current, imageFit: defaultProductImageFit }))}
          onSave={() => setIsImageFitOpen(false)}
        />
      ) : null}
    </article>
  )
}

function ProductImageFitModal({
  fit,
  imageUrl,
  name,
  onChange,
  onClose,
  onReset,
  onSave,
}: {
  fit: ProductImageFit
  imageUrl: string
  name: string
  onChange: (patch: Partial<ProductImageFit>) => void
  onClose: () => void
  onReset: () => void
  onSave: () => void
}) {
  const stepPosition = (axis: 'x' | 'y', delta: number) => {
    onChange({ [axis]: Math.max(-80, Math.min(80, fit[axis] + delta)) })
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div aria-modal="true" className="product-fit-modal" role="dialog">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Producto</p>
            <h3>Ajustar imagen</h3>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="product-fit-layout">
          <article className="product-card product-fit-preview-card">
            <div className="product-card-image">
              <ProductImageView alt={name} fit={fit} imageUrl={imageUrl} />
            </div>
            <div>
              <strong>{name}</strong>
              <p className="muted">Vista previa de card</p>
            </div>
          </article>

          <div className="product-fit-controls">
            <label className="field">
              <span>Zoom</span>
              <input
                max="2.5"
                min="0.6"
                onChange={(event) => onChange({ scale: Number(event.target.value) })}
                step="0.05"
                type="range"
                value={fit.scale}
              />
            </label>
            <label className="field">
              <span>Posicion horizontal</span>
              <input
                max="80"
                min="-80"
                onChange={(event) => onChange({ x: Number(event.target.value) })}
                step="1"
                type="range"
                value={fit.x}
              />
            </label>
            <label className="field">
              <span>Posicion vertical</span>
              <input
                max="80"
                min="-80"
                onChange={(event) => onChange({ y: Number(event.target.value) })}
                step="1"
                type="range"
                value={fit.y}
              />
            </label>
            <div className="product-fit-nudge">
              <button className="icon-button" onClick={() => stepPosition('y', -5)} type="button" aria-label="Mover arriba">
                <ArrowUp size={17} />
              </button>
              <button className="icon-button" onClick={() => stepPosition('x', -5)} type="button" aria-label="Mover izquierda">
                <ArrowLeft size={17} />
              </button>
              <button className="icon-button" onClick={() => stepPosition('x', 5)} type="button" aria-label="Mover derecha">
                <ArrowRight size={17} />
              </button>
              <button className="icon-button" onClick={() => stepPosition('y', 5)} type="button" aria-label="Mover abajo">
                <ArrowDown size={17} />
              </button>
            </div>
          </div>
        </div>

        <div className="module-actions">
          <button className="button ghost" onClick={onReset} type="button">
            Resetear
          </button>
          <button className="button primary" onClick={onSave} type="button">
            Guardar ajuste
          </button>
        </div>
      </div>
    </div>
  )
}
