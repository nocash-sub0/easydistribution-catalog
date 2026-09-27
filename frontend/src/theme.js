import { useSyncExternalStore } from 'react'
import { apiFetch, getSession } from './api'

// Тема сайта: 'system' (как в настройках устройства), 'light' или 'dark'.
// Выбор хранится в браузере, а у вошедшего покупателя ещё и в профиле на сервере.
const KEY = 'theme'
const THEMES = ['system', 'light', 'dark']
const media = window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set()

function readTheme() {
  try {
    const saved = localStorage.getItem(KEY)
    if (THEMES.includes(saved)) return saved
  } catch {
    // хранилище недоступно
  }
  return 'system'
}

let current = readTheme()

function apply() {
  const dark = current === 'dark' || (current === 'system' && media.matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

apply()
media.addEventListener('change', apply)

export function setTheme(theme) {
  if (!THEMES.includes(theme) || theme === current) return
  current = theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // не критично
  }
  apply()
  listeners.forEach((l) => l())
}

export function useTheme() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current
  )
}

// После входа покупателя применяем настройки из его профиля: тема и язык следуют за аккаунтом
export async function applyProfilePreferences(setLang) {
  if (getSession()?.role !== 'client') return
  try {
    const res = await apiFetch('/me')
    if (!res.ok) return
    const { preferences } = await res.json()
    if (preferences.theme) setTheme(preferences.theme)
    if (preferences.lang) setLang(preferences.lang, { save: false })
  } catch {
    // не критично: останутся текущие тема и язык
  }
}
