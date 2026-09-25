const API_URL = import.meta.env.VITE_API_URL
const SESSION_KEY = 'session'

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY))
  } catch {
    return null
  }
}

export function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function logout() {
  localStorage.removeItem(SESSION_KEY)
  window.location.reload()
}

// fetch с автоматической подстановкой токена; при 401 (токен истёк) выходит из аккаунта
export async function apiFetch(path, options = {}) {
  const session = getSession()
  const headers = { ...(options.headers || {}) }
  if (session?.token) headers.Authorization = `Bearer ${session.token}`

  const res = await fetch(`${API_URL}${path}`, { ...options, headers })
  if (res.status === 401 && session) logout()
  return res
}
