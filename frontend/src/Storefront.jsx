import { useState, useEffect, useMemo } from 'react'
import { apiFetch, logout } from './api'

function formatMDL(value) {
  if (value === null || value === undefined) return '—'
  return `${value.toFixed(2)} MDL`
}

function ProductCard({ product, qty, onChangeQty }) {
  const hasPrice = product.saleUnitPriceWithVat !== null
  return (
    <div style={{ background: 'white', borderRadius: '10px', padding: '14px', boxShadow: '0 1px 6px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: '110px', background: '#eef2f7', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '40px', color: '#9aa5b5' }}>
        {product.name.charAt(0).toUpperCase()}
      </div>
      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '10px' }}>{product.category} · {product.code}</div>
      <div style={{ fontWeight: 'bold', margin: '4px 0 8px', flexGrow: 1 }}>{product.name}</div>

      {hasPrice ? (
        <>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1d4ed8' }}>
            {formatMDL(product.saleUnitPriceWithVat)}
            <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#6b7280' }}> / {product.saleUnit}</span>
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>
            {formatMDL(product.priceWithVat)} / {product.baseUnit} · в {product.saleUnit} {product.saleUnitFactor} {product.baseUnit} · TVA {product.vatRate}%
          </div>
          {product.priceSource === 'client' && (
            <div style={{ fontSize: '11px', color: '#15803d', marginTop: '4px' }}>Ваша специальная цена</div>
          )}
        </>
      ) : (
        <div style={{ color: '#6b7280' }}>Цена по запросу</div>
      )}

      <div style={{ marginTop: '10px' }}>
        {qty > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
            <button onClick={() => onChangeQty(product.id, qty - 1)}>−</button>
            <strong>{qty}</strong>
            <button onClick={() => onChangeQty(product.id, qty + 1)}>+</button>
          </div>
        ) : (
          <button
            disabled={!hasPrice}
            onClick={() => onChangeQty(product.id, 1)}
            style={{ width: '100%', padding: '8px', background: hasPrice ? '#2563eb' : '#cbd5e1', color: 'white', border: 'none', borderRadius: '6px', cursor: hasPrice ? 'pointer' : 'default' }}
          >
            В корзину
          </button>
        )}
      </div>
    </div>
  )
}

export default function Storefront({ session }) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [category, setCategory] = useState('all')

  const [cart, setCart] = useState({})
  const [showCart, setShowCart] = useState(false)

  const fetchCatalog = () => {
    setLoading(true)
    setError(null)
    apiFetch('/catalog')
      .then((res) => {
        if (!res.ok) throw new Error('Сервер вернул ошибку')
        return res.json()
      })
      .then((data) => {
        setProducts(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }

  useEffect(fetchCatalog, [])

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

  const changeQty = (id, qty) => {
    setCart((prev) => {
      const next = { ...prev }
      if (qty <= 0) delete next[id]
      else next[id] = qty
      return next
    })
  }

  const cartItems = products.filter((p) => cart[p.id])
  const cartCount = cartItems.reduce((sum, p) => sum + cart[p.id], 0)
  const cartTotal = cartItems.reduce((sum, p) => sum + cart[p.id] * (p.saleUnitPriceWithVat || 0), 0)

  return (
    <div style={{ fontFamily: 'sans-serif', minHeight: '100vh', background: '#f3f4f6' }}>
      <header style={{ background: 'white', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', position: 'sticky', top: 0, zIndex: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>EasyDistribution</h2>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск товара..."
          style={{ flexGrow: 1, minWidth: '180px', padding: '9px', fontSize: '15px' }}
        />
        <span style={{ color: '#4b5563' }}>{session.clientName}</span>
        <button onClick={() => setShowCart(!showCart)}>
          Корзина ({cartCount}) · {formatMDL(cartTotal)}
        </button>
        <button onClick={logout}>Выйти</button>
      </header>

      <div style={{ padding: '20px 24px' }}>
        {showCart && (
          <div style={{ background: 'white', borderRadius: '10px', padding: '16px', marginBottom: '20px', boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}>
            <h3 style={{ marginTop: 0 }}>Корзина</h3>
            {cartItems.length === 0 ? (
              <p>Корзина пуста</p>
            ) : (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {cartItems.map((p) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '6px 0' }}>{p.name}</td>
                        <td>{cart[p.id]} {p.saleUnit}</td>
                        <td style={{ textAlign: 'right' }}>{formatMDL(cart[p.id] * p.saleUnitPriceWithVat)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button onClick={() => changeQty(p.id, 0)}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ textAlign: 'right', fontWeight: 'bold' }}>Итого с TVA: {formatMDL(cartTotal)}</p>
              </>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
          {['all', ...categories].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              style={{
                padding: '6px 14px',
                borderRadius: '16px',
                border: '1px solid #cbd5e1',
                background: category === cat ? '#2563eb' : 'white',
                color: category === cat ? 'white' : '#111',
                cursor: 'pointer',
              }}
            >
              {cat === 'all' ? 'Все' : cat}
            </button>
          ))}
        </div>

        {error && (
          <div style={{ padding: '20px', border: '1px solid red', borderRadius: '4px', background: 'white' }}>
            <p style={{ color: 'red' }}>Ошибка загрузки: {error}</p>
            <button onClick={fetchCatalog}>Повторить попытку</button>
          </div>
        )}

        {!error && loading && <p>Загрузка каталога...</p>}

        {!error && !loading && filtered.length === 0 && <p>Ничего не найдено.</p>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '16px' }}>
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} qty={cart[product.id] || 0} onChangeQty={changeQty} />
          ))}
        </div>
      </div>
    </div>
  )
}
