import { Link } from 'react-router-dom'

/**
 * How the app works.
 *
 * Written as an argument rather than a feature tour: most of what is
 * unfamiliar here is unfamiliar because it is a deliberate constraint, and a
 * constraint you do not understand just reads as an obstacle.
 */
export default function Guide() {
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
          The registry is the part people skip and then miss. Putting pillars, templates, owners and
          metrics on the brand rather than typing them per finding is what makes the register
          sortable and the roadmap addable. Fill it in once and every audit for that client inherits
          a consistent spine.
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
        <div className="bandgrid">
          <div><b>P1</b><span>80 to 100</span><em>Do this first</em></div>
          <div><b>P2</b><span>55 to 79</span><em>Scheduled work</em></div>
          <div><b>P3</b><span>30 to 54</span><em>Do alongside</em></div>
          <div><b>P4</b><span>under 30</span><em>Monitor</em></div>
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
          generated from the pillar, windows and reach are derived, status transitions are
          constrained, and a write that contradicts what the database derived is rejected with a
          reason. Slower to start, much harder to produce something incoherent.
        </p>
        <p className="doc-p">
          The mode is set per audit and cannot be changed later, because half a record written
          under one set of rules and half under another is worse than either.
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
      </section>

      <section className="doc-s">
        <h2>A first pass</h2>
        <ol className="doc-ol">
          <li>Open the sample audit and read one finding all the way through. That is the shape everything else has to fit.</li>
          <li>Run Export on it. You get a real PDF and a real Sheet, and the whole point of the app is visible in about a minute.</li>
          <li>Make a brand for a real client and fill in the registry properly. It is the only tedious part and it pays for itself immediately.</li>
          <li>Start an audit, pick a mode, and write one finding end to end before writing ten badly.</li>
          <li>Delete the sample whenever it stops being useful.</li>
        </ol>
      </section>

      <section className="doc-s">
        <h2>Doing it programmatically</h2>
        <p className="doc-p">
          Everything above is available over REST and over MCP, driven by the same handlers, so an
          agent can write findings that obey exactly the same rules. See <Link to="/api">API and MCP</Link>.
        </p>
      </section>

      <p className="doc-end">
        <Link className="btn pri" to="/">Go to your brands</Link>
      </p>
    </div>
  )
}
