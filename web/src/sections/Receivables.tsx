import { motion, type Transition } from 'motion/react'
import { story } from '../data'
import { Scrolly } from '../components/Scrolly'
import { Callout } from '../components/Callout'
import { money, moneyShort, pct } from '../lib/format'
import { useQuality } from '../lib/quality'
import './Receivables.css'

const R = story.receivables
const rule = story.detections.find((d) => d.id === 'chronicLate')!
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const count = (n: number) => n.toLocaleString('en-CA')

// How late invoices get paid. Bins are "days late, floored to binWidth".
const hist = R.lateHistogram
const binWidth = hist[1].daysLate - hist[0].daysLate
const totalInvoices = sum(hist.map((h) => h.invoices))
const onTimeShare = sum(hist.filter((h) => h.daysLate < binWidth).map((h) => h.invoices)) / totalInvoices
// The tail = trailing bins where every invoice belongs to a chronic late payer.
let tailIdx = hist.length
while (tailIdx > 1 && hist[tailIdx - 1].chronicInvoices === hist[tailIdx - 1].invoices) tailIdx--
tailIdx = Math.min(tailIdx, hist.length - 1)
const tailStart = hist[tailIdx].daysLate
const tailInvoices = sum(hist.slice(tailIdx).map((h) => h.invoices))
// Who is in the tail and still owes money today.
const worst = R.customers.filter((c) => c.chronic && c.open > 0).sort((a, b) => b.avgDaysLate - a.avgDaysLate)
const worstOpen = sum(worst.map((c) => c.open))

// --- geometry (viewBox units) ---
const W = 640
const H = 420
const EASE_MOVE = [0.77, 0, 0.175, 1] as const
const EASE_OUT = [0.23, 1, 0.32, 1] as const
const DIM = 0.35
const CALLOUT_FS = 12 // viewBox units; renders about 15px at desktop width

// Bars hang from a pipe; from step 2 on the scale zooms so the tail is visible.
const PIPE_Y = 70
const BAR_Y = PIPE_Y + 6
const BAR_H = 244
const X0 = 60
const BAND = (W - 2 * X0) / hist.length
const BAR_W = Math.min(24, BAND - 8)
const binX = (i: number) => X0 + i * BAND
const dayX = (d: number) => X0 + ((d - hist[0].daysLate) / binWidth) * BAND
const fullMax = Math.max(...hist.map((h) => h.invoices))
const zoomMax = Math.max(...hist.filter((h) => h.daysLate >= binWidth).map((h) => h.invoices))
const zoomH = (v: number) => (v / zoomMax) * BAR_H
const dayTicks = hist.map((h) => h.daysLate).filter((d) => d > 0 && d % (3 * binWidth) === 0)
// Arrow target: the bottom of the tallest bar in the late tail.
const tailPeak = hist.slice(tailIdx).reduce((best, h, j) => (h.invoices > hist[best].invoices ? tailIdx + j : best), tailIdx)
const tailCx = (binX(tailIdx) + binX(hist.length)) / 2
const tailTo: [number, number] = [binX(tailPeak) + BAND / 2, BAR_Y + zoomH(hist[tailPeak].invoices) + 2]
const LIST_X = binX(tailIdx) + 4

function labelFor(step: number) {
  if (step === 0) return `How late bills are paid. ${pct(onTimeShare)} are paid early or within ${binWidth} days.`
  if (step === 1)
    return `Zoomed in on late bills. All ${tailInvoices} bills paid ${tailStart} or more days late come from customers who always pay late: ${worst.map((c) => c.customer).join(', ')}.`
  if (step === 2) return `${money(R.openTotal)} is unpaid today across ${R.openInvoices} bills; ${money(R.overdueTotal)} of it is past due.`
  return `A rule flags customers who always pay late: ${rule.rule} It caught ${rule.hits} customers.`
}

