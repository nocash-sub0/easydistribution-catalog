import { useState, useEffect } from 'react'
import { apiFetch, saveSession } from './api'

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('client')
  const [clients, setClients] = useState([])
  const [clientId, setClientId] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    apiFetch('/auth/clients')
      .then((res) => res.json())
      .then((data) => {
        setClients(data)
        if (data.length > 0) setClientId(data[0].id)
      })
      .catch(() => setError('Не удалось загрузить список клиентов'))
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const isAdmin = mode === 'admin'
      const res = await apiFetch(isAdmin ? '/admin/login' : '/client/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isAdmin ? { username, password } : { clientId, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка входа')

      const session = isAdmin
        ? { role: 'admin', token: data.token }
        : { role: 'client', token: data.token, clientName: data.clientName }
      saveSession(session)
      onLogin(session)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const tabStyle = (active) => ({
    flex: 1,
    padding: '10px',
    border: 'none',
    borderBottom: active ? '3px solid #2563eb' : '3px solid transparent',
    background: 'none',
    fontWeight: active ? 'bold' : 'normal',
    cursor: 'pointer',
    fontSize: '15px',
  })

  const inputStyle = { width: '100%', padding: '10px', marginTop: '4px', boxSizing: 'border-box', fontSize: '15px' }

  return (
    <div style={{ fontFamily: 'sans-serif', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6' }}>
      <form onSubmit={handleSubmit} style={{ background: 'white', padding: '28px', borderRadius: '10px', width: '340px', boxShadow: '0 2px 12px rgba(0,0,0,0.1)' }}>
        <h2 style={{ marginTop: 0, textAlign: 'center' }}>EasyDistribution</h2>

        <div style={{ display: 'flex', marginBottom: '20px' }}>
          <button type="button" style={tabStyle(mode === 'client')} onClick={() => setMode('client')}>Покупатель</button>
          <button type="button" style={tabStyle(mode === 'admin')} onClick={() => setMode('admin')}>Администратор</button>
        </div>

        {mode === 'client' ? (
          <label style={{ display: 'block', marginBottom: '14px' }}>
            Клиент
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={inputStyle}>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        ) : (
          <label style={{ display: 'block', marginBottom: '14px' }}>
            Логин
            <input value={username} onChange={(e) => setUsername(e.target.value)} style={inputStyle} autoComplete="username" required />
          </label>
        )}

        <label style={{ display: 'block', marginBottom: '14px' }}>
          Пароль
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} autoComplete="current-password" required />
        </label>

        {error && <p style={{ color: 'red', margin: '0 0 12px' }}>{error}</p>}

        <button type="submit" disabled={busy} style={{ width: '100%', padding: '11px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontSize: '15px', cursor: 'pointer' }}>
          {busy ? 'Вход...' : 'Войти'}
        </button>
      </form>
    </div>
  )
}
