import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Login from './Login.jsx'
import Storefront from './Storefront.jsx'
import { getSession } from './api'

function Root() {
  const [session, setSession] = useState(getSession)
  const [showLogin, setShowLogin] = useState(false)
  const [view, setView] = useState('shop')

  const handleLogin = (newSession) => {
    setSession(newSession)
    setShowLogin(false)
  }

  if (session?.role === 'admin' && view === 'admin') {
    return <App onOpenShop={() => setView('shop')} />
  }

  return (
    <>
      <Storefront
        key={session?.token || 'guest'}
        session={session}
        onOpenLogin={() => setShowLogin(true)}
        onOpenAdmin={() => setView('admin')}
      />
      {showLogin && <Login onLogin={handleLogin} onClose={() => setShowLogin(false)} />}
    </>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
