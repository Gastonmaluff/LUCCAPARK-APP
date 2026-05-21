import { useMemo, useState } from 'react'
import { PackagePlus, Search } from 'lucide-react'
import { canteenCategories } from '../../config/canteen'
import { setCanteenProductActive, upsertCanteenProduct } from '../../services/canteenService'
import { formatGuarani, toNumber } from '../../utils/money'
import { StatusPill } from '../StatusPill'
import type { CanteenCategory, CanteenProduct, UpsertCanteenProductInput } from '../../types'

interface ProductManagerProps {
  products: CanteenProduct[]
  isLoading: boolean
  error: string | null
}

const emptyProduct: UpsertCanteenProductInput = {
  name: '',
  category: 'Bebidas',
  price: 0,
  stock: null,
  minStock: null,
  isActive: true,
}

export function ProductManager({ error, isLoading, products }: ProductManagerProps) {
  const [form, setForm] = useState<UpsertCanteenProductInput>(emptyProduct)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CanteenCategory | 'Todas'>('Todas')
  const [showInactive, setShowInactive] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

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

  const editProduct = (product: CanteenProduct) => {
    setForm({
      id: product.id,
      name: product.name,
      category: product.category,
      price: product.price,
      stock: product.stock,
      minStock: product.minStock,
      isActive: product.isActive,
    })
    setMessage(null)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)

    if (!form.name.trim() || Number(form.price) <= 0) {
      setMessage('Completá nombre y precio mayor a cero.')
      return
    }

    setIsSaving(true)
    try {
      await upsertCanteenProduct(form)
      setForm(emptyProduct)
      setMessage('Producto guardado.')
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : 'No se pudo guardar el producto.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <article className="panel">
      <div className="panel-header">
        <h2 className="panel-title">
          <PackagePlus color="var(--orange)" />
          Productos
        </h2>
        <StatusPill tone="info">Firestore</StatusPill>
      </div>

      <form className="product-form" onSubmit={handleSubmit}>
        {message ? <div className={message.includes('No se') || message.includes('Completá') ? 'form-alert error' : 'form-alert success'}>{message}</div> : null}
        <label className="field">
          <span>Nombre</span>
          <input onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} value={form.name} />
        </label>
        <label className="field">
          <span>Categoría</span>
          <select onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as CanteenCategory }))} value={form.category}>
            {canteenCategories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Precio</span>
          <input
            min={0}
            onChange={(event) => setForm((current) => ({ ...current, price: toNumber(event.target.value) }))}
            type="number"
            value={form.price}
          />
        </label>
        <label className="field">
          <span>Stock</span>
          <input
            min={0}
            onChange={(event) => setForm((current) => ({ ...current, stock: event.target.value === '' ? null : toNumber(event.target.value) }))}
            placeholder="Opcional"
            type="number"
            value={form.stock ?? ''}
          />
        </label>
        <label className="field">
          <span>Stock mínimo</span>
          <input
            min={0}
            onChange={(event) => setForm((current) => ({ ...current, minStock: event.target.value === '' ? null : toNumber(event.target.value) }))}
            placeholder="Opcional"
            type="number"
            value={form.minStock ?? ''}
          />
        </label>
        <label className="field inline-check">
          <input
            checked={form.isActive}
            onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
            type="checkbox"
          />
          Activo
        </label>
        <button className="button primary" disabled={isSaving} type="submit">
          {form.id ? 'Actualizar' : 'Crear'}
        </button>
      </form>

      <div className="canteen-filters">
        <label className="field">
          <span>
            <Search size={15} /> Buscar
          </span>
          <input onChange={(event) => setQuery(event.target.value)} placeholder="Producto..." value={query} />
        </label>
        <label className="field">
          <span>Categoría</span>
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
              <div>
                <strong>{product.name}</strong>
                <p className="muted">{product.category}</p>
              </div>
              <strong>{formatGuarani(product.price)}</strong>
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
    </article>
  )
}
