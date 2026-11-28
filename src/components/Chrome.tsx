import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Link, NavLink, useLocation } from 'react-router-dom'
import AccountMenu, { PAGES, onPage } from './AccountMenu'

export default function Chrome({ session, children }: { session: Session; children: ReactNode }) {
  const { pathname } = useLocation()
  return (
    <>
      <header className="top">
        <Link className="brandmark" to="/">
          AuditBuilder
        </Link>
        {/* Below 760px these move into the account menu, which is the only
            thing on the header with room for them. */}
        <nav className="topnav">
          {PAGES.map((p) => (
            <NavLink key={p.to} to={p.to}
              className={({ isActive }) => 'topnav-l' + (onPage(p, isActive, pathname) ? ' on' : '')}>
              {p.label}
            </NavLink>
          ))}
        </nav>
        <span className="grow" />
        <AccountMenu session={session} />
      </header>
      {children}
    </>
  )
}
