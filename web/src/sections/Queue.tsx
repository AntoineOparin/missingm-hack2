import { useEffect, useRef, useState, type ChangeEvent } from 'react'
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
// Newest automation runs first.
const allRuns = [...activity].reverse()
// A bill is "new" when the latest run emailed it, which only means something once there is an earlier run.
const isNew = (r: QueueItem) => allRuns.length > 1 && r.sentOn === allRuns[0].date
// Filter value for "what the latest run changed"; tiers are the other filter values.
const NEW = 'new'
const newCount = rows.filter(isNew).length
// Bills shown before "Show all"; the top of the list is what gets acted on.
const FIRST = 10

// Bills ticked off by hand, remembered in this browser only. Storage can be blocked, so every access is guarded.
const TICKED_KEY = 'chase-list-ticked'
const loadTicked = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(TICKED_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}
const saveTicked = (ids: Set<string>) => {
  try {
    localStorage.setItem(TICKED_KEY, JSON.stringify([...ids]))
  } catch {
    // Not saved; the ticks still hold for this visit.
  }
}

// Range filters; an empty field means "no limit". Days late is negative for bills not due yet.
type Ranges = { amountMin: string; amountMax: string; dueFrom: string; dueTo: string; lateMin: string; lateMax: string }
const NO_RANGES: Ranges = { amountMin: '', amountMax: '', dueFrom: '', dueTo: '', lateMin: '', lateMax: '' }
const inRanges = (r: QueueItem, f: Ranges) =>
  (f.amountMin === '' || r.amount >= Number(f.amountMin)) &&
  (f.amountMax === '' || r.amount <= Number(f.amountMax)) &&
  (f.dueFrom === '' || r.dueDate >= f.dueFrom) &&
  (f.dueTo === '' || r.dueDate <= f.dueTo) &&
  (f.lateMin === '' || r.daysOverdue >= Number(f.lateMin)) &&
  (f.lateMax === '' || r.daysOverdue <= Number(f.lateMax))

