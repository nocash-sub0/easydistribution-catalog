import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from './api'

// Последний загруженный каталог хранится в браузере: при следующем открытии товары видны сразу,
// а свежие цены подгружаются в фоне (важно, пока сервер на Render «просыпается»)
const CACHE_PREFIX = 'catalog:'
const LANGS = ['ru', 'ro', 'en']

function readCachedCatalog(key) {
  try {
    const data = JSON.parse(localStorage.getItem(CACHE_PREFIX + key))
    return Array.isArray(data) ? data : null
  } catch {
    return null
  }
}

function writeCachedCatalog(key, data) {
  try {
    // держим каталоги только текущего аккаунта (все языки), чтобы не переполнить хранилище браузера
    const account = key.slice(key.indexOf(':') + 1)
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k.startsWith(CACHE_PREFIX) && !k.endsWith(':' + account)) localStorage.removeItem(k)
    }
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data))
  } catch {
    // не поместилось или хранилище недоступно — просто работаем без кэша
  }
}

function fetchCatalog(lang) {
  return apiFetch(`/catalog?lang=${lang}`).then((res) => {
    if (!res.ok) throw new Error('HTTP ' + res.status)
    return res.json()
  })
}

// Когда каталог на текущем языке загружен, в фоне подтягиваем остальные языки —
// переключение RU/RO/EN потом показывает товары сразу, без ожидания сервера
const prefetched = new Set()

function prefetchOtherLangs(lang, account) {
  // один раз за сессию на аккаунт: дальше языки обновляются сами при переключении
  if (prefetched.has(account)) return
  prefetched.add(account)
  const run = () => {
    for (const other of LANGS) {
      if (other === lang) continue
      fetchCatalog(other)
        .then((data) => writeCachedCatalog(`${other}:${account}`, data))
        .catch(() => {})
    }
  }
  if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 3000 })
  else setTimeout(run, 1000)
}

// Каталог с ценами текущего клиента на текущем языке (витрина и страница товара)
export function useCatalog(session, lang) {
  // цены зависят от клиента, поэтому кэш свой для каждого аккаунта и языка
  const account = session?.token || 'guest'
  const cacheKey = `${lang}:${account}`
  const [products, setProducts] = useState(() => readCachedCatalog(cacheKey) || [])
  const [loading, setLoading] = useState(() => !readCachedCatalog(cacheKey))
  const [error, setError] = useState(null)

  const reload = useCallback(() => {
    const cached = readCachedCatalog(cacheKey)
    if (cached) {
      setProducts(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }
    setError(null)
    let cancelled = false
    fetchCatalog(lang)
      .then((data) => {
        if (cancelled) return
        setProducts(data)
        setLoading(false)
        writeCachedCatalog(cacheKey, data)
        prefetchOtherLangs(lang, account)
      })
      .catch((err) => {
        if (cancelled) return
        // если показан каталог из кэша, ошибку обновления не показываем — товары уже на экране
        if (!cached) setError(err.message)
        setLoading(false)
      })
    // быстро переключили язык ещё раз — ответ по старому языку уже не нужен
    return () => {
      cancelled = true
    }
  }, [cacheKey, lang, account])

  useEffect(() => reload(), [reload])

  return { products, loading, error, reload }
}

export function formatMDL(value) {
  if (value === null || value === undefined) return '—'
  return `${value.toFixed(2)} MDL`
}

// Состояние остатка для кнопок «В корзину» и «+»; stock === null — остаток не ведётся
export function stockState(product, qty) {
  const tracked = product.stock !== null && product.stock !== undefined
  return {
    outOfStock: tracked && product.stock <= 0,
    lowStock: tracked && product.stock > 0 && product.stock <= 10,
    canAddMore: !tracked || qty < product.stock,
  }
}
