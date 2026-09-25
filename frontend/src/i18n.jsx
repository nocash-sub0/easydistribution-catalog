/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react'

export const APP_NAME = 'Catalog'

const LANGS = [
  { code: 'ru', label: 'RU' },
  { code: 'ro', label: 'RO' },
  { code: 'en', label: 'EN' },
]

const messages = {
  ru: {
    search: 'Поиск товаров...',
    login: 'Войти',
    logout: 'Выйти',
    cart: 'Корзина',
    adminPanel: 'Админ-панель',
    toShop: 'К магазину',
    allCategories: 'Все товары',
    categories: 'Категории',
    loading: 'Загрузка каталога...',
    loadError: 'Ошибка загрузки',
    retry: 'Повторить попытку',
    nothingFound: 'Ничего не найдено',
    productsCount: 'Товаров',
    addToCart: 'В корзину',
    priceOnRequest: 'Цена по запросу',
    specialPrice: 'Ваша цена',
    perUnit: 'за',
    inPack: 'в упаковке',
    vatIncluded: 'с TVA',
    cartEmpty: 'Корзина пуста',
    total: 'Итого с TVA',
    guestBanner: 'Войдите, чтобы увидеть свои цены и условия',
    loginTitle: 'Вход',
    loginField: 'Логин',
    passwordField: 'Пароль',
    signingIn: 'Вход...',
    cancel: 'Отмена',
    loginFailed: 'Ошибка входа',
    serverDown: 'Сервер недоступен или ещё обновляется. Попробуйте через минуту',
    adminCatalog: 'Каталог',
    adminPriceLists: 'Списки цен',
    footer: 'Оптовый каталог товаров',
  },
  ro: {
    search: 'Caută produse...',
    login: 'Autentificare',
    logout: 'Ieșire',
    cart: 'Coș',
    adminPanel: 'Panou admin',
    toShop: 'Către magazin',
    allCategories: 'Toate produsele',
    categories: 'Categorii',
    loading: 'Se încarcă catalogul...',
    loadError: 'Eroare de încărcare',
    retry: 'Încearcă din nou',
    nothingFound: 'Nu s-a găsit nimic',
    productsCount: 'Produse',
    addToCart: 'Adaugă în coș',
    priceOnRequest: 'Preț la cerere',
    specialPrice: 'Prețul dvs.',
    perUnit: 'per',
    inPack: 'în ambalaj',
    vatIncluded: 'cu TVA',
    cartEmpty: 'Coșul este gol',
    total: 'Total cu TVA',
    guestBanner: 'Autentificați-vă pentru a vedea prețurile și condițiile dvs.',
    loginTitle: 'Autentificare',
    loginField: 'Login',
    passwordField: 'Parolă',
    signingIn: 'Se conectează...',
    cancel: 'Anulare',
    loginFailed: 'Eroare de autentificare',
    serverDown: 'Serverul nu este disponibil sau se actualizează. Încercați peste un minut',
    adminCatalog: 'Catalog',
    adminPriceLists: 'Liste de prețuri',
    footer: 'Catalog de produse en-gros',
  },
  en: {
    search: 'Search products...',
    login: 'Log in',
    logout: 'Log out',
    cart: 'Cart',
    adminPanel: 'Admin panel',
    toShop: 'Back to shop',
    allCategories: 'All products',
    categories: 'Categories',
    loading: 'Loading catalog...',
    loadError: 'Loading error',
    retry: 'Try again',
    nothingFound: 'Nothing found',
    productsCount: 'Products',
    addToCart: 'Add to cart',
    priceOnRequest: 'Price on request',
    specialPrice: 'Your price',
    perUnit: 'per',
    inPack: 'per pack',
    vatIncluded: 'incl. VAT',
    cartEmpty: 'Your cart is empty',
    total: 'Total incl. VAT',
    guestBanner: 'Log in to see your prices and terms',
    loginTitle: 'Log in',
    loginField: 'Login',
    passwordField: 'Password',
    signingIn: 'Signing in...',
    cancel: 'Cancel',
    loginFailed: 'Login failed',
    serverDown: 'Server is unavailable or updating. Please try again in a minute',
    adminCatalog: 'Catalog',
    adminPriceLists: 'Price lists',
    footer: 'Wholesale product catalog',
  },
}

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

  const t = (key) => messages[lang][key] ?? messages.ru[key] ?? key

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
