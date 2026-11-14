import { useRef } from 'react'
import { motion, useInView, type Transition } from 'motion/react'
import { scaleLinear } from 'd3-scale'
import { line } from 'd3-shape'
import { story } from '../data'
import { Scrolly } from '../components/Scrolly'
import { Callout } from '../components/Callout'
import { money, moneyShort, pct } from '../lib/format'
import { useQuality } from '../lib/quality'
import './Receivables.css'

const { monthly, receivables: R } = story
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const count = (n: number) => n.toLocaleString('en-CA')
const monthName = (m: string) => new Date(`${m}-01T00:00`).toLocaleString('en-US', { month: 'short', year: 'numeric' })

// Step 1: the month this year where billing outran collections the most (early 2025 is skewed: no prior invoices to collect).
const thisYear = monthly[monthly.length - 1].month.slice(0, 4)
const worstMonth = monthly.filter((m) => m.month.startsWith(thisYear)).reduce((a, b) => (b.billed - b.collected > a.billed - a.collected ? b : a))

// Steps 2-3: how late invoices get paid. Bins are "days late, floored to binWidth".
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
const overLimit = R.customers.find((c) => c.overLimit)

// --- geometry (viewBox units) ---
const W = 640
const H = 420
const EASE_MOVE = [0.77, 0, 0.175, 1] as const
const EASE_OUT = [0.23, 1, 0.32, 1] as const
const DIM = 0.35
const CALLOUT_FS = 12 // viewBox units; renders about 15px at desktop width

// Monthly chart
const mx = scaleLinear().domain([0, monthly.length - 1]).range([72, 604])
const my = scaleLinear().domain([0, Math.max(...monthly.map((m) => m.billed))]).nice(4).range([340, 80])
const monthPath = (key: 'billed' | 'collected') => line<(typeof monthly)[number]>((_, i) => mx(i), (d) => my(d[key]))(monthly) ?? ''
const worstIdx = monthly.indexOf(worstMonth)
const gapMidY = (my(worstMonth.billed) + my(worstMonth.collected)) / 2
// Note sits right of the gap unless the gap is near the right edge.
const gapSide = mx(worstIdx) < 470 ? 1 : -1

// Late-payment histogram: bars hang from a pipe; step 3 zooms the scale so the tail is visible.
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

// Aging chart
const agingMax = Math.max(...R.aging.map((a) => a.amount))
const ax = scaleLinear().domain([0, agingMax]).range([0, 300])
const AGING_Y = 116
const ROW = 36
const limitScale = overLimit ? scaleLinear().domain([0, Math.max(overLimit.open, overLimit.creditLimit) * 1.15]).range([0, 420]) : null
const LIMIT_Y = AGING_Y + R.aging.length * ROW + 36
// Arrow target: the top of the owed bar, halfway along the part past the limit.
const overTo: [number, number] = overLimit && limitScale ? [60 + (limitScale(overLimit.creditLimit) + limitScale(overLimit.open)) / 2, LIMIT_Y + 12] : [0, 0]

function labelFor(step: number) {
  const gap = `In ${monthName(worstMonth.month)} you billed ${money(worstMonth.billed)} but collected only ${money(worstMonth.collected)}.`
  if (step === 0) return 'Billed and collected by month. Cash comes in weeks after the sale.'
  if (step === 1) return `Billed and collected by month. ${gap}`
  if (step === 2) return `How late bills are paid. ${pct(onTimeShare)} are paid early or within ${binWidth} days.`
  if (step === 3)
    return `Zoomed in on late bills. All ${tailInvoices} bills paid ${tailStart} or more days late come from customers who always pay late: ${worst.map((c) => c.customer).join(', ')}.`
  const today = `${money(R.openTotal)} is unpaid today across ${R.openInvoices} bills; ${money(R.overdueTotal)} is past due.`
  return step === 5 && overLimit ? `${today} ${overLimit.customer} owes ${money(overLimit.open)}, more than its ${money(overLimit.creditLimit)} credit limit.` : today
}

