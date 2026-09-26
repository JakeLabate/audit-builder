import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { acceptInvite } from '../lib/team'

/**
 * Accepting an invitation.
 *
 * The caller is already signed in by the time this renders, because the app
 * shows the sign in screen first and returns here afterwards. The address on
 * the invitation has to match the signed in one, so the common failure is a
 * real one worth explaining rather than a dead end.
 */
export default function Join() {
  const { token } = useParams()
  const nav = useNavigate()
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working')
  const [msg, setMsg] = useState('')
  const once = useRef(false)

  useEffect(() => {
    if (once.current || !token) return
    once.current = true   // an invitation is single use, so never fire it twice
    ;(async () => {
      try {
        const r = await acceptInvite(token)
        setMsg(r.org_name)
        setState('done')
        setTimeout(() => nav('/', { replace: true }), 1800)
      } catch (e) {
        setMsg((e as Error).message)
        setState('failed')
      }
    })()
  }, [token, nav])

  return (
    <div className="center">
      <div className="joinbox">
        {state === 'working' && <p className="saving">Checking that invitation</p>}
        {state === 'done' && (
          <>
            <h2>You are in</h2>
            <p>{msg}. Taking you there now.</p>
          </>
        )}
        {state === 'failed' && (
          <>
            <h2>That did not work</h2>
            <p>{msg}</p>
            <button className="btn" onClick={() => nav('/', { replace: true })}>
              Go to your workspace
            </button>
          </>
        )}
      </div>
    </div>
  )
}
