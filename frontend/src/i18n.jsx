/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react'
import { messages } from './messages'

export const APP_NAME = 'Catalog'

const LANGS = [
  { code: 'ru', label: 'RU' },
  { code: 'ro', label: 'RO' },
  { code: 'en', label: 'EN' },
]

const LangContext = createContext(null)

function initialLang() {
  try {
    const saved = localStorage.getItem('lang')
    if (saved && messages[saved]) return saved
  } catch {
    // localStorage недоступен — используем язык по умолчанию
  }
  return 'ru'
}

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(initialLang)

  const setLang = (code) => {
    setLangState(code)
    try {
      localStorage.setItem('lang', code)
    } catch {
      // не критично
    }
    document.documentElement.lang = code
  }

  const t = (key, vars) => {
    let text = messages[lang][key] ?? messages.ru[key] ?? key
    if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, v)
    return text
  }

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>
}

export function useLang() {
  return useContext(LangContext)
}

export function LangSwitch() {
  const { lang, setLang } = useLang()
  return (
    <div className="lang-switch">
      {LANGS.map((l) => (
        <button key={l.code} className={l.code === lang ? 'active' : ''} onClick={() => setLang(l.code)}>
          {l.label}
        </button>
      ))}
    </div>
  )
}
