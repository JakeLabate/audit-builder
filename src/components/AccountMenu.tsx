import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

/**
 * The account menu, opened from the avatar.
 *
 * One menu rather than two. On a wide screen it holds the account: who you are
 * signed in as, and how to stop being. On a phone the inline nav has nowhere
 * to go, so the same menu carries the pages as well. Two separate menus, one
 * for navigation and one for the account, would be two things to find on the
 * screen that needs them least.
 */
export const PAGES = [
  { to: '/', label: 'Brands', end: true },
  { to: '/guide', label: 'How it works' },
  { to: '/api', label: 'API and MCP' },
  { to: '/team', label: 'People' },
]

export default function AccountMenu({ session }: { session: Session }) {
  const meta = session.user.user_metadata as { avatar_url?: string; full_name?: string }
  const name = meta.full_name ?? session.user.email ?? 'Signed in'
  const email = session.user.email ?? ''
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const loc = useLocation()

  const close = useCallback((focus = false) => {
    setOpen(false)
    if (focus) trigger.current?.focus()
  }, [])

  // Going somewhere is the end of the menu's usefulness.
  useEffect(() => { setOpen(false) }, [loc.pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(true) }
    // pointerdown rather than click: a click outside should dismiss before it
    // lands, or the first tap on a link somewhere else is eaten by the close.
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) close()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [open, close])

  const initials = (meta.full_name ?? email)
    .split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')

  return (
    <div className="acct" ref={box}>
      <button
        ref={trigger} className={'acct-btn' + (open ? ' on' : '')}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu" aria-expanded={open}
        aria-label={open ? 'Close account menu' : `Account menu for ${name}`}
      >
        {meta.avatar_url
          ? <img src={meta.avatar_url} alt="" />
          : <span className="acct-init" aria-hidden="true">{initials || '?'}</span>}
        <svg className="acct-caret" width="9" height="6" viewBox="0 0 9 6" aria-hidden="true">
          <path d="M1 1l3.5 3.5L8 1" fill="none" stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="acct-menu" role="menu" aria-label="Account">
          <div className="acct-who">
            <b>{name}</b>
            {email && email !== name && <span>{email}</span>}
          </div>

          {/* Only on a phone, where the inline nav is hidden. */}
          <div className="acct-pages">
            {PAGES.map((p) => (
              <NavLink key={p.to} to={p.to} end={p.end} role="menuitem"
                className={({ isActive }) => 'acct-item' + (isActive ? ' on' : '')}>
                {p.label}
              </NavLink>
            ))}
          </div>

          <button className="acct-item danger" role="menuitem" disabled={busy}
            onClick={async () => { setBusy(true); await supabase.auth.signOut() }}>
            {busy ? 'Signing out' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  )
}
