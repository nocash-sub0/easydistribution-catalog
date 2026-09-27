import { useState, useEffect, useMemo } from 'react'
import { logout } from './api'
import { formatMDL, stockState, useCatalog } from './catalog'
import { APP_NAME, LangSwitch, useLang } from './i18n'
import { categoryIcon, imageUrl } from './images'
import Logo from './Logo'
import { PriceMain, PromoBadge, PromoNote } from './Price'
import FilterPanel, { EMPTY_FILTERS, applyFilters, hasActiveFilters } from './Filters'

export function ProductCard({ product, qty, onChangeQty }) {
  const { t, unit } = useLang()
  const hasPrice = product.saleUnitPriceWithVat !== null
  const { outOfStock, lowStock, canAddMore } = stockState(product, qty)
  const productHref = `#/product/${product.id}`
  return (
    <div className={'card' + (outOfStock ? ' card-out' : '')}>
      {product.priceSource === 'client' && <span className="tag-special">{t('specialPrice')}</span>}
      <PromoBadge product={product} />
      <a className="card-img" href={productHref}>
        {imageUrl(product) ? (
          <img src={imageUrl(product)} alt={product.name} loading="lazy" />
        ) : (
          <span className="card-icon">{categoryIcon(product.categoryCode)}</span>
        )}
      </a>
      <div className="card-cat">
        {product.category} · {product.code}
      </div>
      <a className="card-name" href={productHref}>
        {product.name}
      </a>

      {hasPrice ? (
        <>
          <PriceMain product={product} />
          <PromoNote product={product} />
          <div className="price-sub">
            {formatMDL(product.priceWithVat)} / {unit(product.baseUnit)} · {t('inPack')} {product.saleUnitFactor}{' '}
            {unit(product.baseUnit)} · {t('vatIncluded')} {product.vatRate}%
          </div>
        </>
      ) : (
        <div className="price-sub">{t('priceOnRequest')}</div>
      )}

      {lowStock && (
        <div className="stock-low">{t('stockLeft', { n: product.stock, unit: unit(product.saleUnit) })}</div>
      )}

      {qty > 0 ? (
        <div className="qty">
          <button onClick={() => onChangeQty(product.id, qty - 1)}>−</button>
          <strong>{qty}</strong>
          <button disabled={!canAddMore} onClick={() => onChangeQty(product.id, qty + 1)}>
            +
          </button>
        </div>
      ) : (
        <button className="btn btn-yellow" disabled={!hasPrice || outOfStock} onClick={() => onChangeQty(product.id, 1)}>
          {outOfStock ? t('outOfStock') : t('addToCart')}
        </button>
      )}
    </div>
  )
}

// Сколько карточек показывать за раз: 800 карточек сразу заметно тормозят на телефонах
const PAGE_SIZE = 48

