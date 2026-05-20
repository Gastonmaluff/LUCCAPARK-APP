import { PackagePlus, Receipt, ShoppingBasket } from 'lucide-react'
import { AdminModuleHeader } from '../../components/AdminModuleHeader'
import { StatusPill } from '../../components/StatusPill'
import { demoCanteenProducts, demoOpenAccounts } from '../../data/demoData'

export function AdminCanteenPage() {
  return (
    <>
      <AdminModuleHeader
        eyebrow="Ventas"
        title="Cantina"
        description="Base visual para productos, ventas, cuentas abiertas e inventario."
        action={
          <button
            className="button primary"
            onClick={() => window.alert('Nueva venta demo. En Fase 4 se conectara a cuentas y stock.')}
            type="button"
          >
            <Receipt size={18} />
            Nueva venta
          </button>
        }
      />
      <div className="dashboard-grid">
        <article className="panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <ShoppingBasket color="var(--orange)" />
              Productos demo
            </h2>
            <button
              className="button ghost"
              onClick={() => window.alert('Producto demo. El ABM de inventario llega en Fase 4.')}
              type="button"
            >
              <PackagePlus size={17} />
              Nuevo producto
            </button>
          </div>
          <div className="product-grid">
            {demoCanteenProducts.map((product) => (
              <article className="product-card" key={product.name}>
                <strong>{product.name}</strong>
                <p className="muted">{product.category}</p>
                <div className="metric-row">
                  <span>{product.price}</span>
                  <StatusPill tone={product.lowStock ? 'warning' : 'available'}>{product.stock} stock</StatusPill>
                </div>
              </article>
            ))}
          </div>
        </article>
        <article className="panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <Receipt color="var(--turquoise)" />
              Cuentas abiertas
            </h2>
            <StatusPill tone="info">Demo</StatusPill>
          </div>
          <div className="module-list">
            {demoOpenAccounts.map((account) => (
              <div className="module-row" key={account.name}>
                <div>
                  <strong>{account.name}</strong>
                  <p className="muted">
                    {account.source} - {account.items} items
                  </p>
                </div>
                <strong>{account.total}</strong>
              </div>
            ))}
          </div>
        </article>
      </div>
    </>
  )
}