const EYEBROW = <p className="eyebrow">Unpaid bills</p>
const steps = [
  <>
    {EYEBROW}
    <h3>Cash comes in after the sale</h3>
    <p>You send a bill when you make a sale. The cash shows up weeks later.</p>
  </>,
  <>
    {EYEBROW}
    <h3>Sales ran ahead of cash</h3>
    <p>
      In {monthName(worstMonth.month)} you billed <span className="num">{moneyShort(worstMonth.billed)}</span> but collected only{' '}
      <span className="num">{moneyShort(worstMonth.collected)}</span>. The rest is cash you are still waiting for.
    </p>
  </>,
  <>
    {EYEBROW}
    <h3>Most customers pay on time</h3>
    <p>
      <span className="num">{pct(onTimeShare)}</span> of bills are paid early or within <span className="num">{binWidth}</span> days. Most
      customers are fine.
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
    <h3>What you are owed today</h3>
    <p>
      <span className="num">{moneyShort(R.openTotal)}</span> is unpaid. <span className="num leak">{moneyShort(R.overdueTotal)}</span> of it is
      already past due.
    </p>
  </>,
  overLimit ? (
    <>
      {EYEBROW}
      <h3>One customer is over its limit</h3>
      <p>
        {overLimit.customer} owes <span className="num">{moneyShort(overLimit.open)}</span>, more than its{' '}
        <span className="num">{moneyShort(overLimit.creditLimit)}</span> limit. Pause new orders until it pays.
      </p>
    </>
  ) : (
    <>
      {EYEBROW}
      <h3>Chase the past-due bills first</h3>
      <p>Start with the customers who always pay late.</p>
    </>
  ),
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
  const ref = useRef<SVGSVGElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.4 })
  const low = tier === 'low'
  const fade: Transition = low ? { duration: 0 } : { duration: 0.4, ease: EASE_OUT }
  const move: Transition = low ? { duration: 0 } : { duration: 0.7, ease: EASE_MOVE }
  const grow = (i: number): Transition => (low ? { duration: 0 } : { duration: 0.6, ease: EASE_OUT, delay: i * 0.05 })
  const show = (on: boolean) => ({ animate: { opacity: on ? 1 : 0 }, initial: false, transition: fade, style: { pointerEvents: on ? 'auto' : 'none' } }) as const
  const dim = (on: boolean) => ({ animate: { opacity: on ? DIM : 1 }, initial: false, transition: fade }) as const
  const zoomed = step === 3
  const scaleY = zoomed ? 1 : zoomMax / fullMax

  return (
    <svg ref={ref} className="rcv-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={labelFor(step)}>
      <defs>
        <clipPath id="rcv-clip">
          <rect x={0} y={BAR_Y} width={W} height={BAR_H + 4} />
        </clipPath>
      </defs>

      {/* Steps 1-2: billed vs collected by month */}
      <motion.g {...show(step <= 1)}>
        {my.ticks(4).map((t) => (
          <g key={t}>
            <line className="grid" x1={72} x2={604} y1={my(t)} y2={my(t)} />
            <text className="num t-muted t-small" x={64} y={my(t) + 4} textAnchor="end">
              {moneyShort(t)}
            </text>
          </g>
        ))}
        {monthly.map((m, i) =>
          m.month.endsWith('-01') || m.month.endsWith('-07') ? (
            <text key={m.month} className="t-muted t-small" x={mx(i)} y={362} textAnchor="middle">
              {monthName(m.month)}
            </text>
          ) : null,
        )}
        <g transform="translate(72 44)">
          <line x1={0} x2={18} y1={0} y2={0} stroke="var(--chrome)" strokeWidth={2} strokeLinecap="round" />
          <text x={24} y={4}>
            Billed
          </text>
          <line x1={84} x2={102} y1={0} y2={0} stroke="var(--oak)" strokeWidth={2} strokeLinecap="round" />
          <text x={108} y={4}>
            Cash collected
          </text>
        </g>
        <motion.g {...dim(step === 1)}>
          {(['billed', 'collected'] as const).map((k) => (
            <motion.path
              key={k}
              d={monthPath(k)}
              fill="none"
              stroke={k === 'billed' ? 'var(--chrome)' : 'var(--oak)'}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              initial={{ pathLength: low ? 1 : 0 }}
              animate={{ pathLength: inView ? 1 : low ? 1 : 0 }}
              transition={low ? { duration: 0 } : { duration: 1.2, ease: EASE_OUT, delay: k === 'collected' ? 0.15 : 0 }}
            />
          ))}
        </motion.g>
        {/* the biggest gap month, with the arrow */}
        <motion.g {...show(step === 1)}>
          <line x1={mx(worstIdx)} x2={mx(worstIdx)} y1={my(worstMonth.billed)} y2={my(worstMonth.collected)} stroke="var(--leak)" strokeWidth={2} />
          <circle cx={mx(worstIdx)} cy={my(worstMonth.billed)} r={4.5} fill="var(--chrome)" stroke="var(--bg)" strokeWidth={2} />
          <circle cx={mx(worstIdx)} cy={my(worstMonth.collected)} r={4.5} fill="var(--oak)" stroke="var(--bg)" strokeWidth={2} />
        </motion.g>
        <Callout
          from={[mx(worstIdx) + gapSide * 56, 52]}
          to={[mx(worstIdx) + gapSide * 3, gapMidY]}
          text={[`${moneyShort(worstMonth.billed - worstMonth.collected)} billed but`, 'not collected yet']}
          show={step === 1}
          tone="leak"
          fontSize={CALLOUT_FS}
        />
        {monthly.map((m, i) => (
          <rect key={m.month} className="hit" x={mx(i) - 12} y={70} width={24} height={276}>
            <title>{`${monthName(m.month)}: billed ${money(m.billed)}, collected ${money(m.collected)}`}</title>
          </rect>
        ))}
      </motion.g>

      {/* Steps 3-4: late-payment bars hanging from a pipe */}
      <motion.g {...show(step === 2 || step === 3)}>
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

        {/* Step 3: counts on the two big bars, the headline share */}
        <motion.g {...show(step === 2)}>
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

        {/* Step 4: cut-off bars get a break mark, arrow to the tail, who still owes */}
        <motion.g {...show(zoomed)}>
          {hist.map((h, i) => {
            if (h.invoices <= zoomMax) return null
            const x = binX(i) + (BAND - BAR_W) / 2
            const y = BAR_Y + BAR_H - 34
            const s = 5 // slant of the break
            return (
              <g key={h.daysLate}>
                <path
                  className="rcv-break"
                  d={`M${x - 3} ${y + s} L${x + BAR_W + 3} ${y - s} L${x + BAR_W + 3} ${y - s + 7} L${x - 3} ${y + s + 7} Z`}
                />
                <path className="rcv-break-edge" d={`M${x - 3} ${y + s} L${x + BAR_W + 3} ${y - s} M${x - 3} ${y + s + 7} L${x + BAR_W + 3} ${y - s + 7}`} />
                <text className="num t-muted t-small" x={binX(i) + BAND / 2} y={BAR_Y + BAR_H + 22} textAnchor="middle">
                  {count(h.invoices)}
                </text>
              </g>
            )
          })}
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
          show={zoomed}
          tone="leak"
          fontSize={CALLOUT_FS}
        />

        <motion.g {...show(zoomed)} transform={`translate(${X0} ${H - 18})`}>
          <rect width={10} height={10} y={-9} fill="var(--leak)" />
          <text x={16} y={0} className="t-small">
            Always pay late
          </text>
          <rect x={140} width={10} height={10} y={-9} fill="var(--chrome)" />
          <text x={156} y={0} className="t-small">
            Other customers
          </text>
        </motion.g>
      </motion.g>

      {/* Steps 5-6: what is unpaid today, then the customer over its limit */}
      <motion.g {...show(step >= 4)}>
        <text className="t-muted t-small" x={60} y={40}>
          Unpaid · {R.openInvoices} bills
        </text>
        <text className="num t-mid" x={60} y={70}>
          {money(R.openTotal)}
        </text>
        <text className="t-muted t-small" x={W - 40} y={40} textAnchor="end">
          Past due · {R.overdueInvoices} bills
        </text>
        <text className="num t-mid" x={W - 40} y={70} textAnchor="end">
          {money(R.overdueTotal)}
        </text>
        <motion.g {...dim(step === 5 && !!overLimit)}>
          {R.aging.map((a, i) => {
            const y = AGING_Y + i * ROW
            const due = i > 0
            return (
              <g key={a.bucket}>
                <title>{`${a.bucket}: ${money(a.amount)} across ${a.invoices} bills`}</title>
                <text x={60} y={y + 15}>
                  {a.bucket}
                </text>
                <motion.rect
                  x={170}
                  y={y}
                  height={22}
                  width={ax(a.amount)}
                  fill={due ? 'var(--leak)' : 'var(--chrome)'}
                  opacity={due ? 0.55 + (0.45 * i) / (R.aging.length - 1) : 1}
                  style={{ originX: 0 }}
                  initial={{ transform: 'scaleX(0.001)' }}
                  animate={{ transform: `scaleX(${step >= 4 ? 1 : 0.001})` }}
                  transition={grow(i)}
                />
                <text className="num t-small" x={170 + ax(a.amount) + 8} y={y + 15}>
                  {moneyShort(a.amount)} · {a.invoices} bills
                </text>
              </g>
            )
          })}
          <text className="t-muted t-small" x={170} y={AGING_Y - 12}>
            Days past due · amount · number of bills
          </text>
        </motion.g>
        {overLimit && limitScale && (
          <>
            <motion.g {...show(step === 5)} transform={`translate(60 ${LIMIT_Y})`}>
              <text className="t-muted t-small" y={0}>
                {overLimit.customer} · what it owes vs its credit limit
              </text>
              <rect y={14} width={limitScale.range()[1]} height={10} fill="var(--surface-2)" />
              <rect y={14} width={limitScale(overLimit.open)} height={10} fill="var(--leak)" />
              <line x1={limitScale(overLimit.creditLimit)} x2={limitScale(overLimit.creditLimit)} y1={8} y2={30} stroke="var(--text)" strokeWidth={1.5} />
              <text className="num t-small" x={limitScale(overLimit.creditLimit) - 6} y={44} textAnchor="end">
                limit {money(overLimit.creditLimit)}
              </text>
              <text className="num t-small" x={limitScale(overLimit.open) + 6} y={44}>
                owes {money(overLimit.open)}
              </text>
            </motion.g>
            <Callout
              from={[overTo[0] + 30, LIMIT_Y - 44]}
              to={overTo}
              text={[`${overLimit.customer} owes more`, 'than its credit limit']}
              show={step === 5}
              tone="leak"
              fontSize={CALLOUT_FS}
            />
          </>
        )}
      </motion.g>
    </svg>
  )
}
