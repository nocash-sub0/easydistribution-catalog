import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from './api'

// Последний загруженный каталог хранится в браузере: при следующем открытии товары видны сразу,
// а свежие цены подгружаются в фоне (важно, пока сервер на Render «просыпается»)
const CACHE_PREFIX = 'catalog:'

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
    // держим только один каталог, чтобы не переполнить хранилище браузера
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k.startsWith(CACHE_PREFIX) && k !== CACHE_PREFIX + key) localStorage.removeItem(k)
    }
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data))
  } catch {
    // не поместилось или хранилище недоступно — просто работаем без кэша
  }
}

// Каталог с ценами текущего клиента на текущем языке (витрина и страница товара)
export function useCatalog(session, lang) {
  // цены зависят от клиента, поэтому кэш свой для каждого аккаунта и языка
  const cacheKey = `${lang}:${session?.token || 'guest'}`
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
    apiFetch(`/catalog?lang=${lang}`)
      .then((res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status)
        return res.json()
      })
      .then((data) => {
        setProducts(data)
        setLoading(false)
        writeCachedCatalog(cacheKey, data)
      })
      .catch((err) => {
        // если показан каталог из кэша, ошибку обновления не показываем — товары уже на экране
        if (!cached) setError(err.message)
        setLoading(false)
      })
  }, [cacheKey, lang])

  useEffect(() => {
    reload()
  }, [reload])

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
