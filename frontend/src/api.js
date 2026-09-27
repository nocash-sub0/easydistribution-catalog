import { useEffect, useRef } from 'react'

export const API_URL = import.meta.env.VITE_API_URL
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

// Новое имя из профиля — в сохранённую сессию, чтобы шапка показала его сразу
export function renameSession(name) {
  const session = getSession()
  if (!session) return null
  const next = { ...session, name }
  saveSession(next)
  return next
}

export function logout() {
  localStorage.removeItem(SESSION_KEY)
  window.location.reload()
}

// Адрес сайта (папка, где открыт index.html) — сервер передаёт его Stripe как адрес возврата
export function siteUrl() {
  return new URL('.', window.location.href).href
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

// Вкладки админки остаются смонтированными: при возврате на вкладку данные уже на экране,
// а свежие подгружаются в фоне без индикатора загрузки
export function useRefreshWhenShown(active, refresh) {
  const wasActive = useRef(active)
  useEffect(() => {
    if (active && !wasActive.current) refresh()
    wasActive.current = active
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
}
