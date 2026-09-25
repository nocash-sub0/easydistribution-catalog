import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Checkout from './Checkout.jsx'
import Login from './Login.jsx'
import Storefront from './Storefront.jsx'
import { getSession } from './api'
import { LangProvider } from './i18n'

function Root() {
  const [session, setSession] = useState(getSession)
  const [showLogin, setShowLogin] = useState(false)
  const [view, setView] = useState('shop')
  // корзина живёт здесь, чтобы переходить между витриной и страницей оплаты не теряя товары
  const [cart, setCart] = useState({})

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

  if (session?.role === 'admin' && view === 'admin') {
    return <App onOpenShop={() => setView('shop')} />
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
