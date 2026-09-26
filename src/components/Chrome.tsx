import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Link, NavLink } from 'react-router-dom'
import AccountMenu, { PAGES } from './AccountMenu'

export default function Chrome({ session, children }: { session: Session; children: ReactNode }) {
  return (
    <>
      <header className="top">
        <Link className="brandmark" to="/">
          AuditBuilder<span>Findings</span>
        </Link>
        {/* Below 760px these move into the account menu, which is the only
            thing on the header with room for them. */}
        <nav className="topnav">
          {PAGES.filter((p) => p.to !== '/').map((p) => (
            <NavLink key={p.to} to={p.to}
              className={({ isActive }) => 'topnav-l' + (isActive ? ' on' : '')}>
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
