import { useState, useEffect } from 'react'
import { apiFetch } from './api'
import { useLang } from './i18n'

export default function Orders() {
  const { t } = useLang()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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

  return (
    <div style={{ padding: '20px' }}>
      <h1>{t('ordersTitle')}</h1>

      {loading && <p>{t('loadingShort')}</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {!loading && !error && orders.length === 0 && <p>{t('noOrders')}</p>}

      {orders.length > 0 && (
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
              {orders.map((o) => (
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
                  <td>{t('st_' + o.status)}</td>
                  <td>
                    {o.items.map((i, idx) => (
                      <div key={idx}>
                        {i.name} — {i.qty} {i.saleUnit} × {i.unitPrice.toFixed(2)}
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