export default function Storefront({ session, cart, onChangeQty, onCheckout, onOpenLogin, onOpenAdmin, onOpenProfile, hidden }) {
  const { t, lang, unit } = useLang()
  const { products, loading, error, reload: fetchCatalog } = useCatalog(session, lang)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  // панель фильтров открыта по умолчанию на широком экране; выбор запоминаем
  const [filtersOpen, setFiltersOpen] = useState(() => {
    try {
      const saved = localStorage.getItem('filtersOpen')
      if (saved !== null) return saved === '1'
    } catch {
      // хранилище недоступно
    }
    return window.matchMedia('(min-width: 900px)').matches
  })
  const toggleFilters = (open) => {
    setFiltersOpen(open)
    try {
      localStorage.setItem('filtersOpen', open ? '1' : '0')
    } catch {
      // не критично
    }
  }

  const [showCart, setShowCart] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  // категории с переведёнными названиями и количеством товаров
  const categories = useMemo(() => {
    const map = new Map()
    for (const p of products) {
      const c = map.get(p.categoryCode) || { code: p.categoryCode, name: p.category, count: 0 }
      c.count++
      map.set(p.categoryCode, c)
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, lang))
  }, [products, lang])

  const promoCount = useMemo(() => products.filter((p) => p.promo).length, [products])

  const filtered = useMemo(
    () => applyFilters(products, filters, debouncedSearch, lang),
    [products, filters, debouncedSearch, lang]
  )

  // «Показать ещё»: при смене фильтров или поиска снова показываем первую страницу
  const filterKey = `${JSON.stringify(filters)}|${debouncedSearch}`
  const [more, setMore] = useState({ key: '', count: PAGE_SIZE })
  const limit = more.key === filterKey ? more.count : PAGE_SIZE
  const shown = filtered.slice(0, limit)

  const changeQty = onChangeQty

  const cartItems = products.filter((p) => cart[p.id])
  const cartCount = cartItems.reduce((sum, p) => sum + cart[p.id], 0)
  const cartTotal = cartItems.reduce((sum, p) => sum + cart[p.id] * (p.saleUnitPriceWithVat || 0), 0)

  return (
    <div hidden={hidden}>
      <div className="topbar">
        <div className="topbar-inner">
          <span>{t('footer')}</span>
          <LangSwitch />
        </div>
      </div>

      <header className="header">
        <div className="header-inner">
          <Logo
            onClick={() => {
              setFilters(EMPTY_FILTERS)
              setSearch('')
              setShowCart(false)
              window.scrollTo(0, 0)
            }}
          />

          <div className="search">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('search')} />
            <button className="search-btn" tabIndex={-1} aria-hidden="true">
              ⌕
            </button>
          </div>

          <div className="header-actions">
            {session ? (
              <>
                <span className="user-name">{session.name}</span>
                {session.role === 'admin' ? (
                  <button className="btn btn-ghost" onClick={onOpenAdmin}>
                    {t('adminPanel')}
                  </button>
                ) : (
                  <button className="btn btn-ghost" onClick={onOpenProfile}>
                    {t('profile')}
                  </button>
                )}
                <button className="btn btn-ghost" onClick={logout}>
                  {t('logout')}
                </button>
              </>
            ) : (
              <button className="btn btn-ghost" onClick={onOpenLogin}>
                {t('login')}
              </button>
            )}
            <button className="btn btn-yellow" onClick={() => setShowCart(!showCart)}>
              {t('cart')}
              <span className="cart-badge">{cartCount}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="page">
        {!session && (
          <div className="banner">
            <strong>{t('guestBanner')}</strong>
            <button className="btn btn-yellow" onClick={onOpenLogin}>
              {t('login')}
            </button>
          </div>
        )}

        {showCart && (
          <div className="panel">
            <h3>{t('cart')}</h3>
            {cartItems.length === 0 ? (
              <p>{t('cartEmpty')}</p>
            ) : (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {cartItems.map((p) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 0' }}>{p.name}</td>
                        <td>
                          {cart[p.id]} {unit(p.saleUnit)}
                        </td>
                        <td style={{ textAlign: 'right' }}>{formatMDL(cart[p.id] * p.saleUnitPriceWithVat)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button onClick={() => changeQty(p.id, 0)}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '18px' }}>
                  {t('total')}: {formatMDL(cartTotal)}
                </p>
                <div style={{ textAlign: 'right' }}>
                  <button className="btn btn-yellow" onClick={onCheckout}>
                    {t('checkout')}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {error && (
          <div className="error-box">
            <p style={{ color: 'var(--danger)' }}>
              {t('loadError')}: {error}
            </p>
            <button className="btn btn-yellow" onClick={fetchCatalog}>
              {t('retry')}
            </button>
          </div>
        )}

        {!error && loading && <p>{t('loading')}</p>}

        <div className="toolbar">
          <span className="results-line">{!error && !loading && `${t('productsCount')}: ${filtered.length}`}</span>
          <button
            className={'btn btn-light filters-toggle' + (hasActiveFilters(filters) ? ' has-active' : '')}
            onClick={() => toggleFilters(!filtersOpen)}
            aria-expanded={filtersOpen}
          >
            ☰ {filtersOpen ? t('hideFilters') : t('filters')}
          </button>
        </div>

        <div className={'shop-layout' + (filtersOpen ? ' with-filters' : '')}>
          <div className="shop-products">
            {!error && !loading && filtered.length === 0 && <p>{t('nothingFound')}</p>}

            <div className="grid">
              {shown.map((product) => (
                <ProductCard key={product.id} product={product} qty={cart[product.id] || 0} onChangeQty={changeQty} />
              ))}
            </div>

            {shown.length < filtered.length && (
              <div className="show-more">
                <button className="btn btn-yellow" onClick={() => setMore({ key: filterKey, count: limit + PAGE_SIZE })}>
                  {t('showMore', { n: shown.length, total: filtered.length })}
                </button>
              </div>
            )}
          </div>

          {filtersOpen && (
            <FilterPanel
              categories={categories}
              promoCount={promoCount}
              filters={filters}
              onChange={setFilters}
              onClose={() => toggleFilters(false)}
            />
          )}
        </div>
      </main>

      <footer className="footer">
        <div className="page" style={{ padding: 0 }}>
          © {new Date().getFullYear()} {APP_NAME} · {t('footer')}
        </div>
      </footer>
    </div>
  )
}
