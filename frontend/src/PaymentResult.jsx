import { useState, useEffect } from 'react'
import { apiFetch } from './api'
import { LangSwitch, useLang } from './i18n'
import Logo from './Logo'

// Страница, на которую Stripe возвращает клиента после оплаты (?payment=success|cancelled&order=ID)
export default function PaymentResult({ session, onBack }) {
  const { t } = useLang()
  const params = new URLSearchParams(window.location.search)
  const orderId = params.get('order')
  const cancelled = params.get('payment') === 'cancelled'

  const [status, setStatus] = useState(cancelled ? 'cancelled' : 'pending_payment')

  // Платёж подтверждается на стороне Stripe, поэтому несколько раз уточняем статус заказа
  useEffect(() => {
    if (cancelled || !session || !orderId) return
    let attempts = 0
    let timer

    const check = () => {
      apiFetch(`/orders/${orderId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((order) => {
          if (order) setStatus(order.status)
          if (order?.status === 'pending_payment' && ++attempts < 10) timer = setTimeout(check, 2000)
        })
        .catch(() => {})
    }
    check()
    return () => clearTimeout(timer)
  }, [cancelled, session, orderId])

  const view =
    status === 'paid'
      ? { icon: '✓', color: 'var(--yellow)', title: t('payOkTitle'), text: t('payOkText', { id: orderId }) }
      : status === 'pending_payment'
        ? { icon: '…', color: 'var(--muted)', title: t('payPendingTitle'), text: t('payPendingText', { id: orderId }) }
        : { icon: '✕', color: '#dc2626', title: t('payCancelTitle'), text: t('payCancelText', { id: orderId }) }

  return (
    <div>
      <header className="header">
        <div className="header-inner">
          <Logo onClick={onBack} />
          <div style={{ flex: 1 }} />
          <LangSwitch />
        </div>
      </header>
      <main className="page" style={{ maxWidth: '640px' }}>
        <div className="panel" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: '48px', color: view.color }}>{view.icon}</div>
          <h2>{view.title}</h2>
          <p>{view.text}</p>
          <button className="btn btn-yellow" onClick={onBack}>
            {t('continueShopping')}
          </button>
        </div>
      </main>
    </div>
  )
}
