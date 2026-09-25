import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Login from './Login.jsx'
import Storefront from './Storefront.jsx'
import { getSession } from './api'

function Root() {
  const [session, setSession] = useState(getSession)

  if (!session) return <Login onLogin={setSession} />
  if (session.role === 'admin') return <App />
  return <Storefront session={session} />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
