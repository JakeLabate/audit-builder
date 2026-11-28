import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Flipbook from '../components/Flipbook'
import RegisterPreview from '../components/RegisterPreview'

interface Sample {
  brand: string; title: string; kind: string | null
  head: string; pages: string[]; images?: string[]
  register: { headers: string[]; notes: string[]; widths: number[]; wrap: boolean[]; rows: string[][] }
}

/**
 * How the app works.
 *
 * Written as an argument rather than a feature tour: most of what is
 * unfamiliar here is unfamiliar because it is a deliberate constraint, and a
 * constraint you do not understand just reads as an obstacle.
 */
export default function Guide() {
  // Fetched rather than bundled: a fifteen page report is dead weight in the
  // main chunk for everyone who never opens this page.
  const [sample, setSample] = useState<Sample | null>(null)
  const [sampleErr, setSampleErr] = useState(false)
  useEffect(() => {
    fetch('/sample-report.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setSample)
      .catch(() => setSampleErr(true))
  }, [])

  return (
    <div className="page-wrap doc">
      <header className="doc-hd">
        <h1>How this works</h1>
        <p>
          Ten minutes of reading. Your workspace already has a sample audit in it, so you can
          open anything below and look at the real thing rather than a description of it.
        </p>
      </header>

      <section className="doc-s">
        <h2>The shape of it</h2>
        <p className="doc-p">
          Three levels, and nothing else. A <b>brand</b> is a client: their domain, their colours,
          and a registry of the vocabulary their findings are allowed to use. An <b>audit</b> is one
          engagement against that brand, carrying what you looked at, what you looked with, and what
          you could not see. A <b>finding</b> is one claim.
        </p>
        <p className="doc-p">
          Each audit opens on its <b>Overview</b>: the question it answers, the numbers it is judged
          on and where they stood at the start, what it covers and leaves out, and what it concluded
          across its findings, grouped into themes. The brief and the summary print at the front of
          the document, and a finding that strays outside the scope is flagged where it is edited.
        </p>
        <p className="doc-p">
          The registry is the part people skip and then miss. Putting templates, components, owners
          and metrics on the brand rather than typing them per finding is what makes the register
          sortable and the roadmap addable. Categories are different: they are one universal,
          two-level list for every workspace, so a reference like Indexation/Canonicals/2 means the
          same thing in every audit.
        </p>
      </section>

      <section className="doc-s">
        <h2>A finding is a claim, not a note</h2>
        <p className="doc-p">
          The record has fifty three fields, which sounds like a lot until you see what they are
          for. They answer five questions in order, and a finding that cannot answer all five is
          not finished.
        </p>
        <ol className="doc-ol">
          <li><b>What is wrong.</b> Stated as something a client can disagree with. "Product pages canonicalise to their category" is a claim. "Canonical issues" is a label.</li>
          <li><b>How you know.</b> Measurements, each with what you checked, what you got and when. Plus the tools, and a confidence level that has to say why if it is not high.</li>
          <li><b>What it costs.</b> A metric at risk, and optionally a number. Assert a number and the app requires you to say where it came from. That rule exists because the number is the thing that gets quoted back at you six weeks later.</li>
          <li><b>What to do.</b> An instruction to a named owner, broken into steps an engineer can follow without asking you a question.</li>
          <li><b>How you will know it worked.</b> Written before the fix, not after. This is the field that separates an audit from a list of opinions.</li>
        </ol>
      </section>

      <section className="doc-s">
        <h2>Priority is computed, not argued</h2>
        <p className="doc-p">
          You supply six judgements: severity, reach, confidence, leverage, effort, and a risk
          triple for how dangerous the fix itself is. The score falls out of them.
        </p>
        <pre className="formula-box"><code>score = 3 x (severity x reach x confidence x leverage)
        ÷ √effort x risk factor</code></pre>
        <p className="doc-p">
          Effort sits under a square root deliberately. Divide by it outright and the register
          recommends nothing but trivia; ignore it and the register recommends nothing you can
          actually ship this quarter. The square root says a fix taking four times as long is
          penalised twice, not four times.
        </p>
        <p className="doc-p">
          Two consequences worth knowing. The same inputs always produce the same order, so two
          audits written months apart stay comparable. And when a client argues with the ordering,
          the argument is about an input you can both look at rather than about your instincts.
        </p>
        <p className="doc-p">
          The band is a position inside its own audit, not a fixed number. That is deliberate.
          Cutting at fixed scores meant only a finding that was severe and high leverage and
          near total reach ever reached P1, so an audit where nothing was catastrophic read as
          though nothing mattered: most of it came out as Monitor. A band answers what to do
          first here; the score, which is on every page, is what compares two audits.
          Findings that score the same always share a band.
        </p>
        <div className="bandgrid">
          <div><b>P1</b><span>top 15%</span><em>Do this first</em></div>
          <div><b>P2</b><span>next 25%</span><em>Scheduled work</em></div>
          <div><b>P3</b><span>next 30%</span><em>Do alongside</em></div>
          <div><b>P4</b><span>the rest</span><em>Monitor</em></div>
        </div>
      </section>

      <section className="doc-s">
        <h2>Two ways to write one</h2>
        <p className="doc-p">
          <b>Manual</b> leaves every field to you and enforces nothing. Right when you are
          reproducing something that already exists, or when the work is qualitative and forcing
          numbers onto it would be dishonest.
        </p>
        <p className="doc-p">
          <b>Logic</b> makes the database do the work it can do without you. References are
          issued from the category, sources and the confidence factor are derived, status transitions are
          constrained, and a write that contradicts what the database derived is rejected with a
          reason. Slower to start, much harder to produce something incoherent.
        </p>
        <p className="doc-p">
          The mode is set per audit and cannot be changed later, because half a record written
          under one set of rules and half under another is worse than either.
        </p>
      </section>

      <section className="doc-s">
        <h2>Checklists: what was looked at</h2>
        <p className="doc-p">
          Findings can only say what is wrong. A <b>checklist</b> says what the audit set out to
          look at, so it can also say what came back clean. It is optional: an audit without one
          works exactly as described above.
        </p>
        <p className="doc-p">
          A check is not a finding. It is written as the healthy state, <i>Redirects resolve in
          one hop</i>, and it has three answers: pass, fail or not applicable. Pass and not
          applicable are the end of it. Fail asks you for the finding, stated as a claim, and
          writes it into the register with its category, its reference and its first measurement
          already filled in from the check. Nothing becomes a finding on its own.
        </p>
        <p className="doc-p">
          Checks are filed on the same two-level categories as findings, and you pick them from
          one tree: tick a category to take everything in it, or open it and choose. A preset is
          that tree arriving with ticks in it. Add checks of your own anywhere, then save the
          selection as a <Link to="/templates">template</Link> to start the next audit from. A
          template is copied into the audit that uses it, so changing it later never rewrites an
          audit that is already under way.
        </p>
        <p className="doc-p">
          An audit with a checklist gets one more section in its document, <b>What was
          checked</b>: every check and how it came out. A failed check names its finding there
          only when that finding is client-facing.
        </p>
      </section>

      <section className="doc-s">
        <h2>Exposure: what the client sees</h2>
        <p className="doc-p">
          Every finding is either <b>client</b> or <b>internal</b>. Internal findings stay in the
          app: not in the document, not in the register, not in anything you hand over. It is for
          the things worth recording that are not worth saying, which on most engagements is a
          real category.
        </p>
      </section>

      <section className="doc-s">
        <h2>Export gives you two artifacts and one decision</h2>
        <p className="doc-p">
          One button, two things. The <b>document</b> is the argument: a branded PDF, one page per
          finding, every page carrying the claim, the evidence and the fix. The <b>register</b> is
          the record: a Google Sheet with every field, a note under each column header explaining
          what it means, and a roadmap grouped into waves.
        </p>
        <p className="doc-p">
          They are not two formats of the same thing. The document is for the meeting. The register
          is for the six weeks afterwards, when someone who was not in the meeting needs to know
          what was agreed. Both links are kept on the audit permanently once exported.
        </p>
        <p className="doc-p">
          Before you export, the dialog lets you choose which sections the document contains, in
          what order, and which columns the register carries, with both previewing live as you
          change them. Every finding always gets its own whole page. If one carries more than fits,
          the least important material is dropped and the page says so rather than silently
          truncating.
        </p>
        <p className="doc-p">
          How the two look is a <Link to="/designs">design</Link>. There are five for the document
          and three for the register, and every one of them carries the same audit and is drawn
          from the brand kit. Pick one for the workspace, a different one for a brand on its
          page, or a different one for a single audit in the export dialog. The most specific
          choice wins.
        </p>

        <h3 className="doc-h3">The document</h3>
        <p className="doc-p">
          This is a real one, not a mockup: the sample audit in your workspace, run through the
          same exporter. Turn the pages with the arrows, or the arrow keys.
        </p>
        {sample?.images && (
          <Flipbook pages={sample.images}
            label={`${sample.brand}, ${sample.kind ?? 'audit'}`} />
        )}
        {!sample?.images && !sampleErr && <div className="fb-load">Loading the sample report</div>}
        {sampleErr && (
          <p className="doc-none">
            The sample report could not be loaded. Open the sample audit and press Export to
            see the real thing instead.
          </p>
        )}

        <h3 className="doc-h3">The register</h3>
        <p className="doc-p">
          The same audit, every field of it. The document argues; this one holds the record.
        </p>
        {sample && <RegisterPreview reg={sample.register} />}
      </section>

      <section className="doc-s">
        <h2>A first pass</h2>
        <ol className="doc-ol">
          <li>Open the sample audit and read one finding all the way through. That is the shape everything else has to fit.</li>
          <li>Run Export on it. You get a real PDF and a real Sheet, and the whole point of the app is visible in about a minute.</li>
          <li>Make a brand for a real client and fill in the registry properly. It is the only tedious part and it pays for itself immediately.</li>
          <li>Start an audit, fill in its Brief and Scope on the Overview, pick a mode, and write one finding end to end before writing ten badly.</li>
          <li>Delete the sample whenever it stops being useful.</li>
        </ol>
      </section>

      <section className="doc-s">
        <h2>Doing it programmatically</h2>
        <p className="doc-p">
          Everything above is available over MCP and over REST, driven by the same handlers, so an
          agent can write findings that obey exactly the same rules. An MCP client signs in with
          your AuditBuilder account; the REST API takes a key. See <Link to="/mcp">MCP</Link>.
        </p>
      </section>

      <p className="doc-end">
        <Link className="btn pri" to="/audits">Go to your audits</Link>
      </p>
    </div>
  )
}
