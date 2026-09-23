import { useState, useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import Papa from 'papaparse'
import PriceLists from './PriceLists'

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i}>
          <div
            style={{
              height: '16px',
              background: '#e0e0e0',
              borderRadius: '4px',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
        </td>
      ))}
    </tr>
  )
}

function VirtualizedTable({ products, editingId, setEditingId, handlePriceSave }) {
  const parentRef = useRef(null)

  const rowVirtualizer = useVirtualizer({
    count: products.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 45,
    overscan: 10,
  })

  return (
    <div>
      <div style={{ display: 'flex', fontWeight: 'bold', borderBottom: '2px solid #333', padding: '8px 0' }}>
        <div style={{ width: '220px' }}>Название</div>
        <div style={{ width: '120px' }}>Категория</div>
        <div style={{ width: '100px' }}>Цена/buc</div>
        <div style={{ width: '120px' }}>Цена+TVA</div>
        <div style={{ width: '180px' }}>Цена за bax</div>
        <div style={{ width: '60px' }}>TVA</div>
        <div style={{ width: '100px' }}>Источник</div>
      </div>

      <div
        ref={parentRef}
        style={{
          height: '500px',
          overflow: 'auto',
          border: '1px solid #ccc',
        }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const product = products[virtualRow.index]
            return (
              <div
                key={product.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                  display: 'flex',
                  alignItems: 'center',
                  borderBottom: '1px solid #eee',
                }}
              >
                <div style={{ width: '220px' }}>{product.name}</div>
                <div style={{ width: '120px' }}>{product.category}</div>
                <div style={{ width: '100px' }} onClick={() => setEditingId(product.id)}>
                  {editingId === product.id ? (
                    <input
                      type="number"
                      step="0.01"
                      autoFocus
                      defaultValue={product.price}
                      onBlur={(e) => {
                        const newPrice = parseFloat(e.target.value)
                        if (!isNaN(newPrice)) {
                          handlePriceSave(product.id, newPrice)
                        } else {
                          setEditingId(null)
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.target.blur()
                      }}
                      style={{ width: '70px' }}
                    />
                  ) : (
                    `${product.price} MDL`
                  )}
                </div>
                <div style={{ width: '120px' }}>{product.priceWithVat} MDL</div>
                <div style={{ width: '180px' }}>
                  {product.saleUnitPrice} MDL / {product.saleUnit} ({product.saleUnitFactor})
                </div>
                <div style={{ width: '60px' }}>{product.vatRate}%</div>
                <div style={{ width: '100px' }}>{product.priceSource}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function App() {
  const [activeTab, setActiveTab] = useState('catalog')

  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [clientId, setClientId] = useState('')
  const [editingId, setEditingId] = useState(null)

  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')

  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    category: '',
    baseUnit: 'buc',
    saleUnit: 'bax',
    saleUnitFactor: '',
    vatRate: '',
    price: '',
  })
  const [formError, setFormError] = useState(null)

  const [csvRows, setCsvRows] = useState([])
  const [csvValidation, setCsvValidation] = useState([])
  const [importResult, setImportResult] = useState(null)
  const [showCsvImport, setShowCsvImport] = useState(false)

  const fetchCatalog = () => {
    setLoading(true)
    setError(null)
    const url = clientId
      ? `http://localhost:3000/catalog?clientId=${clientId}`
      : `http://localhost:3000/catalog`

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('Сервер вернул ошибку')
        return res.json()
      })
      .then((data) => {
        setProducts(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchCatalog()
  }, [clientId])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const handlePriceSave = async (productId, newPrice) => {
    try {
      const res = await fetch(`http://localhost:3000/catalog/${productId}/price`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price: newPrice }),
      })
      if (!res.ok) throw new Error('Не удалось сохранить цену')
      fetchCatalog()
    } catch (err) {
      alert('Ошибка сохранения: ' + err.message)
    } finally {
      setEditingId(null)
    }
  }

  const handleFormSubmit = async (e) => {
    e.preventDefault()
    setFormError(null)

    try {
      const res = await fetch('http://localhost:3000/catalog/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          saleUnitFactor: parseFloat(formData.saleUnitFactor),
          vatRate: parseFloat(formData.vatRate),
          price: parseFloat(formData.price),
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка при добавлении товара')

      setFormData({
        code: '',
        name: '',
        category: '',
        baseUnit: 'buc',
        saleUnit: 'bax',
        saleUnitFactor: '',
        vatRate: '',
        price: '',
      })
      setShowForm(false)
      fetchCatalog()
    } catch (err) {
      setFormError(err.message)
    }
  }

  function validateCsvRow(row) {
    const errors = []
    if (!row.code) errors.push('код обязателен')
    if (!row.name) errors.push('название обязательно')
    if (!row.category) errors.push('категория обязательна')

    const vatRate = parseFloat(row.vatRate)
    if (isNaN(vatRate) || vatRate < 0 || vatRate > 100) {
      errors.push('cotă TVA invalidă')
    }

    const saleUnitFactor = parseFloat(row.saleUnitFactor)
    if (isNaN(saleUnitFactor) || saleUnitFactor <= 0) {
      errors.push('некорректный коэффициент единицы продажи')
    }

    const price = parseFloat(row.price)
    if (isNaN(price) || price < 0) {
      errors.push('некорректная цена')
    }

    return errors
  }

  const handleCsvFile = (e) => {
    const file = e.target.files[0]
    if (!file) return

    setImportResult(null)

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data
        const validation = rows.map((row, index) => ({
          rowNumber: index + 2,
          row,
          errors: validateCsvRow(row),
        }))
        setCsvRows(rows)
        setCsvValidation(validation)
      },
    })
  }

  const handleCsvImport = async () => {
    const validRows = csvValidation.filter((v) => v.errors.length === 0).map((v) => v.row)

    try {
      const res = await fetch('http://localhost:3000/catalog/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: validRows }),
      })
      const data = await res.json()
      setImportResult(data)
      fetchCatalog()
    } catch (err) {
      alert('Ошибка импорта: ' + err.message)
    }
  }

  const categories = [...new Set(products.map((p) => p.category))]

  const filteredProducts = products.filter((product) => {
    const matchesCategory =
      categoryFilter === 'all' || product.category === categoryFilter
    const matchesSearch = product.name
      .toLowerCase()
      .includes(debouncedSearch.toLowerCase())
    return matchesCategory && matchesSearch
  })

  return (
    <div>
      <div style={{ padding: '20px 20px 0 20px', fontFamily: 'sans-serif' }}>
        <button
          onClick={() => setActiveTab('catalog')}
          style={{ fontWeight: activeTab === 'catalog' ? 'bold' : 'normal' }}
        >
          Каталог
        </button>{' '}
        <button
          onClick={() => setActiveTab('pricelists')}
          style={{ fontWeight: activeTab === 'pricelists' ? 'bold' : 'normal' }}
        >
          Списки цен
        </button>
      </div>

      {activeTab === 'pricelists' ? (
        <PriceLists />
      ) : (
        <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
          <style>{`
            @keyframes pulse {
              0% { opacity: 1; }
              50% { opacity: 0.4; }
              100% { opacity: 1; }
            }
          `}</style>

          <h1>Каталог товаров</h1>

          <div style={{ marginBottom: '10px', display: 'flex', gap: '16px', alignItems: 'center' }}>
            <label>
              Клиент:{' '}
              <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Без клиента (дефолт)</option>
                <option value="client-vip">Client VIP</option>
                <option value="client-mic">Client Mic</option>
              </select>
            </label>

            <label>
              Категория:{' '}
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="all">Все категории</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Поиск:{' '}
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Название товара..."
              />
            </label>

            <button onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Отмена' : '+ Добавить товар'}
            </button>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <button onClick={() => setShowCsvImport(!showCsvImport)}>
              {showCsvImport ? 'Скрыть импорт CSV' : 'Импорт CSV'}
            </button>

            {showCsvImport && (
              <div style={{ border: '1px solid #ccc', padding: '16px', marginTop: '10px', maxWidth: '700px' }}>
                <p>
                  Ожидаемые колонки: code, name, category, baseUnit, saleUnit, saleUnitFactor, vatRate, price
                </p>
                <input type="file" accept=".csv" onChange={handleCsvFile} />

                {csvValidation.length > 0 && (
                  <>
                    <h4>Превью ({csvValidation.length} строк)</h4>
                    <div style={{ maxHeight: '300px', overflow: 'auto' }}>
                      <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>
                        <thead>
                          <tr>
                            <th>Строка</th>
                            <th>Код</th>
                            <th>Название</th>
                            <th>Статус</th>
                          </tr>
                        </thead>
                        <tbody>
                          {csvValidation.map((v) => (
                            <tr key={v.rowNumber} style={{ background: v.errors.length > 0 ? '#ffe5e5' : 'white' }}>
                              <td>{v.rowNumber}</td>
                              <td>{v.row.code || '—'}</td>
                              <td>{v.row.name || '—'}</td>
                              <td>{v.errors.length === 0 ? '✅ OK' : `❌ ${v.errors.join(', ')}`}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <p style={{ marginTop: '10px' }}>
                      Валидных строк: {csvValidation.filter((v) => v.errors.length === 0).length} из{' '}
                      {csvValidation.length}
                    </p>

                    <button onClick={handleCsvImport}>Импортировать валидные строки</button>
                  </>
                )}

                {importResult && (
                  <div style={{ marginTop: '10px' }}>
                    <p>
                      Импортировано: {importResult.imported} из {importResult.total}
                    </p>
                    {importResult.errors.length > 0 && (
                      <ul>
                        {importResult.errors.map((e, i) => (
                          <li key={i}>
                            Строка {e.row} ({e.code}): {e.errors.join(', ')}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {showForm && (
            <form
              onSubmit={handleFormSubmit}
              style={{ border: '1px solid #ccc', padding: '16px', marginBottom: '16px', maxWidth: '400px' }}
            >
              <h3>Новый товар</h3>
              {formError && <p style={{ color: 'red' }}>{formError}</p>}
              <div>
                <label>Код: </label>
                <input required value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} />
              </div>
              <div>
                <label>Название: </label>
                <input required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div>
                <label>Категория: </label>
                <input required value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} />
              </div>
              <div>
                <label>UM продажи: </label>
                <input value={formData.saleUnit} onChange={(e) => setFormData({ ...formData, saleUnit: e.target.value })} />
              </div>
              <div>
                <label>Коэффициент: </label>
                <input required type="number" value={formData.saleUnitFactor} onChange={(e) => setFormData({ ...formData, saleUnitFactor: e.target.value })} />
              </div>
              <div>
                <label>Ставка TVA (%): </label>
                <input required type="number" value={formData.vatRate} onChange={(e) => setFormData({ ...formData, vatRate: e.target.value })} />
              </div>
              <div>
                <label>Цена (buc): </label>
                <input required type="number" step="0.01" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} />
              </div>
              <button type="submit" style={{ marginTop: '10px' }}>Сохранить</button>
            </form>
          )}

          {error && (
            <div style={{ padding: '20px', border: '1px solid red', borderRadius: '4px' }}>
              <p style={{ color: 'red' }}>Ошибка загрузки: {error}</p>
              <button onClick={fetchCatalog}>Повторить попытку</button>
            </div>
          )}

          {!error && loading && (
            <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Категория</th>
                  <th>Цена/buc</th>
                  <th>Цена/buc + TVA</th>
                  <th>Цена за bax</th>
                  <th>TVA</th>
                  <th>Источник</th>
                </tr>
              </thead>
              <tbody>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </tbody>
            </table>
          )}

          {!error && !loading && products.length === 0 && (
            <p>В каталоге пока нет товаров. Добавьте первый товар кнопкой выше.</p>
          )}

          {!error && !loading && products.length > 0 && (
            <>
              <p>Всего товаров после фильтра: {filteredProducts.length}</p>
              <VirtualizedTable
                products={filteredProducts}
                editingId={editingId}
                setEditingId={setEditingId}
                handlePriceSave={handlePriceSave}
              />

              {filteredProducts.length === 0 && (
                <p>Нет товаров, соответствующих фильтру или поиску. Попробуйте изменить условия.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default App