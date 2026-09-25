import { useState } from 'react'
import { apiFetch, saveSession } from './api'

export default function Login({ onLogin, onClose }) {
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
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка входа')

      const session = { role: data.role, token: data.token, name: data.name }
      saveSession(session)
      onLogin(session)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const inputStyle = { width: '100%', padding: '10px', marginTop: '4px', boxSizing: 'border-box', fontSize: '15px' }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, fontFamily: 'sans-serif' }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        style={{ background: 'white', padding: '28px', borderRadius: '10px', width: '320px', boxShadow: '0 2px 16px rgba(0,0,0,0.2)' }}
      >
        <h2 style={{ marginTop: 0 }}>Вход</h2>

        <label style={{ display: 'block', marginBottom: '14px' }}>
          Логин
          <input value={username} onChange={(e) => setUsername(e.target.value)} style={inputStyle} autoComplete="username" autoFocus required />
        </label>

        <label style={{ display: 'block', marginBottom: '14px' }}>
          Пароль
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} autoComplete="current-password" required />
        </label>

        {error && <p style={{ color: 'red', margin: '0 0 12px' }}>{error}</p>}

        <button type="submit" disabled={busy} style={{ width: '100%', padding: '11px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontSize: '15px', cursor: 'pointer' }}>
          {busy ? 'Вход...' : 'Войти'}
        </button>
        <button type="button" onClick={onClose} style={{ width: '100%', marginTop: '8px', padding: '9px', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
          Отмена
        </button>
      </form>
    </div>
  )
}
