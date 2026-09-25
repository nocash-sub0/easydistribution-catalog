import { useState, useEffect } from 'react'
import { apiFetch, logout } from './api'
import { LangSwitch, useLang } from './i18n'
import Logo from './Logo'

// Страница «Мои заказы» для вошедшего покупателя
export default function MyOrders({ onBack }) {
  const { t, unit } = useLang()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    apiFetch('/my/orders')
      .then((res) => {
        if (!res.ok) throw new Error(t('serverError'))
        return res.json()
      })
      .then(setOrders)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <header className="header">
        <div className="header-inner">
          <Logo onClick={onBack} />
          <div style={{ flex: 1, fontSize: '18px', fontWeight: 600 }}>{t('myOrders')}</div>
          <LangSwitch />
          <button className="btn btn-ghost" onClick={logout}>
            {t('logout')}
          </button>
        </div>
      </header>

      <main className="page" style={{ maxWidth: '900px' }}>
        <button className="link-btn" style={{ width: 'auto', textAlign: 'left' }} onClick={onBack}>
          {t('backToCatalog')}
        </button>

        {loading && <p>{t('loadingShort')}</p>}
        {error && <p className="form-error">{error}</p>}
        {!loading && !error && orders.length === 0 && (
          <div className="panel">
            <p>{t('noMyOrders')}</p>
          </div>
        )}

        {orders.map((o) => (
          <div key={o.id} className="panel order-card">
            <div className="order-head">
              <strong>
                {t('orderNo')} {o.id}
              </strong>
              <span className="muted">{new Date(o.createdAt).toLocaleString()}</span>
              <span className={'status-badge st-' + o.status}>{t('st_' + o.status)}</span>
            </div>
            {o.items.map((i, idx) => (
              <div key={idx} className="summary-line">
                <span>
                  {i.name}
                  <br />
                  <small>
                    {i.qty} {unit(i.saleUnit)} × {i.unitPrice.toFixed(2)} MDL
                  </small>
                </span>
                <strong>{(i.qty * i.unitPrice).toFixed(2)} MDL</strong>
              </div>
            ))}
            <div className="summary-total">
              <span>
                {t('total')} · {t('pay_' + o.paymentMethod)}
              </span>
              <span>{o.total.toFixed(2)} MDL</span>
            </div>
          </div>
        ))}
      </main>
    </div>
  )
}
