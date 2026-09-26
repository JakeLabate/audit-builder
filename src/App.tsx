import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Brands from './pages/Brands'
import BrandView from './pages/BrandView'
import AuditView from './pages/AuditView'
import ApiPage from './pages/ApiPage'
import Guide from './pages/Guide'
import Team from './pages/Team'
import Join from './pages/Join'
import Account from './pages/Account'
import Legal from './pages/Legal'
import Chrome from './components/Chrome'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (!s) return
      try {
        const back = sessionStorage.getItem('after-signin')
        if (back) {
          sessionStorage.removeItem('after-signin')
          if (location.pathname !== back) history.replaceState(null, '', back)
        }
      } catch { /* private mode */ }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!ready) return <div className="center"><span className="saving">Loading</span></div>
  // An invitation link is the first thing a new person ever opens, and it
  // arrives before they have an account. Remember where they were going so
  // signing in does not throw the invitation away.
  if (!session) {
    // Terms and privacy have to be readable before you sign in. The sign in
    // screen links to them, and a link that bounces you back to the sign in
    // screen is worse than no link.
    if (location.pathname.startsWith('/legal/')) {
      // main.tsx already provides the router; nesting a second one breaks
      // navigation everywhere else.
      return (
        <Routes>
          <Route path="/legal/:doc" element={<Legal />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )
    }
    // An invitation link is the first thing a new person ever opens, and it
    // arrives before they have an account. Remember where they were going so
    // signing in does not throw the invitation away.
    if (location.pathname.startsWith('/join/')) {
      try { sessionStorage.setItem('after-signin', location.pathname) } catch { /* private mode */ }
    }
    return <Login />
  }

  return (
    <Chrome session={session}>
      <Routes>
        <Route path="/" element={<Brands />} />
        <Route path="/brand/:brandId" element={<BrandView />} />
        <Route path="/audit/:auditId" element={<AuditView />} />
        <Route path="/guide" element={<Guide />} />
        <Route path="/api" element={<ApiPage />} />
        <Route path="/team" element={<Team />} />
        <Route path="/account" element={<Account />} />
        <Route path="/legal/:doc" element={<Legal />} />
        <Route path="/join/:token" element={<Join />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Chrome>
  )
}
