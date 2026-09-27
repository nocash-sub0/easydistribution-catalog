import { useState } from 'react'
import { apiFetch } from './api'
import { useLang } from './i18n'
import { useCachedGet } from './swr'

// История заказов покупателя (вкладка в личном кабинете)
export default function MyOrders() {
  const { t, tr, unit } = useLang()
  const { data: orders, loading, error, mutate } = useCachedGet('/my/orders')
  const [busyId, setBusyId] = useState(null)
  const [cancelError, setCancelError] = useState(null)

  const cancelOrder = async (order) => {
    if (!window.confirm(t('confirmCancelOrder', { id: order.id }))) return
    setBusyId(order.id)
    setCancelError(null)
    try {
      const res = await apiFetch(`/my/orders/${order.id}/cancel`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(tr(data?.error) || t('serverError'))
      mutate((list) => list.map((o) => (o.id === order.id ? { ...o, status: 'cancelled', canCancel: false } : o)))
    } catch (err) {
      setCancelError({ id: order.id, message: err.message })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      {loading && <p>{t('loadingShort')}</p>}
      {error && <p className="form-error">{tr(error.serverError) || t('serverError')}</p>}
      {orders?.length === 0 && (
        <div className="panel">
          <p>{t('noMyOrders')}</p>
        </div>
      )}

      {orders?.map((o) => (
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

          {o.canCancel ? (
            <div className="order-actions">
              <button className="btn btn-danger-outline" disabled={busyId === o.id} onClick={() => cancelOrder(o)}>
                {busyId === o.id ? t('saving') : t('cancelOrder')}
              </button>
            </div>
          ) : (
            ['paid', 'confirmed', 'shipped'].includes(o.status) && <p className="muted order-hint">{t('cancelPaidHint')}</p>
          )}
          {cancelError?.id === o.id && <p className="form-error">{cancelError.message}</p>}
        </div>
      ))}
    </>
  )
}
