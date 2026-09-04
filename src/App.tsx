import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Brands from './pages/Brands'
import BrandView from './pages/BrandView'
import AuditView from './pages/AuditView'
import Chrome from './components/Chrome'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!ready) return <div className="center"><span className="saving">Loading</span></div>
  if (!session) return <Login />

  return (
    <Chrome session={session}>
      <Routes>
        <Route path="/" element={<Brands />} />
        <Route path="/brand/:brandId" element={<BrandView />} />
        <Route path="/audit/:auditId" element={<AuditView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Chrome>
  )
}
