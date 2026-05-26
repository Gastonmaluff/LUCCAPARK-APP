import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ImageIcon, PackagePlus, Search } from 'lucide-react'
import { canteenCategories } from '../../config/canteen'
import { setCanteenProductActive, upsertCanteenProduct, uploadCanteenProductImage } from '../../services/canteenService'
import { formatGuarani, toNumber } from '../../utils/money'
import { StatusPill } from '../StatusPill'
import type { CanteenCategory, CanteenProduct, UpsertCanteenProductInput } from '../../types'

interface ProductManagerProps {
  products: CanteenProduct[]
  isLoading: boolean
  error: string | null
  defaultOpen?: boolean
}

const emptyProduct: UpsertCanteenProductInput = {
  name: '',
  category: 'Bebidas',
  price: 0,
  unitCost: null,
  stock: null,
  minStock: null,
  imageUrl: '',
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
  const [category, setCategory] = useState<CanteenCategory | 'Todas'>('Todas')
  const [showInactive, setShowInactive] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [imagePreviewUrl, setImagePreviewUrl] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const activeProductsCount = products.filter((product) => product.isActive).length
  const lowStockCount = products.filter(
    (product) => product.stock !== null && product.minStock !== null && product.stock <= product.minStock,
  ).length

  const filteredProducts = useMemo(
    () =>
      products.filter((product) => {
        const matchesQuery = product.name.toLowerCase().includes(query.trim().toLowerCase())
        const matchesCategory = category === 'Todas' || product.category === category
        const matchesActive = showInactive || product.isActive
        return matchesQuery && matchesCategory && matchesActive
      }),
    [category, products, query, showInactive],
  )

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
    setIsFormOpen(false)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)

    if (!form.name.trim() || Number(form.price) <= 0) {
      setMessage('Completa nombre y precio mayor a cero.')
      return
    }

    setIsSaving(true)
    try {
      setIsUploadingImage(Boolean(imageFile))
      const imageUrl = imageFile ? await uploadCanteenProductImage(imageFile, form.id ?? 'new') : form.imageUrl
      setIsUploadingImage(false)
      await upsertCanteenProduct({ ...form, imageUrl })
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
                <span>Categoria</span>
                <select
                  onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as CanteenCategory }))}
                  value={form.category}
                >
                  {canteenCategories.map((item) => (
                    <option key={item} value={item}>
                      {item}
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
                  min={0}
                  onChange={(event) => setForm((current) => ({ ...current, stock: event.target.value === '' ? null : toNumber(event.target.value) }))}
                  placeholder="Opcional"
                  type="number"
                  value={form.stock ?? ''}
                />
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
              {imagePreviewUrl || form.imageUrl ? (
                <div className="product-image-preview">
                  <span>{imageFile ? 'Vista previa nueva' : 'Imagen actual'}</span>
                  <img alt="Vista previa del producto" src={imagePreviewUrl || form.imageUrl} />
                  {isUploadingImage ? <small>Subiendo imagen...</small> : null}
                </div>
              ) : null}
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
              <span>Categoria</span>
              <select onChange={(event) => setCategory(event.target.value as CanteenCategory | 'Todas')} value={category}>
                <option value="Todas">Todas</option>
                {canteenCategories.map((item) => (
                  <option key={item} value={item}>
                    {item}
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
                    {product.imageUrl ? <img alt={product.name} src={product.imageUrl} /> : <ImageIcon size={30} />}
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
        </>
      ) : null}
    </article>
  )
}
