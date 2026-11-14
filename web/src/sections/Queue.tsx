import { useEffect, useRef, useState } from 'react'
import { activity, queue, story, type QueueItem } from '../data'
import { money, moneyShort } from '../lib/format'
import './Queue.css'

// Most urgent first; unknown tiers from a future pipeline run fall in after these.
const TIER_ORDER = ['escalate', 'firm', 'reminder', 'pre-due']
const TIER_LABEL: Record<string, string> = { escalate: 'Call now', firm: 'Firm notice', reminder: 'Friendly reminder', 'pre-due': 'Heads-up' }
const tierLabel = (t: string) => TIER_LABEL[t] ?? t

const rows = [...queue].sort((a, b) => a.rank - b.rank)
const tiers = [...new Set(rows.map((r) => r.tier))].sort((a, b) => (TIER_ORDER.indexOf(a) + 1 || 99) - (TIER_ORDER.indexOf(b) + 1 || 99))
const count = (t: string) => rows.filter((r) => r.tier === t).length
const total = rows.reduce((sum, r) => sum + r.amount, 0)
// Newest automation runs first.
const allRuns = [...activity].reverse()
const runs = allRuns.slice(0, 4)
// A bill is "new" when the latest run emailed it, which only means something once there is an earlier run.
const isNew = (r: QueueItem) => allRuns.length > 1 && r.sentOn === allRuns[0].date
const TRIGGER_LABEL: Record<string, string> = { schedule: 'Monday schedule', 'new data': 'New payment data', 'by hand': 'Started by hand' }
// Older runs were logged before the pipeline recorded a trigger.
const trigger = (run: (typeof activity)[number]) => ('trigger' in run && typeof run.trigger === 'string' ? (TRIGGER_LABEL[run.trigger] ?? run.trigger) : null)
// Filter value for "what the latest run changed"; tiers are the other filter values.
const NEW = 'new'
const newCount = rows.filter(isNew).length
// Bills shown before "Show all"; the top of the list is what gets acted on.
const FIRST = 10
const overdue = rows.reduce((sum, r) => sum + (r.daysOverdue > 0 ? r.amount : 0), 0)

const dateFmt = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const date = (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00Z`))
const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`
const late = (d: number) => (d > 0 ? `${days(d)} late` : d === 0 ? 'due today' : `due in ${days(-d)}`)
// A customer who pays early on average reads as "on time", never "-1 days late".
const habit = (avg: number) => (Math.round(avg) > 0 ? `usually pays ${days(Math.round(avg))} late` : 'usually pays on time')
// Counted form of each step, for the run summary ("9 call-now notices").
const TIER_NOUN: Record<string, [string, string]> = {
  escalate: ['call-now notice', 'call-now notices'],
  firm: ['firm notice', 'firm notices'],
  reminder: ['friendly reminder', 'friendly reminders'],
  'pre-due': ['heads-up', 'heads-ups'],
}
const tierCount = (t: string, n: number) => `${n} ${TIER_NOUN[t]?.[n === 1 ? 0 : 1] ?? tierLabel(t).toLowerCase()}`
// The workflow's schedule fires on Mondays (.github/workflows/chase-bills.yml): the first Monday after `iso`.
const nextMonday = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7))
  return d.toISOString().slice(0, 10)
}
const nextRun = nextMonday(allRuns[0]?.date ?? story.meta.asOf)

function Tier({ tier }: { tier: string }) {
  return (
    <span className="q-tier" data-tier={tier}>
      {tierLabel(tier)}
    </span>
  )
}

