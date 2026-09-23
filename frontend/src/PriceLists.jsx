import { useState, useEffect } from 'react'

function formatMDL(value) {
  if (value === null || value === undefined) return '—'
  return `${value.toFixed(2)} MDL`
}

export default function PriceLists() {
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
    fetch('${import.meta.env.VITE_API_URL}/price-lists')
      .then((res) => res.json())
      .then(setPriceLists)
  }

  const fetchClients = () => {
    fetch('${import.meta.env.VITE_API_URL}/clients')
      .then((res) => res.json())
      .then(setClients)
  }

  const fetchItems = (listId) => {
    setLoadingItems(true)
    fetch(`${import.meta.env.VITE_API_URL}/price-lists/${listId}/items`)
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
    await fetch('${import.meta.env.VITE_API_URL}/price-lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newListName }),
    })
    setNewListName('')
    fetchPriceLists()
  }

  const handleRename = async (id) => {
    await fetch(`${import.meta.env.VITE_API_URL}/price-lists/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: renameValue }),
    })
    setRenamingId(null)
    fetchPriceLists()
  }

  const handleDelete = async (id) => {
    if (!confirm('Удалить этот прайс-лист? Клиенты вернутся на дефолтный.')) return
    const res = await fetch(`${import.meta.env.VITE_API_URL}/price-lists/${id}`, { method: 'DELETE' })
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
    await fetch(`${import.meta.env.VITE_API_URL}/price-lists/${selectedListId}/assign`, {
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
    const res = await fetch(`${import.meta.env.VITE_API_URL}/price-lists/${selectedListId}/discount`, {
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
    const res = await fetch(`${import.meta.env.VITE_API_URL}/price-lists/${selectedListId}/discount`, {
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
      <h1>Списки цен</h1>

      <div style={{ display: 'flex', gap: '30px' }}>
        <div style={{ minWidth: '250px' }}>
          <h3>Прайс-листы</h3>
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
                    {pl.name} {pl.isDefault && '(implicit)'} — {pl.clientCount} клиент(ов)
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
              placeholder="Название нового листа"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
            />
            <button onClick={handleCreateList}>+ Создать</button>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          {!selectedListId && <p>Выбери прайс-лист слева, чтобы увидеть детали.</p>}

          {selectedListId && (
            <>
              <h3>Привязка клиентов</h3>
              <input
                placeholder="Поиск клиента..."
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
                        (сейчас: {priceLists.find((pl) => pl.id === c.priceListId)?.name || '—'})
                      </small>
                    </label>
                  </div>
                ))}
              </div>
              <button onClick={handleAssignClients} disabled={selectedClientIds.length === 0}>
                Привязать выбранных ({selectedClientIds.length}) к этому листу
              </button>

              <h3 style={{ marginTop: '24px' }}>Скидка на категорию</h3>
              <select value={discountCategory} onChange={(e) => setDiscountCategory(e.target.value)}>
                <option value="">Выбери категорию</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>{' '}
              <input
                type="number"
                placeholder="% скидки"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
                style={{ width: '80px' }}
              />{' '}
              <button onClick={handlePreviewDiscount}>Превью</button>

              {discountPreview && (
                <div style={{ border: '1px solid #ccc', padding: '10px', marginTop: '10px' }}>
                  <h4>Превью изменений</h4>
                  <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th>Товар</th>
                        <th>Было</th>
                        <th>Станет</th>
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
                    Подтвердить и сохранить
                  </button>{' '}
                  <button onClick={() => setDiscountPreview(null)}>Отмена</button>
                </div>
              )}

              <h3 style={{ marginTop: '24px' }}>
                Сравнение цен{' '}
                <label style={{ fontWeight: 'normal', fontSize: '14px' }}>
                  <input
                    type="checkbox"
                    checked={includeVat}
                    onChange={(e) => setIncludeVat(e.target.checked)}
                  />{' '}
                  показывать с TVA
                </label>
              </h3>

              {loadingItems ? (
                <p>Загрузка...</p>
              ) : (
                <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Товар</th>
                      <th>Категория</th>
                      <th>Цена</th>
                      <th>Отличие от базовой</th>
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
                            : '— (как базовая)'}
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