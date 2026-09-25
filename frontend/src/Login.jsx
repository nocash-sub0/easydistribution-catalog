import { useState } from 'react'
import { apiFetch, saveSession } from './api'
import { useLang } from './i18n'

export default function Login({ onLogin, onClose }) {
  const { t } = useLang()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await apiFetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json().catch(() => null)
      if (!data) throw new Error(t('serverDown'))
      if (!res.ok) throw new Error(data.error || t('loginFailed'))

      const session = { role: data.role, token: data.token, name: data.name }
      saveSession(session)
      onLogin(session)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t('loginTitle')}</h2>
        </div>
        <form onSubmit={handleSubmit}>
          <label className="field">
            {t('loginField')}
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
          </label>

          <label className="field">
            {t('passwordField')}
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" disabled={busy} className="btn btn-yellow">
            {busy ? t('signingIn') : t('login')}
          </button>
          <button type="button" className="link-btn" onClick={onClose}>
            {t('cancel')}
          </button>
        </form>
      </div>
    </div>
  )
}
