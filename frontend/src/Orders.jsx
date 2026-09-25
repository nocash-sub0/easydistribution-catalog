import { useState, useEffect } from 'react'
import { apiFetch } from './api'
import { useLang } from './i18n'

const STATUSES = ['new', 'pending_payment', 'paid', 'confirmed', 'shipped', 'delivered', 'cancelled']

export default function Orders() {
  const { t, tr, unit } = useLang()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [savingId, setSavingId] = useState(null)

  useEffect(() => {
    apiFetch('/orders')
      .then((res) => {
        if (!res.ok) throw new Error(t('serverError'))
        return res.json()
      })
      .then(setOrders)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const changeStatus = async (id, status) => {
    setSavingId(id)
    try {
      const res = await apiFetch(`/orders/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(tr(data?.error) || t('serverError'))
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)))
    } catch (err) {
      alert(err.message)
    } finally {
      setSavingId(null)
    }
  }

  const visible = statusFilter === 'all' ? orders : orders.filter((o) => o.status === statusFilter)

  return (
    <div style={{ padding: '20px' }}>
      <h1>{t('ordersTitle')}</h1>

      {orders.length > 0 && (
        <label style={{ display: 'block', marginBottom: '12px' }}>
          {t('colStatus')}:{' '}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">{t('allStatuses')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t('st_' + s)} ({orders.filter((o) => o.status === s).length})
              </option>
            ))}
          </select>
        </label>
      )}

      {loading && <p>{t('loadingShort')}</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {!loading && !error && visible.length === 0 && <p>{t('noOrders')}</p>}

      {visible.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', background: 'white' }}>
            <thead>
              <tr>
                <th>{t('orderNo')}</th>
                <th>{t('colDate')}</th>
                <th>{t('colCustomer')}</th>
                <th>{t('colContact')}</th>
                <th>{t('colPayment')}</th>
                <th>{t('colStatus')}</th>
                <th>{t('colItems')}</th>
                <th>{t('colTotal')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((o) => (
                <tr key={o.id} style={{ verticalAlign: 'top' }}>
                  <td>{o.id}</td>
                  <td>{new Date(o.createdAt).toLocaleString()}</td>
                  <td>{o.clientName}</td>
                  <td>
                    {o.contactName}
                    <br />
                    {o.phone}
                    <br />
                    {o.address}
                    {o.comment && (
                      <>
                        <br />
                        <em>{o.comment}</em>
                      </>
                    )}
                  </td>
                  <td>{t('pay_' + o.paymentMethod)}</td>
                  <td>
                    <select value={o.status} disabled={savingId === o.id} onChange={(e) => changeStatus(o.id, e.target.value)}>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {t('st_' + s)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {o.items.map((i, idx) => (
                      <div key={idx}>
                        {i.name} — {i.qty} {unit(i.saleUnit)} × {i.unitPrice.toFixed(2)}
                      </div>
                    ))}
                  </td>
                  <td>
                    <strong>{o.total.toFixed(2)} MDL</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
