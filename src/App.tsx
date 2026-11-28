import { useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Brands from './pages/Brands'
import Audits from './pages/Audits'
import BrandView from './pages/BrandView'
import AuditView from './pages/AuditView'
import McpPage from './pages/McpPage'
import OAuthConsent from './pages/OAuthConsent'
import Guide from './pages/Guide'
import Team from './pages/Team'
import Templates from './pages/Templates'
import Join from './pages/Join'
import Account from './pages/Account'
import Legal from './pages/Legal'
import Chrome from './components/Chrome'

/** Pages someone can arrive at before they have signed in, and must be
 *  returned to afterwards: an invitation, and an MCP client asking to connect. */
const RETURN_TO = ['/join/', '/oauth/consent']

// localStorage rather than sessionStorage: a sign in link from an email opens
// a new tab, which cannot see the first tab's session storage. It expires, so
// an abandoned sign in does not redirect someone days later.
const RETURN_KEY = 'after-signin'
const RETURN_TTL = 30 * 60 * 1000
function keepReturn(path: string) {
  try { localStorage.setItem(RETURN_KEY, JSON.stringify({ path, at: Date.now() })) } catch { /* private mode */ }
}
function takeReturn(): string | null {
  try {
    const raw = localStorage.getItem(RETURN_KEY)
    if (!raw) return null
    localStorage.removeItem(RETURN_KEY)
    const { path, at } = JSON.parse(raw) as { path: string; at: number }
    return Date.now() - at < RETURN_TTL && path.startsWith('/') && !path.startsWith('//') ? path : null
  } catch { return null }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const loc = useLocation()
  const navigate = useNavigate()
  // navigate changes identity with every route; the auth listener below is
  // set up once, so it reads the current one through a ref.
  const nav = useRef(navigate)
  nav.current = navigate

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (!s) return
      const back = takeReturn()
      // Through the router, not history.replaceState, which changes the
      // address bar without telling the router and leaves the old page up.
      if (back && location.pathname + location.search !== back) nav.current(back, { replace: true })
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
    if (RETURN_TO.some((p) => loc.pathname.startsWith(p))) keepReturn(loc.pathname + loc.search)
    return <Login />
  }

  // The consent page stands alone: it is a decision about this app, made on
  // the way back to another one, and the app's own navigation is a distraction.
  if (loc.pathname.startsWith('/oauth/consent')) return <OAuthConsent session={session} />

  return (
    <Chrome session={session}>
      <Routes>
        <Route path="/" element={<Navigate to="/audits" replace />} />
        <Route path="/brands" element={<Brands />} />
        <Route path="/brands/:brandId" element={<BrandView />} />
        <Route path="/brand/:brandId" element={<OldBrandLink />} />
        <Route path="/audits" element={<Audits />} />
        <Route path="/audit/:auditId" element={<AuditView />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/guide" element={<Guide />} />
        <Route path="/mcp" element={<McpPage />} />
        <Route path="/api" element={<Navigate to={{ pathname: '/mcp', hash: '#api' }} replace />} />
        <Route path="/team" element={<Team />} />
        <Route path="/account" element={<Account />} />
        <Route path="/legal/:doc" element={<Legal />} />
        <Route path="/join/:token" element={<Join />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Chrome>
  )
}

/** Brand pages used to live at /brand/:id. Old links and bookmarks still work. */
function OldBrandLink() {
  const { brandId } = useParams()
  return <Navigate to={`/brands/${brandId}`} replace />
}