export default function Queue() {
  const [filter, setFilter] = useState<string | null>(null)
  const [open, setOpen] = useState<QueueItem | null>(null)
  const [copy, setCopy] = useState<'idle' | 'done' | 'failed'>('idle')
  const dialog = useRef<HTMLDialogElement>(null)
  const body = useRef<HTMLPreElement>(null)
  const copyBtn = useRef<HTMLButtonElement>(null)
  const lastId = useRef('')

  const [all, setAll] = useState(false)
  const shown = filter === NEW ? rows.filter(isNew) : filter ? rows.filter((r) => r.tier === filter) : rows
  const visible = all ? shown : shown.slice(0, FIRST)

  const show = (item: QueueItem) => {
    lastId.current = item.orderId
    setOpen(item)
    setCopy('idle')
  }

  // Open after the email has rendered, so focus can land on the Copy button.
  useEffect(() => {
    if (!open || dialog.current?.open) return
    dialog.current?.showModal()
    copyBtn.current?.focus()
  }, [open])

  const onClose = () => {
    setOpen(null)
    // Return focus to the row's button, also when the dialog was opened by a mouse click on the row.
    document.querySelector<HTMLButtonElement>(`#Queue [data-order="${lastId.current}"]`)?.focus()
  }

  const copyEmail = async () => {
    if (!open) return
    try {
      await navigator.clipboard.writeText(`Subject: ${open.emailSubject}\n\n${open.emailBody}`)
      setCopy('done')
    } catch {
      // Clipboard blocked (insecure origin or denied): select the text so Cmd/Ctrl+C works.
      setCopy('failed')
      if (body.current) getSelection()?.selectAllChildren(body.current)
    }
  }

  return (
    <section id="Queue" className="q" aria-labelledby="queue-title">
      <header className="q-head">
        <p className="eyebrow">Your weekly list</p>
        <h2 id="queue-title">Who to chase this week</h2>
        <p className="muted">
          Every Monday, and whenever new payment data arrives, this list rebuilds itself and writes an email for each bill that reached a new step. Ranked by
          how much is owed, how late it is, and how late that customer usually pays. This list is from {date(story.meta.asOf)}.
        </p>
      </header>

      <section className="q-runs" aria-labelledby="queue-runs-title">
        <h3 id="queue-runs-title">What the automation did</h3>
        {runs.length === 0 ? (
          <p className="muted">It has not run yet.</p>
        ) : (
          <ol className="q-run-list">
            {runs.map((run) => (
              <li key={run.date} className="q-run">
                <p className="num q-run-date">{date(run.date)}</p>
                <div>
                  <p>
                    <span className="num">{run.actions.length}</span> {run.actions.length === 1 ? 'email' : 'emails'} written to{' '}
                    <code className="q-path">outbox/{run.date}/</code>
                    {trigger(run) && <span className="muted"> · {trigger(run)}</span>}
                  </p>
                  <p className="muted q-run-detail">
                    {tiers
                      .filter((t) => run.actions.some((a) => a.tier === t))
                      .map((t) => tierCount(t, run.actions.filter((a) => a.tier === t).length))
                      .join(' · ')}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
        <p className="q-run-next">
          Next run: <span className="num">Monday, {date(nextRun)}</span>, or sooner if new payment data arrives. A run only writes emails for bills that moved
          to a new step.
        </p>
        <p className="muted q-run-note">The emails are saved as files, ready to send. They are not delivered: the data has no customer email addresses.</p>
      </section>

      <div className="q-totals">
        <div>
          <p className="q-stat-name">Bills to chase</p>
          <p className="num q-stat">{rows.length}</p>
        </div>
        <div>
          <p className="q-stat-name">Owed on these bills</p>
          <p className="num q-stat">{money(total)}</p>
          <p className="q-stat-note muted">
            of <span className="num">{moneyShort(story.receivables.openTotal)}</span> unpaid in all
          </p>
        </div>
        <div>
          <p className="q-stat-name">Already past due</p>
          <p className="num q-stat leak">{money(overdue)}</p>
        </div>
      </div>

      <div className="q-filters" role="group" aria-label="Filter by next step">
        <button type="button" className="q-filter" aria-pressed={filter === null} onClick={() => setFilter(null)}>
          All <span className="num">{rows.length}</span>
        </button>
        {newCount > 0 && (
          <button type="button" className="q-filter q-filter-new" aria-pressed={filter === NEW} onClick={() => setFilter(NEW)}>
            New this run <span className="num">{newCount}</span>
          </button>
        )}
        {tiers.map((t) => (
          <button key={t} type="button" className="q-filter" data-tier={t} aria-pressed={filter === t} onClick={() => setFilter(t)}>
            <span className="q-dot" aria-hidden="true" />
            {tierLabel(t)} <span className="num">{count(t)}</span>
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="card">Nothing to chase this week.</p>
      ) : (
        <div className="q-scroll" role="region" aria-label="Bills to chase">
          <table className="q-table">
            <caption className="q-sr">
              {filter === NEW ? 'Bills emailed on the latest run' : filter ? `${tierLabel(filter)} bills` : 'All bills'}, most urgent first
              {visible.length < shown.length && `, showing ${visible.length} of ${shown.length}`}. Select a customer to open the ready-to-send email.
            </caption>
            <thead>
              <tr>
                <th scope="col" className="q-rank">
                  #
                </th>
                <th scope="col">Customer</th>
                <th scope="col" className="q-right">
                  Amount
                </th>
                <th scope="col" className="q-due">
                  Due date
                </th>
                <th scope="col" className="q-right">
                  Days late
                </th>
                <th scope="col">Next step</th>
                <th scope="col" className="q-action">
                  What to do
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                // The button's click (mouse or keyboard) bubbles here, so the email opens once.
                <tr key={r.orderId} onClick={() => show(r)}>
                  <td className="num q-rank muted">{r.rank}</td>
                  <td>
                    <button type="button" className="q-open" data-order={r.orderId} aria-haspopup="dialog">
                      {r.customer}
                    </button>
                    <span className="q-sub muted">
                      <span className="q-id">Bill {r.orderId}</span> · {habit(r.customerAvgDaysLate)} ·{' '}
                      {isNew(r) ? <strong className="q-new">emailed this run</strong> : `last emailed ${date(r.sentOn)}`}
                    </span>
                  </td>
                  <td className="num q-right">{money(r.amount)}</td>
                  <td className="num q-due">{date(r.dueDate)}</td>
                  <td className={`num q-right ${r.daysOverdue > 0 ? '' : 'muted'}`}>{r.daysOverdue > 0 ? r.daysOverdue : late(r.daysOverdue)}</td>
                  <td>
                    <Tier tier={r.tier} />
                  </td>
                  <td className="q-action">{r.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!all && shown.length > FIRST && (
        <button type="button" className="q-btn q-more" onClick={() => setAll(true)}>
          Show all <span className="num">{shown.length}</span> bills
        </button>
      )}

      <dialog
        ref={dialog}
        className="q-dialog"
        aria-labelledby="queue-email-title"
        onClose={onClose}
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
      >
        {open && (
          <div className="q-email">
            <div className="q-email-head">
              <div>
                <p className="eyebrow">Ready-to-send email · {open.customer}</p>
                <h3 id="queue-email-title">{open.emailSubject}</h3>
              </div>
              <Tier tier={open.tier} />
            </div>
            <p className="q-email-meta muted">
              <span className="num">{money(open.amount)}</span> · due {date(open.dueDate)} · {late(open.daysOverdue)} · {open.action}
            </p>
            <pre ref={body} className="q-email-body">
              {open.emailBody}
            </pre>
            <div className="q-email-actions">
              <span className="q-copy-status" role="status">
                {copy === 'done' ? 'Copied to clipboard.' : copy === 'failed' ? 'Copy blocked. Text selected: press Ctrl+C or Cmd+C.' : ''}
              </span>
              <button type="button" className="q-btn" onClick={() => dialog.current?.close()}>
                Close
              </button>
              <button ref={copyBtn} type="button" className="q-btn q-btn-primary" onClick={copyEmail}>
                {copy === 'done' ? 'Copied' : 'Copy email'}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </section>
  )
}