const dateFmt = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const date = (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00Z`))
const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`
const late = (d: number) => (d > 0 ? `${days(d)} late` : d === 0 ? 'due today' : `due in ${days(-d)}`)
// A customer who pays early on average reads as "on time", never "-1 days late".
const habit = (avg: number) => (Math.round(avg) > 0 ? `usually pays ${days(Math.round(avg))} late` : 'usually pays on time')

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
  const [ticked, setTicked] = useState(loadTicked)
  const [hideTicked, setHideTicked] = useState(false)
  const [ranges, setRanges] = useState<Ranges>(NO_RANGES)
  const rangesSet = Object.values(ranges).some((v) => v !== '')

  const byStep = filter === NEW ? rows.filter(isNew) : filter ? rows.filter((r) => r.tier === filter) : rows
  const shown = byStep.filter((r) => inRanges(r, ranges) && !(hideTicked && ticked.has(r.orderId)))
  const visible = all ? shown : shown.slice(0, FIRST)
  // Totals count only what is still to chase: ticked bills are off the list.
  const open_ = rows.filter((r) => !ticked.has(r.orderId))
  const total = open_.reduce((sum, r) => sum + r.amount, 0)
  const overdue = open_.reduce((sum, r) => sum + (r.daysOverdue > 0 ? r.amount : 0), 0)

  const tick = (id: string) =>
    setTicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      saveTicked(next)
      return next
    })
  const setRange = (key: keyof Ranges) => (e: ChangeEvent<HTMLInputElement>) => setRanges((f) => ({ ...f, [key]: e.target.value }))

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
        <h2 id="queue-title">Who to chase this week</h2>
        <p className="muted">
          Every Monday, and whenever new payment data arrives, this list rebuilds itself and writes an email for each bill that reached a new step. Ranked by
          how much is owed, how late it is, and how late that customer usually pays. This list is from {date(story.meta.asOf)}. The emails are saved as files,
          not delivered: the data has no customer email addresses.
        </p>
      </header>

      <table className="ledger q-totals">
        <tbody>
          <tr>
            <td>Bills to chase{ticked.size > 0 && <span className="muted q-stat-note"> {ticked.size} ticked off</span>}</td>
            <td className="fig">{open_.length}</td>
          </tr>
          <tr>
            <td>
              Owed on these bills <span className="muted q-stat-note">of {moneyShort(story.receivables.openTotal)} unpaid in all</span>
            </td>
            <td className="fig">{money(total)}</td>
          </tr>
          <tr className="total">
            <td>Already past due</td>
            <td className="fig leak">{money(overdue)}</td>
          </tr>
        </tbody>
      </table>

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

      <fieldset className="q-ranges">
        <legend className="q-sr">Narrow the list</legend>
        <div className="q-range">
          <span className="q-range-name">Amount</span>
          <label>
            <span className="q-sr">Amount from</span>
            <input type="number" inputMode="numeric" min={0} step={100} placeholder="$ min" value={ranges.amountMin} onChange={setRange('amountMin')} />
          </label>
          <span aria-hidden="true">to</span>
          <label>
            <span className="q-sr">Amount up to</span>
            <input type="number" inputMode="numeric" min={0} step={100} placeholder="$ max" value={ranges.amountMax} onChange={setRange('amountMax')} />
          </label>
        </div>
        <div className="q-range">
          <span className="q-range-name">Due</span>
          <label>
            <span className="q-sr">Due on or after</span>
            <input type="date" value={ranges.dueFrom} onChange={setRange('dueFrom')} />
          </label>
          <span aria-hidden="true">to</span>
          <label>
            <span className="q-sr">Due on or before</span>
            <input type="date" value={ranges.dueTo} onChange={setRange('dueTo')} />
          </label>
        </div>
        <div className="q-range">
          <span className="q-range-name">Days late</span>
          <label>
            <span className="q-sr">At least this many days late</span>
            <input type="number" inputMode="numeric" step={1} placeholder="min" value={ranges.lateMin} onChange={setRange('lateMin')} />
          </label>
          <span aria-hidden="true">to</span>
          <label>
            <span className="q-sr">At most this many days late</span>
            <input type="number" inputMode="numeric" step={1} placeholder="max" value={ranges.lateMax} onChange={setRange('lateMax')} />
          </label>
        </div>
        <label className="q-hide">
          <input type="checkbox" checked={hideTicked} onChange={(e) => setHideTicked(e.target.checked)} />
          Hide ticked bills
        </label>
        {rangesSet && (
          <button type="button" className="q-btn q-clear" onClick={() => setRanges(NO_RANGES)}>
            Clear filters
          </button>
        )}
      </fieldset>

      {rows.length === 0 ? (
        <p className="card">Nothing to chase this week.</p>
      ) : shown.length === 0 ? (
        <p className="q-empty muted">No bills match these filters.</p>
      ) : (
        <div className="q-scroll" role="region" aria-label="Bills to chase">
          <table className="q-table">
            <caption className="q-sr">
              {filter === NEW ? 'Bills emailed on the latest run' : filter ? `${tierLabel(filter)} bills` : 'All bills'}, most urgent first
              {visible.length < shown.length && `, showing ${visible.length} of ${shown.length}`}. Select a customer to open the ready-to-send email.
            </caption>
            <thead>
              <tr>
                <th scope="col" className="q-tick">
                  <span className="q-sr">Ticked off</span>
                </th>
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
                <tr key={r.orderId} onClick={() => show(r)} data-ticked={ticked.has(r.orderId) || undefined}>
                  {/* Ticking never opens the email: the click stops at its cell. */}
                  <td className="q-tick" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="q-tickbox"
                      checked={ticked.has(r.orderId)}
                      onChange={() => tick(r.orderId)}
                      aria-label={`Tick off ${r.customer}, bill ${r.orderId}`}
                    />
                  </td>
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
              <h3 id="queue-email-title">{open.emailSubject}</h3>
              <Tier tier={open.tier} />
            </div>
            <p className="q-email-meta muted">
              To {open.customer} · <span className="num">{money(open.amount)}</span> · due {date(open.dueDate)} · {late(open.daysOverdue)} · {open.action}
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
