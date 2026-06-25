import type { CanteenCategoryRecord, CanteenProduct } from '../types'

export const allCanteenCategoriesKey = 'all'
export const uncategorizedCanteenCategory = 'Sin categoría'

export const normalizeCanteenCategoryName = (value: string) =>
  value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export const getProductCategoryKey = (product: Pick<CanteenProduct, 'category' | 'categoryNormalized'>) =>
  product.categoryNormalized || normalizeCanteenCategoryName(product.category || uncategorizedCanteenCategory)

export const categoryLabel = (category: Pick<CanteenCategoryRecord, 'name'> | string) =>
  typeof category === 'string' ? category : category.name

export const buildCanteenCategoryOptions = (
  products: CanteenProduct[],
  configuredCategories: CanteenCategoryRecord[],
  options: { onlyOperational?: boolean } = {},
) => {
  const byKey = new Map<string, CanteenCategoryRecord>()

  configuredCategories.forEach((category) => {
    const normalizedName = category.normalizedName || normalizeCanteenCategoryName(category.name)
    if (!normalizedName) return
    byKey.set(normalizedName, { ...category, normalizedName, productCount: 0 })
  })

  products.forEach((product) => {
    const name = product.category || uncategorizedCanteenCategory
    const normalizedName = getProductCategoryKey(product)
    if (!normalizedName) return
    const existing = byKey.get(normalizedName)
    if (existing) {
      byKey.set(normalizedName, { ...existing, productCount: (existing.productCount ?? 0) + 1 })
      return
    }
    byKey.set(normalizedName, {
      id: normalizedName,
      isActive: true,
      isLegacy: true,
      name,
      normalizedName,
      productCount: 1,
      sortOrder: 999,
    })
  })

  const categories = [...byKey.values()].sort((a, b) => {
    const byOrder = (a.sortOrder ?? 999) - (b.sortOrder ?? 999)
    return byOrder || a.name.localeCompare(b.name, 'es')
  })

  if (!options.onlyOperational) return categories

  return categories.filter((category) => category.isActive !== false && (category.productCount ?? 0) > 0)
}

export const filterCanteenProductsByCategory = (
  products: CanteenProduct[],
  selectedCategory: string,
) => {
  if (!selectedCategory || selectedCategory === allCanteenCategoriesKey) return products
  return products.filter((product) => getProductCategoryKey(product) === selectedCategory)
}
