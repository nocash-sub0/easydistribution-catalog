import { useState, useEffect, useRef } from 'react'
import { apiFetch, saveSession } from './api'
import { useLang } from './i18n'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

function GoogleButton({ onCredential }) {
  const { lang } = useLang()
  const ref = useRef(null)
  const callbackRef = useRef(onCredential)

  useEffect(() => {
    callbackRef.current = onCredential
  })

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return

    const render = () => {
      if (!window.google || !ref.current) return
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => callbackRef.current(response.credential),
      })
      ref.current.innerHTML = ''
      window.google.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', width: 312, locale: lang })
    }

    if (window.google) {
      render()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = render
    document.head.appendChild(script)
  }, [lang])

  if (!GOOGLE_CLIENT_ID) return null
  return <div ref={ref} style={{ display: 'flex', justifyContent: 'center', minHeight: '44px' }} />
}

export default function Login({ onLogin, onClose }) {
  const { t } = useLang()
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const isRegister = mode === 'register'

  const submitAuth = async (path, body, fallbackError) => {
    setError(null)
    setBusy(true)
    try {
      const res = await apiFetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!data) throw new Error(t('serverDown'))
      if (!res.ok) throw new Error(data.error || fallbackError)

      const session = { role: data.role, token: data.token, name: data.name }
      saveSession(session)
      onLogin(session)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (isRegister) {
      submitAuth('/register', { name, email: username, password }, t('registerFailed'))
    } else {
      submitAuth('/login', { username, password }, t('loginFailed'))
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{isRegister ? t('registerTitle') : t('loginTitle')}</h2>
        </div>
        <form onSubmit={handleSubmit}>
          {isRegister && (
            <label className="field">
              {t('nameField')}
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus required />
            </label>
          )}

          <label className="field">
            {isRegister ? t('emailField') : t('loginField')}
            <input
              type={isRegister ? 'email' : 'text'}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete={isRegister ? 'email' : 'username'}
              autoFocus={!isRegister}
              required
            />
          </label>

          <label className="field">
            {isRegister ? t('passwordNew') : t('passwordField')}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              minLength={isRegister ? 8 : undefined}
              required
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" disabled={busy} className="btn btn-yellow">
            {isRegister ? (busy ? t('registering') : t('createAccount')) : busy ? t('signingIn') : t('login')}
          </button>

          {GOOGLE_CLIENT_ID && (
            <>
              <div className="divider">{t('or')}</div>
              <GoogleButton
                onCredential={(credential) => submitAuth('/auth/google', { credential }, t('googleFailed'))}
              />
            </>
          )}

          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setMode(isRegister ? 'login' : 'register')
              setError(null)
            }}
          >
            {isRegister ? t('haveAccount') : t('noAccount')}
          </button>
          <button type="button" className="link-btn" onClick={onClose}>
            {t('cancel')}
          </button>
        </form>
      </div>
    </div>
  )
}
