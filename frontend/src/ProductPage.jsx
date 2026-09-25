import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from './api'
import { formatMDL, stockState, useCatalog } from './catalog'
import { LangSwitch, useLang } from './i18n'
import { categoryIcon, imageUrl } from './images'
import Logo from './Logo'
import { ProductCard } from './Storefront'

// Страница товара: /#/product/<id>
export default function ProductPage({ productId, session, cart, onChangeQty, onBack, onCheckout }) {
  const { t, lang, unit } = useLang()
  const { products, loading } = useCatalog(session, lang)
  const [description, setDescription] = useState({ key: null, text: '' })

  const product = products.find((p) => p.id === productId)
  const qty = cart[productId] || 0
  const cartCount = Object.values(cart).reduce((sum, n) => sum + n, 0)

  const descKey = `${productId}:${lang}`
  useEffect(() => {
    let cancelled = false
    apiFetch(`/products/${productId}/description?lang=${lang}`)
      .then((res) => (res.ok ? res.json() : { description: '' }))
      .then((data) => !cancelled && setDescription({ key: descKey, text: data.description || '' }))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [productId, lang, descKey])

  // похожие — из той же категории, сначала те, что в наличии
  const similar = useMemo(() => {
    if (!product) return []
    return products
      .filter((p) => p.categoryCode === product.categoryCode && p.id !== product.id)
      .sort((a, b) => Number(stockState(a, 0).outOfStock) - Number(stockState(b, 0).outOfStock))
      .slice(0, 4)
  }, [products, product])

  const header = (
    <header className="header">
      <div className="header-inner">
        <Logo onClick={onBack} />
        <div style={{ flex: 1 }} />
        <LangSwitch />
        <button className="btn btn-yellow" onClick={onCheckout}>
          {t('cart')}
          <span className="cart-badge">{cartCount}</span>
        </button>
      </div>
    </header>
  )

  if (!product) {
    return (
      <div>
        {header}
        <main className="page">
          <p>{loading ? t('loadingShort') : t('productNotFound')}</p>
          <button className="link-btn" style={{ width: 'auto' }} onClick={onBack}>
            {t('backToCatalog')}
          </button>
        </main>
      </div>
    )
  }

  const hasPrice = product.saleUnitPriceWithVat !== null
  const { outOfStock, lowStock, canAddMore } = stockState(product, qty)
  const src = imageUrl(product)

  return (
    <div>
      {header}
      <main className="page">
        <button className="link-btn" style={{ width: 'auto', textAlign: 'left' }} onClick={onBack}>
          {t('backToCatalog')}
        </button>

        <div className="product-page">
          <div className="product-photo">
            {src ? <img src={src} alt={product.name} /> : <span className="card-icon">{categoryIcon(product.categoryCode)}</span>}
          </div>

          <div className="product-info">
            <div className="card-cat">
              {product.category} · {product.code}
            </div>
            <h1 className="product-title">{product.name}</h1>
            {product.priceSource === 'client' && <span className="tag-inline">{t('specialPrice')}</span>}

            {hasPrice ? (
              <>
                <div className="price-main product-price">
                  {formatMDL(product.saleUnitPriceWithVat)} <small>/ {unit(product.saleUnit)}</small>
                </div>
                <table className="spec-table">
                  <tbody>
                    <tr>
                      <td>{t('pricePerUnit', { unit: unit(product.baseUnit) })}</td>
                      <td>{formatMDL(product.priceWithVat)}</td>
                    </tr>
                    <tr>
                      <td>{t('priceNoVat', { unit: unit(product.saleUnit) })}</td>
                      <td>{formatMDL(product.saleUnitPrice)}</td>
                    </tr>
                    <tr>
                      <td>{t('packSize')}</td>
                      <td>
                        {product.saleUnitFactor} {unit(product.baseUnit)} / {unit(product.saleUnit)}
                      </td>
                    </tr>
                    <tr>
                      <td>TVA</td>
                      <td>{product.vatRate}%</td>
                    </tr>
                    <tr>
                      <td>{t('availability')}</td>
                      <td className={outOfStock ? 'text-danger' : lowStock ? 'stock-low' : 'text-ok'}>
                        {outOfStock
                          ? t('outOfStock')
                          : lowStock
                            ? t('stockLeft', { n: product.stock, unit: unit(product.saleUnit) })
                            : t('inStock')}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </>
            ) : (
              <p className="price-sub">{t('priceOnRequest')}</p>
            )}

            <div className="product-buy">
              {qty > 0 ? (
                <>
                  <div className="qty">
                    <button onClick={() => onChangeQty(product.id, qty - 1)}>−</button>
                    <strong>{qty}</strong>
                    <button disabled={!canAddMore} onClick={() => onChangeQty(product.id, qty + 1)}>
                      +
                    </button>
                  </div>
                  <button className="btn btn-yellow" onClick={onCheckout}>
                    {t('checkout')}
                  </button>
                </>
              ) : (
                <button className="btn btn-yellow" disabled={!hasPrice || outOfStock} onClick={() => onChangeQty(product.id, 1)}>
                  {outOfStock ? t('outOfStock') : t('addToCart')}
                </button>
              )}
            </div>
          </div>
        </div>

        {description.key === descKey && description.text && (
          <div className="panel product-description">
            <h3>{t('description')}</h3>
            <p>{description.text}</p>
          </div>
        )}

        {similar.length > 0 && (
          <>
            <h3>{t('similarProducts')}</h3>
            <div className="grid">
              {similar.map((p) => (
                <ProductCard key={p.id} product={p} qty={cart[p.id] || 0} onChangeQty={onChangeQty} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
