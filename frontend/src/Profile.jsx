import { useEffect, useState } from 'react'
import { apiFetch, logout } from './api'
import { LangSwitch, useLang } from './i18n'
import Avatar from './Avatar'
import Logo from './Logo'
import MyOrders from './MyOrders'
import { setTheme, useTheme } from './theme'

async function request(path, method, body, tr) {
  const res = await apiFetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(tr(data?.error) || 'HTTP ' + res.status)
  return data
}

// Личный кабинет покупателя: заказы, сохранённые карты, личные данные, настройки
export default function Profile({ tab, onTab, onBack, onNameChange }) {
  const { t, tr } = useLang()
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    apiFetch('/me')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(t('serverError')))))
      .then(setProfile)
      .catch((err) => setError(err.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tabs = [
    ['orders', t('myOrders')],
    ['cards', t('tabCards')],
    ['settings', t('tabSettings')],
    ['prefs', t('tabPrefs')],
  ]

  return (
    <div>
      <header className="header">
        <div className="header-inner">
          <Logo onClick={onBack} />
          <div style={{ flex: 1, fontSize: '18px', fontWeight: 600 }}>{t('profileTitle')}</div>
          <LangSwitch />
          <button className="btn btn-ghost" onClick={logout}>
            {t('logout')}
          </button>
        </div>
      </header>

      <main className="page" style={{ maxWidth: '900px' }}>
        <button className="link-btn" style={{ width: 'auto', textAlign: 'left' }} onClick={onBack}>
          {t('backToCatalog')}
        </button>

        {profile && (
          <div className="profile-head">
            <Avatar name={profile.name} size={48} />
            <div>
              <strong>{profile.name}</strong>
              <div className="muted">{profile.email || profile.login}</div>
            </div>
          </div>
        )}

        <nav className="profile-tabs">
          {tabs.map(([id, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => onTab(id)}>
              {label}
            </button>
          ))}
        </nav>

        {error && <p className="form-error">{error}</p>}

        {tab === 'orders' && <MyOrders />}
        {tab === 'cards' && <CardsTab />}
        {tab === 'settings' && profile && (
          <SettingsTab
            profile={profile}
            onSaved={(p) => {
              setProfile(p)
              onNameChange(p.name)
            }}
            request={(path, method, body) => request(path, method, body, tr)}
          />
        )}
        {tab === 'prefs' && profile && (
          <PrefsTab
            preferences={profile.preferences}
            onSaved={(preferences) => setProfile({ ...profile, preferences })}
            request={(path, method, body) => request(path, method, body, tr)}
          />
        )}
      </main>
    </div>
  )
}

function CardsTab() {
  const { t, tr } = useLang()
  const [cards, setCards] = useState(null)
  const [enabled, setEnabled] = useState(true)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  const load = () =>
    request('/me/cards', 'GET', undefined, tr)
      .then(setCards)
      .catch((err) => {
        setCards([])
        setError(err.message)
      })

  useEffect(() => {
    apiFetch('/config')
      .then((res) => res.json())
      .then((cfg) => setEnabled(!!cfg.cardPayments))
      .catch(() => {})
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // добавление карты — на защищённой странице Stripe, оттуда он вернёт обратно в профиль
  const addCard = async () => {
    setBusy('add')
    setError(null)
    try {
      const { url } = await request('/me/cards/setup', 'POST', undefined, tr)
      window.location.assign(url)
    } catch (err) {
      setError(err.message)
      setBusy(null)
    }
  }

  const removeCard = async (card) => {
    if (!window.confirm(t('confirmRemoveCard', { last4: card.last4 }))) return
    setBusy(card.id)
    setError(null)
    try {
      await request(`/me/cards/${card.id}`, 'DELETE', undefined, tr)
      setCards((list) => list.filter((c) => c.id !== card.id))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="panel">
      <h3>{t('cardsTitle')}</h3>
      <p className="muted">{t('cardsHint')}</p>

      {!enabled ? (
        <p>{t('cardsOff')}</p>
      ) : (
        <>
          {cards === null && <p>{t('loadingShort')}</p>}
          {cards?.length === 0 && !error && <p>{t('noCards')}</p>}
          {cards?.map((c) => (
            <div key={c.id} className="saved-card">
              <span className="card-brand">{c.brand.toUpperCase()}</span>
              <span className="card-number">•••• {c.last4}</span>
              <span className="muted">
                {t('cardExpires', { date: `${String(c.expMonth).padStart(2, '0')}/${String(c.expYear).slice(-2)}` })}
              </span>
              <button className="btn btn-danger-outline" disabled={busy === c.id} onClick={() => removeCard(c)}>
                {t('removeCard')}
              </button>
            </div>
          ))}
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-yellow" style={{ marginTop: '12px' }} disabled={busy === 'add'} onClick={addCard}>
            {busy === 'add' ? t('redirecting') : '+ ' + t('addCard')}
          </button>
        </>
      )}
    </div>
  )
}

function SettingsTab({ profile, onSaved, request }) {
  const { t } = useLang()
  const [form, setForm] = useState({
    name: profile.name,
    email: profile.email || '',
    phone: profile.phone,
    address: profile.address,
  })
  const [status, setStatus] = useState(null) // { ok } | { error }
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setStatus(null)
    try {
      onSaved(await request('/me', 'PUT', form))
      setStatus({ ok: true })
    } catch (err) {
      setStatus({ error: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <form className="panel" onSubmit={save}>
        <h3>{t('tabSettings')}</h3>
        <label className="field">
          {t('nameField')}
          <input value={form.name} onChange={set('name')} required />
        </label>
        <label className="field">
          {t('emailField')}
          <input type="email" value={form.email} onChange={set('email')} />
        </label>
        <label className="field">
          {t('phone')}
          <input type="tel" value={form.phone} onChange={set('phone')} />
        </label>
        <label className="field">
          {t('address')}
          <input value={form.address} onChange={set('address')} />
        </label>
        <p className="muted">{t('pfAddressHint')}</p>
        {status?.error && <p className="form-error">{status.error}</p>}
        {status?.ok && <p className="text-ok">✓ {t('saved')}</p>}
        <button type="submit" className="btn btn-yellow" disabled={busy}>
          {busy ? t('saving') : t('save')}
        </button>
      </form>

      <PasswordForm hasPassword={profile.hasPassword} request={request} />
    </>
  )
}

function PasswordForm({ hasPassword, request }) {
  const { t } = useLang()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [has, setHas] = useState(hasPassword)

  const save = async (e) => {
    e.preventDefault()
    setStatus(null)
    if (next !== repeat) return setStatus({ error: t('passwordsMismatch') })
    setBusy(true)
    try {
      await request('/me/password', 'PUT', { currentPassword: current, newPassword: next })
      setStatus({ ok: true })
      setHas(true)
      setCurrent('')
      setNext('')
      setRepeat('')
    } catch (err) {
      setStatus({ error: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel" onSubmit={save}>
      <h3>{has ? t('changePassword') : t('setPasswordTitle')}</h3>
      {!has && <p className="muted">{t('setPasswordHint')}</p>}
      {has && (
        <label className="field">
          {t('currentPassword')}
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </label>
      )}
      <label className="field">
        {t('passwordNew')}
        <input type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
      </label>
      <label className="field">
        {t('passwordRepeat')}
        <input type="password" autoComplete="new-password" minLength={8} value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
      </label>
      {status?.error && <p className="form-error">{status.error}</p>}
      {status?.ok && <p className="text-ok">✓ {t('passwordChanged')}</p>}
      <button type="submit" className="btn btn-yellow" disabled={busy}>
        {busy ? t('saving') : t('savePassword')}
      </button>
    </form>
  )
}

function PrefsTab({ preferences, onSaved, request }) {
  const { t, lang, setLang } = useLang()
  const theme = useTheme()
  const [error, setError] = useState(null)

  // настройка применяется сразу, а в профиль сохраняется в фоне — чтобы на другом устройстве было так же
  const save = (patch) => {
    setError(null)
    request('/me/preferences', 'PUT', patch)
      .then(onSaved)
      .catch((err) => setError(err.message))
  }

  const themes = [
    ['system', t('themeSystem'), '◐'],
    ['light', t('themeLight'), '☀'],
    ['dark', t('themeDark'), '☾'],
  ]

  return (
    <div className="panel">
      <h3>{t('tabPrefs')}</h3>

      <div className="pref-row">
        <div className="filter-title">{t('themeLabel')}</div>
        <div className="theme-options">
          {themes.map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              className={'theme-option' + (theme === id ? ' selected' : '')}
              onClick={() => {
                setTheme(id)
                save({ theme: id })
              }}
            >
              <span className="theme-icon">{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="pref-row">
        <div className="filter-title">{t('langLabel')}</div>
        <select
          value={lang}
          onChange={(e) => {
            setLang(e.target.value, { save: false })
            save({ lang: e.target.value })
          }}
        >
          <option value="ru">Русский</option>
          <option value="ro">Română</option>
          <option value="en">English</option>
        </select>
      </div>

      <div className="pref-row">
        <label className="filter-check">
          <input type="checkbox" checked={preferences.orderEmails} onChange={(e) => save({ orderEmails: e.target.checked })} />
          {t('orderEmails')}
        </label>
      </div>

      {error && <p className="form-error">{error}</p>}
    </div>
  )
}
