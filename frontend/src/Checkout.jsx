import { useState, useEffect } from 'react'
import { apiFetch, logout, siteUrl } from './api'
import { useCatalog } from './catalog'
import { LangSwitch, useLang } from './i18n'
import { peekCache, useCachedGet } from './swr'
import Logo from './Logo'

function formatMDL(value) {
  return `${value.toFixed(2)} MDL`
}

export default function Checkout({ session, cart, onBack, onDone, onOpenLogin }) {
  const { t, tr, unit, lang } = useLang()
  // каталог — тот же, что на витрине: из кэша сразу, свежие цены в фоне (итог всё равно считает сервер)
  const { products, loading } = useCatalog(session, lang)
  const { data: config } = useCachedGet('/config')
  const cardEnabled = !!config?.cardPayments

  // телефон и адрес из профиля — чтобы не вводить каждый раз; из кэша — без ожидания сервера
  const cachedMe = session?.role === 'client' ? peekCache('/me') : null
  const [contactName, setContactName] = useState(session?.name || cachedMe?.name || '')
  const [phone, setPhone] = useState(cachedMe?.phone || '')
  const [address, setAddress] = useState(cachedMe?.address || '')
  const [comment, setComment] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (session?.role === 'client') {
      apiFetch('/me')
        .then((res) => (res.ok ? res.json() : null))
        .then((me) => {
          if (!me) return
          setContactName((v) => v || me.name)
          setPhone((v) => v || me.phone)
          setAddress((v) => v || me.address)
        })
        .catch(() => {})
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const lines = products.filter((p) => cart[p.id] && p.saleUnitPriceWithVat !== null)
  const total = lines.reduce((sum, p) => sum + cart[p.id] * p.saleUnitPriceWithVat, 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await apiFetch('/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: lines.map((p) => ({ productId: p.id, qty: cart[p.id] })),
          contactName,
          phone,
          address,
          comment,
          paymentMethod,
          lang, // письмо-подтверждение придёт на языке сайта
          siteUrl: siteUrl(), // сюда Stripe вернёт после оплаты
        }),
      })
      const data = await res.json().catch(() => null)
      if (!data) throw new Error(t('serverDown'))
      if (!res.ok) throw new Error(tr(data.error) || t('orderFailed'))
      onDone()
      if (data.paymentUrl) {
        // оплата картой: уходим на страницу Stripe
        window.location.assign(data.paymentUrl)
        return
      }
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const paymentOptions = [
    { id: 'cash', title: t('payCash'), desc: t('payCashDesc') },
    { id: 'invoice', title: t('payInvoice'), desc: t('payInvoiceDesc') },
    ...(cardEnabled ? [{ id: 'card', title: t('payCard'), desc: t('payCardDesc') }] : []),
  ]

  return (
    <div>
      <header className="header">
        <div className="header-inner">
          <Logo onClick={onBack} />
          <div style={{ flex: 1, fontSize: '18px', fontWeight: 600 }}>{t('checkoutTitle')}</div>
          <LangSwitch />
          {session && (
            <button className="btn btn-ghost" onClick={logout}>
              {t('logout')}
            </button>
          )}
        </div>
      </header>

      <main className="page" style={{ maxWidth: '1000px' }}>
        {result ? (
          <div className="panel" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: '48px', color: 'var(--yellow)' }}>✓</div>
            <h2>{t('orderDone', { id: result.id })}</h2>
            <p>{t('orderDoneText', { total: formatMDL(result.total) })}</p>
            <button className="btn btn-yellow" onClick={onBack}>
              {t('continueShopping')}
            </button>
          </div>
        ) : !session ? (
          <div className="panel" style={{ textAlign: 'center' }}>
            <p>{t('loginToOrder')}</p>
            <button className="btn btn-yellow" onClick={onOpenLogin}>
              {t('login')}
            </button>{' '}
            <button className="btn btn-ghost" style={{ color: 'var(--link)', borderColor: 'var(--border)' }} onClick={onBack}>
              {t('backToCatalog')}
            </button>
          </div>
        ) : session.role === 'admin' ? (
          <div className="panel" style={{ textAlign: 'center' }}>
            <p>{t('adminCantOrder')}</p>
            <button className="btn btn-yellow" onClick={logout}>
              {t('logout')}
            </button>{' '}
            <button className="btn btn-ghost" style={{ color: 'var(--link)', borderColor: 'var(--border)' }} onClick={onBack}>
              {t('backToCatalog')}
            </button>
          </div>
        ) : (
          <>
            <button className="link-btn" style={{ width: 'auto', textAlign: 'left' }} onClick={onBack}>
              {t('backToCatalog')}
            </button>

            {loading && <p>{t('loadingShort')}</p>}

            {!loading && lines.length === 0 ? (
              <div className="panel">
                <p>{t('emptyCheckout')}</p>
              </div>
            ) : (
              !loading && (
                <form onSubmit={handleSubmit} className="checkout-grid">
                  <div>
                    <div className="panel">
                      <h3>{t('deliveryData')}</h3>
                      <label className="field">
                        {t('contactName')}
                        <input value={contactName} onChange={(e) => setContactName(e.target.value)} required />
                      </label>
                      <label className="field">
                        {t('phone')}
                        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                      </label>
                      <label className="field">
                        {t('address')}
                        <input value={address} onChange={(e) => setAddress(e.target.value)} required />
                      </label>
                      <label className="field">
                        {t('comment')}
                        <input value={comment} onChange={(e) => setComment(e.target.value)} />
                      </label>
                    </div>

                    <div className="panel">
                      <h3>{t('paymentMethod')}</h3>
                      {paymentOptions.map((o) => (
                        <label key={o.id} className={'pay-option' + (paymentMethod === o.id ? ' selected' : '')}>
                          <input
                            type="radio"
                            name="payment"
                            checked={paymentMethod === o.id}
                            onChange={() => setPaymentMethod(o.id)}
                          />
                          <span>
                            <strong>{o.title}</strong>
                            <br />
                            <small>{o.desc}</small>
                          </span>
                        </label>
                      ))}
                      {!cardEnabled && (
                        <label className="pay-option disabled">
                          <input type="radio" disabled />
                          <span>
                            <strong>{t('payCard')}</strong> <small>({t('soon')})</small>
                          </span>
                        </label>
                      )}
                    </div>
                  </div>

                  <div className="panel summary">
                    <h3>{t('yourOrder')}</h3>
                    {lines.map((p) => (
                      <div key={p.id} className="summary-line">
                        <span>
                          {p.name}
                          <br />
                          <small>
                            {cart[p.id]} {unit(p.saleUnit)} × {formatMDL(p.saleUnitPriceWithVat)}
                          </small>
                        </span>
                        <strong>{formatMDL(cart[p.id] * p.saleUnitPriceWithVat)}</strong>
                      </div>
                    ))}
                    <div className="summary-total">
                      <span>{t('total')}</span>
                      <span>{formatMDL(total)}</span>
                    </div>

                    {error && <p className="form-error">{error}</p>}

                    <button type="submit" className="btn btn-yellow" style={{ width: '100%' }} disabled={busy}>
                      {busy ? (paymentMethod === 'card' ? t('redirecting') : t('placing')) : t('placeOrder')}
                    </button>
                  </div>
                </form>
              )
            )}
          </>
        )}
      </main>
    </div>
  )
}
