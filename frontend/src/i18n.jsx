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

// Сообщения сервера приходят на румынском — сопоставляем их с ключами переводов
const SERVER_ERRORS = {
  'Login sau parolă incorectă': 'errBadLogin',
  'Introduceți login și parola': 'errNeedCreds',
  'Numele este obligatoriu': 'errNameRequired',
  'Email invalid': 'errEmail',
  'Parola trebuie să aibă minim 8 caractere': 'errPwShort',
  'Acest email este deja înregistrat': 'errEmailTaken',
  'Google token invalid': 'googleFailed',
  'Eroare server': 'errServer',
  'Metodă de plată invalidă': 'errPayMethod',
  'Plata cu cardul nu este configurată': 'errCardOff',
  'Completați datele de livrare': 'errDelivery',
  'Coșul este gol': 'cartEmpty',
  'Produs sau cantitate invalidă': 'errProduct',
  'Nu s-a putut iniția plata cu cardul': 'errCardInit',
  'Lipsește token-ul': 'errSession',
  'Token invalid': 'errSession',
  'Acces interzis': 'errForbidden',
  'Comanda nu a fost găsită': 'errOrderNotFound',
  'Nu poți șterge lista implicită': 'errDefaultList',
  'Procent invalid': 'errPercent',
  'Lista nu a fost găsită': 'errListNotFound',
}

// Единицы измерения товаров: переводим только известные, остальные показываем как есть
const UNITS = {
  buc: { ru: 'шт.', ro: 'buc', en: 'pcs' },
  bax: { ru: 'ящ.', ro: 'bax', en: 'box' },
}

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const initial = initialLang()
    document.documentElement.lang = initial
    return initial
  })

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

  const tr = (message) => {
    if (!message) return message
    const prefix = 'Produsul nu are preț: '
    if (message.startsWith(prefix)) return t('errNoPrice', { name: message.slice(prefix.length) })
    return SERVER_ERRORS[message] ? t(SERVER_ERRORS[message]) : message
  }

  const unit = (u) => UNITS[u]?.[lang] ?? u

  return <LangContext.Provider value={{ lang, setLang, t, tr, unit }}>{children}</LangContext.Provider>
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
