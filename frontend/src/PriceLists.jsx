import { useState, useEffect } from 'react'
import { apiFetch } from './api'
import { useLang } from './i18n'

function formatMDL(value) {
  if (value === null || value === undefined) return '—'
  return `${value.toFixed(2)} MDL`
}

export default function PriceLists() {
  const { t } = useLang()
  const [priceLists, setPriceLists] = useState([])
  const [selectedListId, setSelectedListId] = useState(null)
  const [items, setItems] = useState([])
  const [loadingItems, setLoadingItems] = useState(false)

  const [clients, setClients] = useState([])
  const [clientSearch, setClientSearch] = useState('')
  const [selectedClientIds, setSelectedClientIds] = useState([])

  const [newListName, setNewListName] = useState('')
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')

  const [includeVat, setIncludeVat] = useState(false)

  const [discountCategory, setDiscountCategory] = useState('')
  const [discountPercent, setDiscountPercent] = useState('')
  const [discountPreview, setDiscountPreview] = useState(null)

  const fetchPriceLists = () => {
    apiFetch(`/price-lists`)
      .then((res) => res.json())
      .then(setPriceLists)
  }

  const fetchClients = () => {
    apiFetch(`/clients`)
      .then((res) => res.json())
      .then(setClients)
  }

  const fetchItems = (listId) => {
    setLoadingItems(true)
    apiFetch(`/price-lists/${listId}/items`)
      .then((res) => res.json())
      .then((data) => {
        setItems(data)
        setLoadingItems(false)
      })
  }

  useEffect(() => {
    fetchPriceLists()
    fetchClients()
  }, [])

  useEffect(() => {
    if (selectedListId) fetchItems(selectedListId)
  }, [selectedListId])

  const handleCreateList = async () => {
    if (!newListName.trim()) return
    await apiFetch(`/price-lists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newListName }),
    })
    setNewListName('')
    fetchPriceLists()
  }

  const handleRename = async (id) => {
    await apiFetch(`/price-lists/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: renameValue }),
    })
    setRenamingId(null)
    fetchPriceLists()
  }

  const handleDelete = async (id) => {
    if (!confirm(t('confirmDeleteList'))) return
    const res = await apiFetch(`/price-lists/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) {
      alert(data.error)
      return
    }
    if (selectedListId === id) setSelectedListId(null)
    fetchPriceLists()
    fetchClients()
  }

  const handleAssignClients = async () => {
    if (!selectedListId || selectedClientIds.length === 0) return
    await apiFetch(`/price-lists/${selectedListId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientIds: selectedClientIds }),
    })
    setSelectedClientIds([])
    fetchClients()
    fetchPriceLists()
  }

  const toggleClientSelection = (clientId) => {
    setSelectedClientIds((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]
    )
  }

  const filteredClients = clients.filter((c) =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase())
  )

  const categories = [...new Set(items.map((i) => i.category))]

  const handlePreviewDiscount = async () => {
    if (!discountCategory || !discountPercent) return
    const res = await apiFetch(`/price-lists/${selectedListId}/discount`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: discountCategory,
        percent: parseFloat(discountPercent),
        apply: false,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      alert(data.error)
      return
    }
    setDiscountPreview(data.preview)
  }

  const handleApplyDiscount = async () => {
    const res = await apiFetch(`/price-lists/${selectedListId}/discount`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: discountCategory,
        percent: parseFloat(discountPercent),
        apply: true,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      alert(data.error)
      return
    }
    setDiscountPreview(null)
    setDiscountCategory('')
    setDiscountPercent('')
    fetchItems(selectedListId)
  }

  const displayPrice = (item) => {
    if (item.price === null) return '—'
    const value = includeVat ? item.price * (1 + item.vatRate / 100) : item.price
    return formatMDL(value)
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>{t('adminPriceLists')}</h1>

      <div style={{ display: 'flex', gap: '30px' }}>
        <div style={{ minWidth: '250px' }}>
          <h3>{t('priceListsHeading')}</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {priceLists.map((pl) => (
              <li
                key={pl.id}
                style={{
                  padding: '8px',
                  cursor: 'pointer',
                  background: selectedListId === pl.id ? '#e0f0ff' : 'transparent',
                  border: '1px solid #ddd',
                  marginBottom: '4px',
                }}
              >
                {renamingId === pl.id ? (
                  <span>
                    <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
                    <button onClick={() => handleRename(pl.id)}>✓</button>
                    <button onClick={() => setRenamingId(null)}>✕</button>
                  </span>
                ) : (
                  <span onClick={() => setSelectedListId(pl.id)}>
                    {pl.name} {pl.isDefault && '(implicit)'} — {pl.clientCount} {t('clientsCount')}
                  </span>
                )}

                {!pl.isDefault && renamingId !== pl.id && (
                  <span style={{ float: 'right' }}>
                    <button
                      onClick={() => {
                        setRenamingId(pl.id)
                        setRenameValue(pl.name)
                      }}
                    >
                      ✏️
                    </button>
                    <button onClick={() => handleDelete(pl.id)}>🗑</button>
                  </span>
                )}
              </li>
            ))}
          </ul>

          <div style={{ marginTop: '10px' }}>
            <input
              placeholder={t('newListPh')}
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
            />
            <button onClick={handleCreateList}>{t('createList')}</button>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          {!selectedListId && <p>{t('selectList')}</p>}

          {selectedListId && (
            <>
              <h3>{t('bindClients')}</h3>
              <input
                placeholder={t('clientSearchPh')}
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
              />
              <div
                style={{
                  maxHeight: '150px',
                  overflow: 'auto',
                  border: '1px solid #ddd',
                  margin: '8px 0',
                }}
              >
                {filteredClients.map((c) => (
                  <div key={c.id} style={{ padding: '4px' }}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedClientIds.includes(c.id)}
                        onChange={() => toggleClientSelection(c.id)}
                      />{' '}
                      {c.name}{' '}
                      <small style={{ color: '#888' }}>
                        ({t('currently')}: {priceLists.find((pl) => pl.id === c.priceListId)?.name || '—'})
                      </small>
                    </label>
                  </div>
                ))}
              </div>
              <button onClick={handleAssignClients} disabled={selectedClientIds.length === 0}>
                {t('bindSelected', { n: selectedClientIds.length })}
              </button>

              <h3 style={{ marginTop: '24px' }}>{t('categoryDiscount')}</h3>
              <select value={discountCategory} onChange={(e) => setDiscountCategory(e.target.value)}>
                <option value="">{t('chooseCategory')}</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>{' '}
              <input
                type="number"
                placeholder={t('discountPh')}
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
                style={{ width: '80px' }}
              />{' '}
              <button onClick={handlePreviewDiscount}>{t('previewBtn')}</button>

              {discountPreview && (
                <div style={{ border: '1px solid #ccc', padding: '10px', marginTop: '10px' }}>
                  <h4>{t('previewChanges')}</h4>
                  <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th>{t('colProduct')}</th>
                        <th>{t('colWas')}</th>
                        <th>{t('colBecomes')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {discountPreview.map((p) => (
                        <tr key={p.productId}>
                          <td>{p.name}</td>
                          <td>{formatMDL(p.oldPrice)}</td>
                          <td>{formatMDL(p.newPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button onClick={handleApplyDiscount} style={{ marginTop: '8px' }}>
                    {t('confirmSave')}
                  </button>{' '}
                  <button onClick={() => setDiscountPreview(null)}>{t('cancel')}</button>
                </div>
              )}

              <h3 style={{ marginTop: '24px' }}>
                {t('priceCompare')}{' '}
                <label style={{ fontWeight: 'normal', fontSize: '14px' }}>
                  <input
                    type="checkbox"
                    checked={includeVat}
                    onChange={(e) => setIncludeVat(e.target.checked)}
                  />{' '}
                  {t('showWithVat')}
                </label>
              </h3>

              {loadingItems ? (
                <p>{t('loadingShort')}</p>
              ) : (
                <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr>
                      <th>{t('colProduct')}</th>
                      <th>{t('colCategory')}</th>
                      <th>{t('colPrice')}</th>
                      <th>{t('colDiff')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr
                        key={item.productId}
                        style={{
                          background: item.isOverridden
                            ? item.diffAmount < 0
                              ? '#e5ffe5'
                              : '#fff5e5'
                            : 'white',
                        }}
                      >
                        <td>{item.name}</td>
                        <td>{item.category}</td>
                        <td>{displayPrice(item)}</td>
                        <td>
                          {item.isOverridden
                            ? `${item.diffAmount > 0 ? '+' : ''}${item.diffAmount} MDL (${item.diffPercent}%)`
                            : t('asBase')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}