const EYEBROW = <p className="eyebrow">Unpaid bills</p>
const steps = [
  <>
    {EYEBROW}
    <h3>Most customers pay on time</h3>
    <p>
      <span className="num">{pct(onTimeShare)}</span> of bills are paid early or within <span className="num">{binWidth}</span> days. Most customers are fine.
    </p>
  </>,
  <>
    {EYEBROW}
    <h3>A few customers always pay late</h3>
    <p>
      The very late bills all come from them. <span className="num">{worst.length}</span> of them still owe you{' '}
      <span className="num">{moneyShort(worstOpen)}</span>.
    </p>
  </>,
  <>
    {EYEBROW}
    <h3>Cash you are still waiting for</h3>
    <p>
      <span className="num">{moneyShort(R.openTotal)}</span> is unpaid today. <span className="num leak">{moneyShort(R.overdueTotal)}</span> of it is already
      past due.
    </p>
  </>,
  <>
    {EYEBROW}
    <h3>A rule that spots them</h3>
    <p>
      The rule: {rule.rule} It caught <span className="num">{rule.hits}</span> customers.
    </p>
    <p>A weekly list now does the chasing.</p>
  </>,
]

export default function Receivables() {
  return (
    <div className="rcv">
      <Scrolly id="Receivables" steps={steps}>
        {({ step }) => <Chart step={step} />}
      </Scrolly>
    </div>
  )
}

