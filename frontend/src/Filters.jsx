/* eslint-disable react-refresh/only-export-components */
import { useLang } from './i18n'

export const EMPTY_FILTERS = { categories: [], priceFrom: '', priceTo: '', inStock: false, sort: 'default' }

export function hasActiveFilters(f) {
  return f.categories.length > 0 || f.priceFrom !== '' || f.priceTo !== '' || f.inStock || f.sort !== 'default'
}

// Отбор и сортировка товаров по фильтрам. Категории храним по categoryCode — он не зависит от языка,
// поэтому выбор сохраняется при переключении RU/RO/EN, а подписи переводятся вместе с товарами
export function applyFilters(products, f, search, lang) {
  const q = search.toLowerCase()
  const from = f.priceFrom === '' ? null : Number(f.priceFrom)
  const to = f.priceTo === '' ? null : Number(f.priceTo)
  const priceFiltered = from !== null || to !== null

  const result = products.filter((p) => {
    if (f.categories.length && !f.categories.includes(p.categoryCode)) return false
    if (q && !p.name.toLowerCase().includes(q)) return false
    if (f.inStock && p.stock !== null && p.stock !== undefined && p.stock <= 0) return false
    if (priceFiltered) {
      const price = p.saleUnitPriceWithVat
      if (price === null) return false
      if (from !== null && price < from) return false
      if (to !== null && price > to) return false
    }
    return true
  })

  // товары без цены при сортировке по цене всегда в конце
  const byPrice = (dir) => (a, b) => {
    const pa = a.saleUnitPriceWithVat
    const pb = b.saleUnitPriceWithVat
    if (pa === null) return pb === null ? 0 : 1
    if (pb === null) return -1
    return (pa - pb) * dir
  }
  if (f.sort === 'priceAsc') result.sort(byPrice(1))
  else if (f.sort === 'priceDesc') result.sort(byPrice(-1))
  else if (f.sort === 'name') result.sort((a, b) => a.name.localeCompare(b.name, lang))
  return result
}

export default function FilterPanel({ categories, filters, onChange, onClose }) {
  const { t } = useLang()
  const set = (patch) => onChange({ ...filters, ...patch })

  const toggleCategory = (code) =>
    set({
      categories: filters.categories.includes(code)
        ? filters.categories.filter((c) => c !== code)
        : [...filters.categories, code],
    })

  return (
    <aside className="filters">
      <div className="filters-head">
        <h3>{t('filters')}</h3>
        <button className="filters-close" onClick={onClose} aria-label={t('hideFilters')}>
          ✕
        </button>
      </div>

      <div className="filter-group">
        <div className="filter-title">{t('sortBy')}</div>
        <select value={filters.sort} onChange={(e) => set({ sort: e.target.value })}>
          <option value="default">{t('sortDefault')}</option>
          <option value="priceAsc">{t('sortPriceAsc')}</option>
          <option value="priceDesc">{t('sortPriceDesc')}</option>
          <option value="name">{t('sortName')}</option>
        </select>
      </div>

      <div className="filter-group">
        <div className="filter-title">{t('priceMdl')}</div>
        <div className="price-range">
          <input
            type="number"
            min="0"
            inputMode="decimal"
            placeholder={t('priceFrom')}
            value={filters.priceFrom}
            onChange={(e) => set({ priceFrom: e.target.value })}
          />
          <span>—</span>
          <input
            type="number"
            min="0"
            inputMode="decimal"
            placeholder={t('priceTo')}
            value={filters.priceTo}
            onChange={(e) => set({ priceTo: e.target.value })}
          />
        </div>
      </div>

      <div className="filter-group">
        <label className="filter-check">
          <input type="checkbox" checked={filters.inStock} onChange={(e) => set({ inStock: e.target.checked })} />
          {t('inStockOnly')}
        </label>
      </div>

      <div className="filter-group">
        <div className="filter-title">{t('categoryLabel')}</div>
        {categories.map((c) => (
          <label key={c.code} className="filter-check">
            <input
              type="checkbox"
              checked={filters.categories.includes(c.code)}
              onChange={() => toggleCategory(c.code)}
            />
            <span className="filter-check-label">{c.name}</span>
            <span className="filter-count">{c.count}</span>
          </label>
        ))}
      </div>

      <button className="btn btn-light filters-reset" disabled={!hasActiveFilters(filters)} onClick={() => onChange(EMPTY_FILTERS)}>
        {t('resetFilters')}
      </button>
    </aside>
  )
}
