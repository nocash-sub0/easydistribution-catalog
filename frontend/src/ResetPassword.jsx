import { useState } from 'react'
import { apiFetch, saveSession } from './api'
import { APP_NAME, LangSwitch, useLang } from './i18n'

// Страница из письма «Восстановление пароля»: /#/reset/<token>
export default function ResetPassword({ token, onDone, onBack }) {
  const { t, tr } = useLang()
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (password !== password2) {
      setError(t('passwordsMismatch'))
      return
    }
    setBusy(true)
    try {
      const res = await apiFetch('/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => null)
      if (!data) throw new Error(t('serverDown'))
      if (!res.ok) throw new Error(tr(data.error))

      const session = { role: data.role, token: data.token, name: data.name }
      saveSession(session)
      onDone(session)
      onBack()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <header className="header">
        <div className="header-inner">
          <div className="logo" onClick={onBack}>
            {APP_NAME}
          </div>
          <div style={{ flex: 1 }} />
          <LangSwitch />
        </div>
      </header>
      <main className="page" style={{ maxWidth: '420px' }}>
        <form className="panel" onSubmit={handleSubmit}>
          <h3>{t('newPasswordTitle')}</h3>
          <label className="field">
            {t('passwordNew')}
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} autoFocus required />
          </label>
          <label className="field">
            {t('passwordRepeat')}
            <input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" minLength={8} required />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-yellow" style={{ width: '100%' }} disabled={busy}>
            {busy ? t('saving') : t('savePassword')}
          </button>
        </form>
      </main>
    </div>
  )
}