function Chart({ step }: { step: number }) {
  const { tier } = useQuality()
  const low = tier === 'low'
  const fade: Transition = low ? { duration: 0 } : { duration: 0.4, ease: EASE_OUT }
  const move: Transition = low ? { duration: 0 } : { duration: 0.7, ease: EASE_MOVE }
  const show = (on: boolean) =>
    ({ animate: { opacity: on ? 1 : 0 }, initial: false, transition: fade, style: { pointerEvents: on ? 'auto' : 'none' } }) as const
  const dim = (on: boolean) => ({ animate: { opacity: on ? DIM : 1 }, initial: false, transition: fade }) as const
  const zoomed = step >= 1
  const scaleY = zoomed ? 1 : zoomMax / fullMax

  return (
    <svg className="rcv-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={labelFor(step)}>
      <defs>
        <clipPath id="rcv-clip">
          <rect x={0} y={BAR_Y} width={W} height={BAR_H + 4} />
        </clipPath>
      </defs>

      <g clipPath="url(#rcv-clip)">
        <motion.g style={{ originY: 0 }} initial={false} animate={{ transform: `scaleY(${scaleY})` }} transition={move}>
          {hist.map((h, i) => {
            const rest = h.invoices - h.chronicInvoices
            const h1 = zoomH(rest)
            const x = binX(i) + (BAND - BAR_W) / 2
            return (
              <motion.g key={h.daysLate} {...dim(zoomed && i < tailIdx)}>
                <title>{`${h.daysLate < 0 ? 'Paid early' : `${h.daysLate}–${h.daysLate + binWidth - 1} days late`}: ${count(h.invoices)} bills, ${count(h.chronicInvoices)} from customers who always pay late`}</title>
                <rect x={x} y={BAR_Y} width={BAR_W} height={h1} fill="var(--chrome)" />
                <rect
                  className="rcv-fill"
                  x={x}
                  y={BAR_Y + h1 + (rest > 0 ? 2 : 0)}
                  width={BAR_W}
                  height={zoomH(h.chronicInvoices)}
                  fill={zoomed ? 'var(--leak)' : 'var(--chrome)'}
                />
              </motion.g>
            )
          })}
        </motion.g>
      </g>
      <line x1={X0 - 6} x2={W - X0 + 6} y1={PIPE_Y} y2={PIPE_Y} stroke="var(--surface-2)" strokeWidth={12} strokeLinecap="round" />
      <line x1={X0 - 6} x2={W - X0 + 6} y1={PIPE_Y - 6} y2={PIPE_Y - 6} stroke="var(--line)" strokeWidth={1} />
      <text className="t-muted t-small" x={binX(0) + BAND / 2} y={52} textAnchor="middle">
        early
      </text>
      {dayTicks.map((d) => (
        <text key={d} className="num t-muted t-small" x={dayX(d)} y={52} textAnchor="middle">
          {d}
        </text>
      ))}
      <text className="t-muted t-small" x={W - X0} y={24} textAnchor="end">
        days late →
      </text>
      <line x1={dayX(0)} x2={dayX(0)} y1={32} y2={BAR_Y + BAR_H + 4} stroke="var(--text)" strokeWidth={1.5} />
      <text x={dayX(0)} y={24} textAnchor="middle">
        Due date
      </text>

      {/* Step 1: counts on the two big bars, the headline share */}
      <motion.g {...show(step === 0)}>
        {hist
          .map((h, i) => ({ h, i }))
          .filter(({ h }) => h.daysLate < binWidth)
          .map(({ h, i }) => (
            <text key={h.daysLate} className="num t-small" x={binX(i) + BAND / 2} y={BAR_Y + (h.invoices / fullMax) * BAR_H + 16} textAnchor="middle">
              {count(h.invoices)}
            </text>
          ))}
        <text className="num t-big" x={W - X0} y={190} textAnchor="end">
          {pct(onTimeShare)}
        </text>
        <text className="t-muted" x={W - X0} y={214} textAnchor="end">
          of bills paid early
        </text>
        <text className="t-muted" x={W - X0} y={232} textAnchor="end">
          or within {binWidth} days
        </text>
      </motion.g>

      {/* Steps 2-4: cut-off bars get a break mark, plus the legend */}
      <motion.g {...show(zoomed)}>
        {hist.map((h, i) => {
          if (h.invoices <= zoomMax) return null
          const x = binX(i) + (BAND - BAR_W) / 2
          const y = BAR_Y + BAR_H - 34
          const s = 5 // slant of the break
          return (
            <g key={h.daysLate}>
              <path className="rcv-break" d={`M${x - 3} ${y + s} L${x + BAR_W + 3} ${y - s} L${x + BAR_W + 3} ${y - s + 7} L${x - 3} ${y + s + 7} Z`} />
              <path className="rcv-break-edge" d={`M${x - 3} ${y + s} L${x + BAR_W + 3} ${y - s} M${x - 3} ${y + s + 7} L${x + BAR_W + 3} ${y - s + 7}`} />
              <text className="num t-muted t-small" x={binX(i) + BAND / 2} y={BAR_Y + BAR_H + 22} textAnchor="middle">
                {count(h.invoices)}
              </text>
            </g>
          )
        })}
        <g transform={`translate(${X0} ${H - 18})`}>
          <rect width={10} height={10} y={-9} fill="var(--leak)" />
          <text x={16} y={0} className="t-small">
            Always pay late
          </text>
          <rect x={140} width={10} height={10} y={-9} fill="var(--chrome)" />
          <text x={156} y={0} className="t-small">
            Other customers
          </text>
        </g>
      </motion.g>

      {/* Step 2: arrow to the tail, who still owes */}
      <motion.g {...show(step === 1)}>
        <text className="t-muted t-small" x={LIST_X} y={250}>
          Still owe you today
        </text>
        {worst.map((c, i) => {
          const y = 276 + i * 26
          return (
            <g key={c.customer}>
              <text className="num" x={LIST_X} y={y}>
                {c.customer}
              </text>
              <text className="t-muted t-small" x={LIST_X + 52} y={y}>
                pays {Math.round(c.avgDaysLate)} days late
              </text>
              <text className="num" x={W - X0 + 6} y={y} textAnchor="end">
                {moneyShort(c.open)}
              </text>
            </g>
          )
        })}
      </motion.g>
      <Callout
        from={[tailCx + 14, tailTo[1] + 72]}
        to={tailTo}
        text={[`${tailInvoices} late bills, all from`, 'customers who always pay late']}
        show={step === 1}
        tone="leak"
        fontSize={CALLOUT_FS}
      />

      {/* Step 3: what is unpaid today */}
      <motion.g {...show(step === 2)}>
        <text className="t-muted" x={LIST_X} y={232}>
          Unpaid today
        </text>
        <text className="num t-big" x={LIST_X} y={272}>
          {moneyShort(R.openTotal)}
        </text>
        <text className="t-muted" x={LIST_X} y={308}>
          Already past due
        </text>
        <text className="num t-big t-flag" x={LIST_X} y={348}>
          {moneyShort(R.overdueTotal)}
        </text>
      </motion.g>

      {/* Step 4: what the rule caught */}
      <motion.g {...show(step === 3)}>
        <text className="num t-big t-flag" x={LIST_X} y={272}>
          {rule.hits}
        </text>
        <text className="t-muted" x={LIST_X} y={298}>
          customers caught by
        </text>
        <text className="t-muted" x={LIST_X} y={316}>
          the late-payer rule
        </text>
      </motion.g>
    </svg>
  )
}
