import { useState, useEffect, useMemo } from 'react'
import { logout } from './api'
import { formatMDL, stockState, useCatalog } from './catalog'
import { APP_NAME, LangSwitch, useLang } from './i18n'
import { categoryIcon, imageUrl } from './images'
import Logo from './Logo'

export function ProductCard({ product, qty, onChangeQty }) {
  const { t, unit } = useLang()
  const hasPrice = product.saleUnitPriceWithVat !== null
  const { outOfStock, lowStock, canAddMore } = stockState(product, qty)
  const productHref = `#/product/${product.id}`
  return (
    <div className={'card' + (outOfStock ? ' card-out' : '')}>
      {product.priceSource === 'client' && <span className="tag-special">{t('specialPrice')}</span>}
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
          <div className="price-main">
            {formatMDL(product.saleUnitPriceWithVat)} <small>/ {unit(product.saleUnit)}</small>
          </div>
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

export default function Storefront({ session, cart, onChangeQty, onCheckout, onOpenLogin, onOpenAdmin, onOpenMyOrders, hidden }) {
  const { t, lang, unit } = useLang()
  const { products, loading, error, reload: fetchCatalog } = useCatalog(session, lang)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [category, setCategory] = useState('all')

  const [showCart, setShowCart] = useState(false)

  // при смене языка категории приходят уже переведёнными — сбрасываем выбранную
  useEffect(() => {
    setCategory('all')
  }, [lang])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const categories = useMemo(() => [...new Set(products.map((p) => p.category))], [products])

  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          (category === 'all' || p.category === category) &&
          p.name.toLowerCase().includes(debouncedSearch.toLowerCase())
      ),
    [products, category, debouncedSearch]
  )

  // «Показать ещё»: при смене категории или поиска снова показываем первую страницу
  const filterKey = `${lang}|${category}|${debouncedSearch}`
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
              setCategory('all')
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
                  <button className="btn btn-ghost" onClick={onOpenMyOrders}>
                    {t('myOrders')}
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

      <nav className="catnav">
        <div className="catnav-inner">
          {['all', ...categories].map((cat) => (
            <button key={cat} className={category === cat ? 'active' : ''} onClick={() => setCategory(cat)}>
              {cat === 'all' ? t('allCategories') : cat}
            </button>
          ))}
        </div>
      </nav>

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
            <p style={{ color: '#dc2626' }}>
              {t('loadError')}: {error}
            </p>
            <button className="btn btn-yellow" onClick={fetchCatalog}>
              {t('retry')}
            </button>
          </div>
        )}

        {!error && loading && <p>{t('loading')}</p>}

        {!error && !loading && (
          <p className="results-line">
            {t('productsCount')}: {filtered.length}
          </p>
        )}

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
      </main>

      <footer className="footer">
        <div className="page" style={{ padding: 0 }}>
          © {new Date().getFullYear()} {APP_NAME} · {t('footer')}
        </div>
      </footer>
    </div>
  )
}
