/**
 * The register, as the Findings tab actually renders it.
 *
 * The row under the header is the part worth seeing: a register goes to people
 * who were not in the audit, and a bare column called "Reach" tells them
 * nothing. It is the difference between a file somebody uses and a file
 * somebody asks you about.
 */
export default function RegisterPreview({ reg }: {
  reg: { headers: string[]; notes: string[]; widths: number[]; wrap: boolean[]; rows: string[][] }
}) {
  return (
    <div className="rp">
      <div className="rp-scroll">
        <table className="rp-tab">
          <thead>
            <tr>{reg.headers.map((h, i) => (
              <th key={i} style={{ minWidth: Math.min(reg.widths[i] ?? 140, 210) }}>{h}</th>
            ))}</tr>
            <tr className="rp-note">{reg.notes.map((n, i) => <td key={i}>{n}</td>)}</tr>
          </thead>
          <tbody>
            {reg.rows.map((r, i) => (
              <tr key={i}>{r.map((c, j) => (
                <td key={j} className={reg.wrap[j] ? 'w' : ''}><span>{c}</span></td>
              ))}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="rp-hint">
        {reg.headers.length} columns, {reg.rows.length} findings. Scroll sideways.
        You choose which columns travel and in what order before you export.
      </p>
    </div>
  )
}
