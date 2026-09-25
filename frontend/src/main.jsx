import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Checkout from './Checkout.jsx'
import Login from './Login.jsx'
import MyOrders from './MyOrders.jsx'
import PaymentResult from './PaymentResult.jsx'
import Storefront from './Storefront.jsx'
import { getSession } from './api'
import { LangProvider } from './i18n'

const CART_KEY = 'cart'

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

function Root() {
  const [session, setSession] = useState(getSession)
  const [showLogin, setShowLogin] = useState(false)
  const [view, setView] = useState(() => (new URLSearchParams(window.location.search).get('payment') ? 'payment' : 'shop'))
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

  const handleLogin = (newSession) => {
    setSession(newSession)
    setShowLogin(false)
  }

  const changeQty = (id, qty) => {
    setCart((prev) => {
      const next = { ...prev }
      if (qty <= 0) delete next[id]
      else next[id] = qty
      return next
    })
  }

  if (view === 'payment') {
    return (
      <PaymentResult
        session={session}
        onBack={() => {
          window.history.replaceState({}, '', window.location.pathname)
          setView('shop')
        }}
      />
    )
  }

  if (session?.role === 'admin' && view === 'admin') {
    return <App onOpenShop={() => setView('shop')} />
  }

  if (session?.role === 'client' && view === 'myorders') {
    return <MyOrders onBack={() => setView('shop')} />
  }

  return (
    <>
      {view === 'checkout' ? (
        <Checkout
          key={session?.token || 'guest'}
          session={session}
          cart={cart}
          onBack={() => setView('shop')}
          onDone={() => setCart({})}
          onOpenLogin={() => setShowLogin(true)}
        />
      ) : (
        <Storefront
          key={session?.token || 'guest'}
          session={session}
          cart={cart}
          onChangeQty={changeQty}
          onCheckout={() => setView('checkout')}
          onOpenLogin={() => setShowLogin(true)}
          onOpenAdmin={() => setView('admin')}
          onOpenMyOrders={() => setView('myorders')}
        />
      )}
      {showLogin && <Login onLogin={handleLogin} onClose={() => setShowLogin(false)} />}
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
