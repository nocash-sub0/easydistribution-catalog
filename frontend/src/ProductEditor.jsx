import { useState, useEffect } from 'react'
import { apiFetch } from './api'
import { useLang } from './i18n'

// Окно редактирования товара в админке: данные, остаток, переводы названия, удаление
export default function ProductEditor({ productId, categories, onClose, onSaved }) {
  const { t, tr } = useLang()
  const [form, setForm] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    apiFetch(`/admin/products/${productId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(t('serverError')))))
      .then((p) =>
        setForm({
          ...p,
          stock: p.stock === null ? '' : String(p.stock),
          ruName: p.translations.ru?.name || '',
          ruDescription: p.translations.ru?.description || '',
          enDescription: p.translations.en?.description || '',
          ruCategory: p.translations.ru?.category || '',
          enName: p.translations.en?.name || '',
          enCategory: p.translations.en?.category || '',
        })
      )
      .catch((err) => setError(err.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId])

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const send = async (method, body) => {
    setBusy(true)
    setError(null)
    try {
      const res = await apiFetch(`/catalog/products/${productId}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body && JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(tr(data?.error) || t('serverError'))
      onSaved()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    send('PUT', {
      code: form.code,
      name: form.name,
      category: form.category,
      saleUnit: form.saleUnit,
      saleUnitFactor: form.saleUnitFactor,
      vatRate: form.vatRate,
      stock: form.stock === '' ? null : Number(form.stock),
      description: form.description,
      translations: {
        ru: { name: form.ruName, category: form.ruCategory, description: form.ruDescription },
        en: { name: form.enName, category: form.enCategory, description: form.enDescription },
      },
    })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t('editProduct')}</h2>
        </div>
        {!form ? (
          <form>
            <p>{error || t('loadingShort')}</p>
            <button type="button" className="link-btn" onClick={onClose}>
              {t('cancel')}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <label className="field">
                {t('fCode')}
                <input value={form.code} onChange={set('code')} required />
              </label>
              <label className="field">
                {t('fCategory')}
                <input value={form.category} onChange={set('category')} list="category-options" required />
                <datalist id="category-options">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>
              <label className="field span-2">
                {t('fName')} (RO)
                <input value={form.name} onChange={set('name')} required />
              </label>
              <label className="field">
                {t('fSaleUm')}
                <input value={form.saleUnit} onChange={set('saleUnit')} required />
              </label>
              <label className="field">
                {t('fFactor')}
                <input type="number" step="0.01" min="0.01" value={form.saleUnitFactor} onChange={set('saleUnitFactor')} required />
              </label>
              <label className="field">
                {t('fVat')}
                <input type="number" step="0.01" min="0" max="100" value={form.vatRate} onChange={set('vatRate')} required />
              </label>
              <label className="field span-2">
                {t('description')} (RO)
                <textarea rows={3} value={form.description} onChange={set('description')} />
              </label>
              <label className="field">
                {t('fStock')}
                <input type="number" min="0" step="1" value={form.stock} onChange={set('stock')} placeholder={t('stockUnlimited')} />
              </label>
            </div>

            <h4 style={{ margin: '8px 0' }}>{t('translationsTitle')}</h4>
            <p className="muted" style={{ marginTop: 0 }}>
              {t('translationsHint')}
            </p>
            <div className="form-grid">
              <label className="field">
                {t('fName')} (RU)
                <input value={form.ruName} onChange={set('ruName')} placeholder={t('autoTranslate')} />
              </label>
              <label className="field">
                {t('fCategory')} (RU)
                <input value={form.ruCategory} onChange={set('ruCategory')} placeholder={t('autoTranslate')} />
              </label>
              <label className="field">
                {t('fName')} (EN)
                <input value={form.enName} onChange={set('enName')} placeholder={t('autoTranslate')} />
              </label>
              <label className="field">
                {t('fCategory')} (EN)
                <input value={form.enCategory} onChange={set('enCategory')} placeholder={t('autoTranslate')} />
              </label>
              <label className="field span-2">
                {t('description')} (RU)
                <textarea rows={3} value={form.ruDescription} onChange={set('ruDescription')} placeholder={t('autoTranslate')} />
              </label>
              <label className="field span-2">
                {t('description')} (EN)
                <textarea rows={3} value={form.enDescription} onChange={set('enDescription')} placeholder={t('autoTranslate')} />
              </label>
            </div>

            {error && <p className="form-error">{error}</p>}

            <div className="editor-actions">
              <button type="submit" className="btn btn-yellow" disabled={busy}>
                {busy ? t('saving') : t('save')}
              </button>
              <button type="button" className="link-btn" style={{ width: 'auto' }} onClick={onClose}>
                {t('cancel')}
              </button>
              <span style={{ flex: 1 }} />
              {confirmDelete ? (
                <span>
                  {t('confirmDeleteProduct')}{' '}
                  <button type="button" className="btn btn-danger" disabled={busy} onClick={() => send('DELETE')}>
                    {t('yesDelete')}
                  </button>{' '}
                  <button type="button" className="link-btn" style={{ width: 'auto' }} onClick={() => setConfirmDelete(false)}>
                    {t('cancel')}
                  </button>
                </span>
              ) : (
                <button type="button" className="btn btn-danger-outline" onClick={() => setConfirmDelete(true)}>
                  {t('deleteProduct')}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
