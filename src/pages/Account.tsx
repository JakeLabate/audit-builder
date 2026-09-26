import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DELETE_PHRASE, deleteAccount, deletionPreview, type DeletionRow } from '../lib/account'

/** Your account, and the one action in the app that cannot be undone. */
export default function Account() {
  const [rows, setRows] = useState<DeletionRow[] | null>(null)
  const [phrase, setPhrase] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    deletionPreview().then(setRows).catch((e) => setErr((e as Error).message))
  }, [])

  const losing = (rows ?? []).filter((r) => r.will_be_deleted)
  const keeping = (rows ?? []).filter((r) => !r.will_be_deleted)
  const totals = losing.reduce(
    (a, r) => ({ b: a.b + r.brands, au: a.au + r.audits, f: a.f + r.findings }),
    { b: 0, au: 0, f: 0 },
  )

  return (
    <div className="page-wrap doc">
      <header className="doc-hd">
        <h1>Account</h1>
        <p>Your data, and how to take it with you or destroy it.</p>
      </header>

      {err && <div className="issue"><b>Problem</b>{err}</div>}

      <section className="doc-s">
        <h2>Taking your work with you</h2>
        <p className="doc-p">
          Every audit exports to a document and a spreadsheet from the audit page, at any
          time, with no export limit. The <Link to="/api">API</Link> returns a whole audit as
          JSON, CSV or Markdown in one call. Do that before you delete anything: deletion
          here is immediate and there is no recovery.
        </p>
      </section>

      <section className="doc-s">
        <h2>Deleting your account</h2>
        {!rows ? <p className="doc-none">Working out what that would remove</p> : (
          <>
            {losing.length > 0 && (
              <div className="issue">
                <b>This would be destroyed</b>
                {losing.map((r) => (
                  <div key={r.workspace} className="delrow">
                    <b>{r.workspace}</b>
                    <span>{r.brands} brand{r.brands === 1 ? '' : 's'}, {r.audits} audit
                      {r.audits === 1 ? '' : 's'}, {r.findings} finding
                      {r.findings === 1 ? '' : 's'}, and every exported document</span>
                  </div>
                ))}
                <p className="delsum">
                  {totals.b} brands, {totals.au} audits and {totals.f} findings in total.
                  Nobody else is in {losing.length === 1 ? 'that workspace' : 'those workspaces'},
                  so {losing.length === 1 ? 'it goes' : 'they go'} with you.
                </p>
              </div>
            )}

            {keeping.length > 0 && (
              <p className="doc-p">
                {keeping.map((r) => r.workspace).join(', ')} {keeping.length === 1 ? 'has' : 'have'}
                {' '}other people in {keeping.length === 1 ? 'it' : 'them'}, so
                {keeping.length === 1 ? ' it survives' : ' they survive'} without you. You are
                simply removed.
              </p>
            )}

            {!open ? (
              <button className="btn danger" onClick={() => setOpen(true)}>
                Delete my account
              </button>
            ) : (
              <div className="delbox">
                <p className="doc-p">
                  Type <b>{DELETE_PHRASE}</b> to confirm. This happens immediately.
                </p>
                <div className="keymint">
                  <input value={phrase} placeholder={DELETE_PHRASE} autoFocus
                    onChange={(e) => setPhrase(e.target.value)} />
                  <button className="btn danger" disabled={busy
                      || phrase.trim().toLowerCase() !== DELETE_PHRASE}
                    onClick={async () => {
                      setBusy(true); setErr(null)
                      try { await deleteAccount(phrase) }
                      catch (e) { setErr((e as Error).message); setBusy(false) }
                    }}>
                    {busy ? 'Deleting' : 'Delete everything'}
                  </button>
                  <button className="btn" onClick={() => { setOpen(false); setPhrase('') }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <section className="doc-s">
        <h2>The small print</h2>
        <p className="doc-p">
          <Link to="/legal/terms">Terms</Link> and <Link to="/legal/privacy">privacy</Link>.
          Both are short and worth the two minutes.
        </p>
      </section>
    </div>
  )
}
