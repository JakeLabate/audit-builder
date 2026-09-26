import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Link, NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Chrome({ session, children }: { session: Session; children: ReactNode }) {
  const meta = session.user.user_metadata as { avatar_url?: string; full_name?: string }
  return (
    <>
      <header className="top">
        <Link className="brandmark" to="/">
          AuditBuilder<span>Findings</span>
        </Link>
        <nav className="topnav">
          <NavLink to="/guide" className={({ isActive }) => 'topnav-l' + (isActive ? ' on' : '')}>
            <span className="nav-long">How it works</span><span className="nav-short">Guide</span>
          </NavLink>
          <NavLink to="/api" className={({ isActive }) => 'topnav-l' + (isActive ? ' on' : '')}>
            <span className="nav-long">API and MCP</span><span className="nav-short">API</span>
          </NavLink>
          <NavLink to="/team" className={({ isActive }) => 'topnav-l' + (isActive ? ' on' : '')}>
            <span className="nav-long">People</span><span className="nav-short">People</span>
          </NavLink>
        </nav>
        <span className="grow" />
        <div className="who">
          {meta.avatar_url && <img src={meta.avatar_url} alt="" />}
          <span>{meta.full_name ?? session.user.email}</span>
          <button className="btn sm" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>
      {children}
    </>
  )
}
