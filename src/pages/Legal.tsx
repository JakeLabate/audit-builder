import { Link, useParams } from 'react-router-dom'

/**
 * Terms and privacy.
 *
 * Written to be read rather than to be unreadable. The obligations are real
 * either way, and a workspace holding somebody else's client work deserves to
 * know what happens to it in plain words.
 */
const UPDATED = '26 September 2026'

export default function Legal() {
  const { doc } = useParams()
  const privacy = doc === 'privacy'
  return (
    <div className="page-wrap doc">
      <header className="doc-hd">
        <h1>{privacy ? 'Privacy' : 'Terms'}</h1>
        <p>
          Last updated {UPDATED}. {privacy
            ? 'What is stored, why, who can see it, and how to take it back.'
            : 'What you can expect from AuditBuilder and what it expects from you.'}
        </p>
      </header>

      {privacy ? <Privacy /> : <Terms />}

      <p className="doc-end">
        <Link className="btn" to={privacy ? '/legal/terms' : '/legal/privacy'}>
          {privacy ? 'Read the terms' : 'Read the privacy notice'}
        </Link>
      </p>
    </div>
  )
}

function Privacy() {
  return (
    <>
      <section className="doc-s">
        <h2>What is stored</h2>
        <p className="doc-p">
          Your name, email address and profile picture, taken from however you signed in.
          Everything you put into the app: brands, audits, findings, exhibits, exported
          documents, API keys as hashes. Nothing else. There is no analytics script, no
          advertising pixel and no session recorder on this app.
        </p>
      </section>
      <section className="doc-s">
        <h2>Who can see it</h2>
        <p className="doc-p">
          Anybody you have invited into your workspace, at the role you gave them. Nobody
          in another workspace, which is enforced by the database on every read and write
          rather than by the interface.
        </p>
        <p className="doc-p">
          Exported documents are stored privately and reached through a signed link that
          expires after 30 days. Anyone holding that link can open the document until it
          expires, so treat it as you would the document itself.
        </p>
        <p className="doc-p">
          The operator of this service can technically reach the database, as the operator
          of any hosted service can. It is not read except when you ask for help with
          something specific, or where the law requires it.
        </p>
      </section>
      <section className="doc-s">
        <h2>Where it lives</h2>
        <p className="doc-p">
          On Supabase (Postgres and file storage) and Cloudflare (the app and the document
          renderer), in the United States. Connecting Google Drive sends a register to your
          own Drive, under your own Google account, using a permission limited to files this
          app creates. It cannot see the rest of your Drive.
        </p>
      </section>
      <section className="doc-s">
        <h2>Taking it back, or deleting it</h2>
        <p className="doc-p">
          Every audit exports to a document and a spreadsheet at any time, and the API
          returns the whole record as JSON, CSV or Markdown. Deleting your account removes
          your profile and your membership of every workspace, and any workspace left with
          nobody in it is deleted with everything in it. The app shows you exactly what
          will go before you confirm. It cannot be undone.
        </p>
      </section>
      <section className="doc-s">
        <h2>Cookies</h2>
        <p className="doc-p">
          One, holding your sign in session. There is no tracking cookie, so there is no
          cookie banner.
        </p>
      </section>
    </>
  )
}

function Terms() {
  return (
    <>
      <section className="doc-s">
        <h2>What this is</h2>
        <p className="doc-p">
          A tool for writing and delivering SEO audits. You keep every right in what you
          write. Putting it here grants nothing except permission to store it, render it and
          show it back to you and to whoever you invite.
        </p>
      </section>
      <section className="doc-s">
        <h2>Your account</h2>
        <p className="doc-p">
          Keep your sign in and your API keys to yourself. Anything done with your key is
          treated as done by you, which is why a key can be revoked from the API page at any
          moment. Do not put data in here that you are not allowed to process, and do not use
          it to store anything unlawful.
        </p>
      </section>
      <section className="doc-s">
        <h2>What is promised, and what is not</h2>
        <p className="doc-p">
          This is early software offered as it is. There is no uptime guarantee and no
          promise that a feature will still work the same way next month. Backups exist but
          should not be your only copy: export anything you would be upset to lose.
        </p>
        <p className="doc-p">
          Priority scores and bands are arithmetic applied to judgements you supplied. They
          are not advice, and nobody here is responsible for a decision made because of one.
        </p>
      </section>
      <section className="doc-s">
        <h2>Ending it</h2>
        <p className="doc-p">
          Delete your account whenever you like, from the account menu. An account may be
          suspended for using the service unlawfully or for degrading it for other people,
          and where that is possible you will be told why first.
        </p>
      </section>
      <section className="doc-s">
        <h2>Changes</h2>
        <p className="doc-p">
          When these terms change materially the date above changes and you will be told in
          the app. Continuing to use it after that is acceptance.
        </p>
      </section>
    </>
  )
}
