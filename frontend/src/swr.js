import { useCallback, useEffect, useState } from 'react'
import { apiFetch, getSession } from './api'

// Кэш ответов GET на время вкладки: страница, открытая второй раз, показывает прошлые данные сразу,
// а свежие подгружаются в фоне. Лежит в sessionStorage — личные данные не переживают закрытие вкладки
// и не видны следующему пользователю компьютера.
const PREFIX = 'swr:'
const memory = new Map()

function cacheKey(path) {
  return `${PREFIX}${getSession()?.token?.slice(-16) || 'guest'}:${path}`
}

function read(key) {
  if (memory.has(key)) return memory.get(key)
  try {
    const raw = sessionStorage.getItem(key)
    if (raw !== null) {
      const value = JSON.parse(raw)
      memory.set(key, value)
      return value
    }
  } catch {
    // хранилище недоступно
  }
  return undefined
}

function write(key, value) {
  memory.set(key, value)
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // не поместилось — хватит кэша в памяти
  }
}

export function clearCache() {
  memory.clear()
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i)
      if (k.startsWith(PREFIX)) sessionStorage.removeItem(k)
    }
  } catch {
    // не критично
  }
}

async function fetchJson(path) {
  const res = await apiFetch(path)
  const data = await res.json().catch(() => null)
  if (!res.ok) throw Object.assign(new Error(data?.error || 'HTTP ' + res.status), { serverError: data?.error })
  return data
}

// Что уже лежит в кэше (без запроса) — например, чтобы сразу заполнить форму
export function peekCache(path) {
  return read(cacheKey(path))
}

// Загрузить заранее (например, при наведении или в свободное время), чтобы страница открылась мгновенно
export function prefetch(path) {
  const key = cacheKey(path)
  return fetchJson(path)
    .then((data) => write(key, data))
    .catch(() => {})
}

// { data, loading, error, reload, mutate }: loading — только если показать пока нечего
export function useCachedGet(path) {
  const key = path ? cacheKey(path) : null
  const [state, setState] = useState(() => ({ key, data: key ? read(key) : undefined, error: null }))

  // сменился адрес (например, язык) — берём, что есть в кэше для нового
  let current = state
  if (state.key !== key) {
    current = { key, data: key ? read(key) : undefined, error: null }
    setState(current)
  }

  const reload = useCallback(() => {
    if (!key) return
    let cancelled = false
    fetchJson(path)
      .then((data) => {
        write(key, data)
        if (!cancelled) setState((s) => (s.key === key ? { key, data, error: null } : s))
      })
      .catch((err) => {
        if (!cancelled) setState((s) => (s.key === key ? { ...s, error: err } : s))
      })
    return () => {
      cancelled = true
    }
  }, [key, path])

  useEffect(() => reload(), [reload])

  // локальная правка (например, отменили заказ): сразу на экран и в кэш
  const mutate = useCallback(
    (update) =>
      setState((s) => {
        const data = typeof update === 'function' ? update(s.data) : update
        if (key) write(key, data)
        return { ...s, data }
      }),
    [key]
  )

  return {
    data: current.data,
    error: current.data === undefined ? current.error : null,
    loading: current.data === undefined && !current.error,
    reload,
    mutate,
  }
}
