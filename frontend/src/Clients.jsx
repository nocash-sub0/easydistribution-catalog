import { useState, useEffect, useMemo } from 'react'
import { apiFetch } from './api'
import { useLang } from './i18n'

// Вкладка «Клиенты» в админке
export default function Clients() {
  const { t, tr } = useLang()
  const [clients, setClients] = useState([])
  const [priceLists, setPriceLists] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState(null)
  // новый пароль показываем один раз прямо в таблице: { clientId, password }
  const [issued, setIssued] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const load = () =>
    Promise.all([apiFetch('/admin/clients').then((r) => r.json()), apiFetch('/price-lists').then((r) => r.json())])
      .then(([c, pl]) => {
        setClients(c)
        setPriceLists(pl)
      })
      .catch(() => setError(t('serverError')))
      .finally(() => setLoading(false))

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const defaultList = priceLists.find((p) => p.isDefault)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return clients
    return clients.filter((c) => [c.name, c.login, c.email].some((v) => v && v.toLowerCase().includes(q)))
  }, [clients, search])

  const run = async (clientId, action) => {
    setBusyId(clientId)
    try {
      await action()
    } catch (err) {
      alert(tr(err.message))
    } finally {
      setBusyId(null)
    }
  }

  const changeList = (client, listId) =>
    run(client.id, async () => {
      const res = await apiFetch(`/price-lists/${listId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientIds: [client.id] }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || t('serverError'))
      setClients((prev) => prev.map((c) => (c.id === client.id ? { ...c, priceListId: Number(listId) } : c)))
    })

  const resetPassword = (client) =>
    run(client.id, async () => {
      const res = await apiFetch(`/admin/clients/${client.id}/reset-password`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || t('serverError'))
      setIssued({ clientId: client.id, password: data.password })
    })

  const remove = (client) =>
    run(client.id, async () => {
      const res = await apiFetch(`/admin/clients/${client.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || t('serverError'))
      setClients((prev) => prev.filter((c) => c.id !== client.id))
      setConfirmDelete(null)
    })

  return (
    <div style={{ padding: '20px' }}>
      <h1>{t('clientsTitle')}</h1>

      <input
        placeholder={t('clientSearchPh')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ padding: '8px', width: '100%', maxWidth: '360px', marginBottom: '12px' }}
      />

      {loading && <p>{t('loadingShort')}</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {!loading && !error && (
        <div style={{ overflowX: 'auto' }}>
          <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', background: 'white' }}>
            <thead>
              <tr>
                <th>{t('colName')}</th>
                <th>{t('colLogin')}</th>
                <th>{t('adminPriceLists')}</th>
                <th>{t('adminOrders')}</th>
                <th>{t('colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} style={{ verticalAlign: 'top' }}>
                  <td>{c.name}</td>
                  <td>
                    {c.login || '—'}
                    {c.email && c.email !== c.login && (
                      <>
                        <br />
                        <small style={{ color: '#888' }}>{c.email}</small>
                      </>
                    )}
                  </td>
                  <td>
                    <select
                      value={c.priceListId || defaultList?.id || ''}
                      disabled={busyId === c.id}
                      onChange={(e) => changeList(c, e.target.value)}
                    >
                      {priceLists.map((pl) => (
                        <option key={pl.id} value={pl.id}>
                          {pl.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {c.orderCount}
                    {c.orderCount > 0 && <small style={{ color: '#888' }}> · {c.orderTotal.toFixed(2)} MDL</small>}
                  </td>
                  <td>
                    {issued?.clientId === c.id ? (
                      <div>
                        {t('newPasswordIs')}: <code style={{ fontSize: '15px', userSelect: 'all' }}>{issued.password}</code>
                        <br />
                        <small style={{ color: '#888' }}>{t('passwordShownOnce')}</small>
                      </div>
                    ) : confirmDelete === c.id ? (
                      <span>
                        {t('confirmDeleteClient')}{' '}
                        <button disabled={busyId === c.id} onClick={() => remove(c)}>
                          {t('yesDelete')}
                        </button>{' '}
                        <button onClick={() => setConfirmDelete(null)}>{t('cancel')}</button>
                      </span>
                    ) : (
                      <span>
                        <button disabled={busyId === c.id} onClick={() => resetPassword(c)}>
                          {t('resetPassword')}
                        </button>{' '}
                        <button disabled={busyId === c.id || c.orderCount > 0} title={c.orderCount > 0 ? t('hasOrdersHint') : ''} onClick={() => setConfirmDelete(c.id)}>
                          {t('delete')}
                        </button>
                      </span>
                    )}
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
