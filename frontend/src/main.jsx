import { StrictMode, Suspense, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Storefront from './Storefront.jsx'
import { getSession, renameSession } from './api'
import lazyPage from './lazyPage'
import { LangProvider, useLang } from './i18n'
import { navigate, useRoute } from './router'
import { prefetch } from './swr'
import { applyProfilePreferences } from './theme'

// Витрина грузится сразу, остальные экраны — только когда их открывают.
// Так гость не скачивает код админки, импорта CSV и оформления заказа.
const App = lazyPage(() => import('./App.jsx'))
const Checkout = lazyPage(() => import('./Checkout.jsx'))
const Login = lazyPage(() => import('./Login.jsx'))
const Profile = lazyPage(() => import('./Profile.jsx'))
const PaymentResult = lazyPage(() => import('./PaymentResult.jsx'))
const ProductPage = lazyPage(() => import('./ProductPage.jsx'))
const ResetPassword = lazyPage(() => import('./ResetPassword.jsx'))

const CART_KEY = 'cart'
const ADMIN_TABS = ['catalog', 'pricelists', 'orders', 'clients', 'promotions']
const PROFILE_TABS = ['orders', 'cards', 'settings', 'prefs']

function loadCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(CART_KEY))
    if (!saved || typeof saved !== 'object') return {}
    // оставляем только корректные позиции: id товара -> положительное количество
    return Object.fromEntries(Object.entries(saved).filter(([, qty]) => Number.isInteger(qty) && qty > 0))
  } catch {
    return {}
  }
}

function Loading() {
  const { t } = useLang()
  return <p style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>{t('loadingShort')}</p>
}

function Root() {
  const { setLang } = useLang()
  const [session, setSession] = useState(getSession)
  const [showLogin, setShowLogin] = useState(false)
  const [paymentReturn, setPaymentReturn] = useState(() => !!new URLSearchParams(window.location.search).get('payment'))
  const path = useRoute()
  // корзина живёт здесь, чтобы переходить между витриной и страницей оплаты не теряя товары,
  // и сохраняется в браузере, чтобы переживать обновление страницы
  const [cart, setCart] = useState(loadCart)

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart))
    } catch {
      // хранилище недоступно — корзина просто не сохранится
    }
  }, [cart])

  const isAdmin = session?.role === 'admin'
  const isClient = session?.role === 'client'

  // В свободное время браузера заранее скачиваем код остальных страниц (и админки — админу),
  // а покупателю — его профиль и заказы: переходы открываются сразу, без «Загрузка…»
  useEffect(() => {
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500))
    idle(() => {
      ProductPage.preload()
      Checkout.preload()
      if (isAdmin) App.preload()
      if (isClient) {
        Profile.preload()
        prefetch('/me')
        prefetch('/my/orders')
      }
      if (!session) Login.preload()
      prefetch('/config')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, isClient])

  // Нет прав на страницу (например, вышли из аккаунта на /#/admin) — возвращаем на витрину
  const forbidden = (path.startsWith('/admin') && !isAdmin) || (path.startsWith('/profile') && !isClient)
  useEffect(() => {
    if (forbidden) navigate('/')
    // старая ссылка «Мои заказы» (в том числе из писем) ведёт во вкладку профиля
    else if (path === '/orders') navigate(isClient ? '/profile/orders' : '/')
  }, [forbidden, path, isClient])

  useEffect(() => {
    applyProfilePreferences(setLang)
    // только при открытии сайта; после входа — в handleLogin
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLogin = (newSession) => {
    setSession(newSession)
    setShowLogin(false)
    applyProfilePreferences(setLang)
  }

  const changeQty = (id, qty) => {
    setCart((prev) => {
      const next = { ...prev }
      if (qty <= 0) delete next[id]
      else next[id] = qty
      return next
    })
  }

  const goShop = () => navigate('/')

  let page
  if (paymentReturn) {
    page = (
      <PaymentResult
        session={session}
        onBack={() => {
          window.history.replaceState({}, '', window.location.pathname)
          setPaymentReturn(false)
          goShop()
        }}
      />
    )
  } else if (path.startsWith('/reset/')) {
    page = <ResetPassword token={path.slice('/reset/'.length)} onDone={handleLogin} onBack={goShop} />
  } else if (path.startsWith('/admin') && isAdmin) {
    const tab = path.split('/')[2]
    page = (
      <App
        tab={ADMIN_TABS.includes(tab) ? tab : 'catalog'}
        onTab={(t) => navigate(t === 'catalog' ? '/admin' : `/admin/${t}`)}
        onOpenShop={goShop}
      />
    )
  } else if (path.startsWith('/profile') && isClient) {
    const tab = path.split('/')[2]
    page = (
      <Profile
        tab={PROFILE_TABS.includes(tab) ? tab : 'orders'}
        onTab={(t) => navigate(`/profile/${t}`)}
        onBack={goShop}
        onNameChange={(name) => setSession(renameSession(name))}
      />
    )
  } else if (path === '/checkout') {
    page = (
      <Checkout
        key={session?.token || 'guest'}
        session={session}
        cart={cart}
        onBack={goShop}
        onDone={() => setCart({})}
        onOpenLogin={() => setShowLogin(true)}
      />
    )
  } else {
    // Витрина остаётся смонтированной под страницей товара: при возврате назад
    // сохраняются категория, поиск, «Показать ещё» и позиция прокрутки
    const productMatch = path.match(/^\/product\/(\d+)$/)
    page = (
      <>
        <Storefront
          key={session?.token || 'guest'}
          hidden={!!productMatch}
          session={session}
          cart={cart}
          onChangeQty={changeQty}
          onCheckout={() => navigate('/checkout')}
          onOpenLogin={() => setShowLogin(true)}
          onOpenAdmin={() => navigate('/admin')}
          onOpenProfile={() => navigate('/profile')}
        />
        {productMatch && (
          <ProductPage
            key={productMatch[1]}
            productId={Number(productMatch[1])}
            session={session}
            cart={cart}
            onChangeQty={changeQty}
            onBack={goShop}
            onCheckout={() => navigate('/checkout')}
          />
        )}
      </>
    )
  }

  return (
    <>
      <Suspense fallback={<Loading />}>{page}</Suspense>
      {/* отдельная граница: пока грузится окно входа, страница под ним не пропадает */}
      <Suspense fallback={null}>
        {showLogin && <Login onLogin={handleLogin} onClose={() => setShowLogin(false)} />}
      </Suspense>
    </>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LangProvider>
      <Root />
    </LangProvider>
  </StrictMode>,
)
