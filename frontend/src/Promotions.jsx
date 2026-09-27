import { useEffect, useMemo, useState } from 'react'
import { apiFetch, useRefreshWhenShown } from './api'
import { useLang } from './i18n'
import { formatDay } from './Price'

const EMPTY_FORM = {
  title: '',
  percent: '',
  target: 'product',
  productId: '',
  category: '',
  clientId: '',
  startsAt: '',
  endsAt: '',
  active: true,
}

// Вкладка админки «Акции»: скидки на товар, категорию или весь каталог — для всех или для одного клиента
export default function Promotions({ active = true }) {
  const { t, tr, lang } = useLang()
  const [promos, setPromos] = useState([])
  const [products, setProducts] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [form, setForm] = useState(null) // null — форма закрыта
  const [editingId, setEditingId] = useState(null)
  const [productSearch, setProductSearch] = useState('')
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)

  const loadPromos = () =>
    apiFetch('/admin/promotions')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(t('serverError')))))
      .then(setPromos)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))

  useEffect(() => {
    loadPromos()
    apiFetch('/clients')
      .then((res) => res.json())
      .then(setClients)
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // товары и категории — на языке админки; raw=1: обычные цены, без действующих акций
  useEffect(() => {
    apiFetch(`/catalog?raw=1&lang=${lang}`)
      .then((res) => res.json())
      .then(setProducts)
      .catch(() => {})
  }, [lang])

  useRefreshWhenShown(active, loadPromos)

  const categories = useMemo(() => {
    const map = new Map()
    for (const p of products) map.set(p.categoryCode, p.category)
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], lang))
  }, [products, lang])

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const categoryName = (code) => categories.find(([c]) => c === code)?.[1] || code

  const productMatches = useMemo(() => {
    const q = productSearch.trim().toLowerCase()
    const list = q ? products.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)) : products
    return list.slice(0, 100)
  }, [products, productSearch])

  const openNew = () => {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setProductSearch('')
    setFormError(null)
  }

  const openEdit = (p) => {
    setForm({
      title: p.title,
      percent: String(p.percent),
      target: p.target,
      productId: p.productId ? String(p.productId) : '',
      category: p.category || '',
      clientId: p.clientId || '',
      startsAt: p.startsAt || '',
      endsAt: p.endsAt || '',
      active: p.active,
    })
    setEditingId(p.id)
    setProductSearch('')
    setFormError(null)
    window.scrollTo(0, 0)
  }

  const send = async (url, method, body) => {
    const res = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(tr(data?.error) || t('saveError'))
    return data
  }

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setFormError(null)
    try {
      const body = { ...form, percent: Number(form.percent) }
      if (editingId) await send(`/admin/promotions/${editingId}`, 'PUT', body)
      else await send('/admin/promotions', 'POST', body)
      setForm(null)
      setEditingId(null)
      await loadPromos()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (p) => {
    try {
      await send(`/admin/promotions/${p.id}`, 'PUT', { ...p, active: !p.active })
      await loadPromos()
    } catch (err) {
      alert(err.message)
    }
  }

  const remove = async (p) => {
    if (!window.confirm(t('confirmDeletePromo', { title: p.title }))) return
    try {
      await send(`/admin/promotions/${p.id}`, 'DELETE')
      await loadPromos()
    } catch (err) {
      alert(err.message)
    }
  }

  const targetText = (p) =>
    p.target === 'product'
      ? `${t('targetProduct')}: ${productById.get(p.productId)?.name || p.productName} (${p.productCode})`
      : p.target === 'category'
        ? `${t('targetCategory')}: ${categoryName(p.category)}`
        : t('targetAll')

  const periodText = (p) =>
    !p.startsAt && !p.endsAt
      ? t('always')
      : `${p.startsAt ? formatDay(p.startsAt, lang) : '…'} — ${p.endsAt ? formatDay(p.endsAt, lang) : '…'}`

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const selectedProduct = form?.productId ? productById.get(Number(form.productId)) : null

  return (
    <div style={{ padding: '20px' }}>
      <div className="promo-toolbar">
        <h1 style={{ margin: 0 }}>{t('promosTitle')}</h1>
        {!form && (
          <button className="btn btn-yellow" onClick={openNew}>
            + {t('newPromo')}
          </button>
        )}
      </div>
      <p className="muted">{t('promosHint')}</p>

      {form && (
        <form className="panel promo-form" onSubmit={save}>
          <h3>{editingId ? t('editPromo') : t('newPromo')}</h3>
          <div className="promo-grid">
            <label className="field">
              {t('promoName')}
              <input value={form.title} onChange={set('title')} required maxLength={255} />
            </label>
            <label className="field">
              {t('promoPercent')}
              <input type="number" min="0.01" max="99.99" step="0.01" value={form.percent} onChange={set('percent')} required />
            </label>
          </div>

          <div className="filter-title">{t('promoTarget')}</div>
          <div className="promo-targets">
            {[
              ['product', t('targetProduct')],
              ['category', t('targetCategory')],
              ['all', t('targetAll')],
            ].map(([id, label]) => (
              <label key={id} className={'pay-option' + (form.target === id ? ' selected' : '')}>
                <input type="radio" name="target" checked={form.target === id} onChange={() => setForm({ ...form, target: id })} />
                {label}
              </label>
            ))}
          </div>

          {form.target === 'product' && (
            <div className="promo-grid">
              <label className="field">
                {t('searchLbl')}
                <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder={t('searchProductPh')} />
              </label>
              <label className="field">
                {t('targetProduct')}
                <select value={form.productId} onChange={set('productId')} required>
                  <option value="">—</option>
                  {selectedProduct && !productMatches.includes(selectedProduct) && (
                    <option value={selectedProduct.id}>
                      {selectedProduct.name} ({selectedProduct.code})
                    </option>
                  )}
                  {productMatches.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {form.target === 'category' && (
            <label className="field">
              {t('targetCategory')}
              <select value={form.category} onChange={set('category')} required>
                <option value="">—</option>
                {categories.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field">
            {t('promoFor')}
            <select value={form.clientId} onChange={set('clientId')}>
              <option value="">{t('forAllClients')}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.email ? ` · ${c.email}` : ''}
                </option>
              ))}
            </select>
          </label>

          <div className="promo-grid">
            <label className="field">
              {t('promoFrom')}
              <input type="date" value={form.startsAt} onChange={set('startsAt')} />
            </label>
            <label className="field">
              {t('promoTo')}
              <input type="date" value={form.endsAt} min={form.startsAt || undefined} onChange={set('endsAt')} />
            </label>
          </div>
          <p className="muted" style={{ marginTop: 0 }}>
            {t('promoDatesHint')}
          </p>

          <label className="filter-check">
            <input type="checkbox" checked={form.active} onChange={set('active')} />
            {t('promoActive')}
          </label>

          {formError && <p className="form-error">{formError}</p>}
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button type="submit" className="btn btn-yellow" disabled={busy}>
              {busy ? t('saving') : editingId ? t('save') : t('create')}
            </button>
            <button type="button" className="btn btn-light" onClick={() => setForm(null)}>
              {t('cancel')}
            </button>
          </div>
        </form>
      )}

      {loading && <p>{t('loadingShort')}</p>}
      {error && <p className="form-error">{error}</p>}
      {!loading && !error && promos.length === 0 && (
        <div className="panel">
          <p>{t('noPromos')}</p>
        </div>
      )}

      {promos.map((p) => (
        <div key={p.id} className={'panel promo-row' + (p.state === 'running' ? '' : ' promo-row-idle')}>
          <div className="promo-percent">−{p.percent}%</div>
          <div className="promo-info">
            <strong>{p.title}</strong>
            <div>{targetText(p)}</div>
            <div className="muted">
              {t('promoFor')}: {p.clientId ? p.clientName : t('forAllClients')} · {t('colPeriod')}: {periodText(p)}
            </div>
          </div>
          <span className={'status-badge promo-st-' + p.state}>{t('promoSt_' + p.state)}</span>
          <div className="promo-actions">
            <button className="btn btn-light" onClick={() => openEdit(p)}>
              {t('edit')}
            </button>
            <label className="filter-check" title={t('promoActive')}>
              <input type="checkbox" checked={p.active} onChange={() => toggle(p)} />
              {t('promoActive')}
            </label>
            <button className="btn btn-danger-outline" onClick={() => remove(p)}>
              {t('delete')}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
