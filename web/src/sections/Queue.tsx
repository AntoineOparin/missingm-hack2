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
const runs = [...activity].reverse().slice(0, 3)
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

  const shown = filter ? rows.filter((r) => r.tier === filter) : rows

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

      <div className="q-runs" aria-label="What the automation did">
        <p className="q-stat-name">What ran by itself</p>
        <ul>
          {runs.map((run) => (
            <li key={run.date}>
              <span className="num">{date(run.date)}</span>
              <span>
                <span className="num">{run.actions.length}</span> emails written
              </span>
              <span className="muted">
                {tiers
                  .filter((t) => run.actions.some((a) => a.tier === t))
                  .map((t) => tierCount(t, run.actions.filter((a) => a.tier === t).length))
                  .join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      </div>

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
        <div className="q-scroll" role="region" aria-label="Bills to chase" tabIndex={0}>
          <table className="q-table">
            <caption className="q-sr">
              {filter ? `${tierLabel(filter)} bills` : 'All bills'}, most urgent first. Select a customer to open the ready-to-send email.
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
              {shown.map((r) => (
                <tr key={r.orderId} onClick={() => show(r)}>
                  <td className="num q-rank muted">{r.rank}</td>
                  <td>
                    <button type="button" className="q-open" data-order={r.orderId} onClick={() => show(r)} aria-haspopup="dialog">
                      {r.customer}
                    </button>
                    <span className="q-sub muted">
                      Bill {r.orderId} · {habit(r.customerAvgDaysLate)} · emailed {date(r.sentOn)}
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
