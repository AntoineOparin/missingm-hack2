import { useState, useSyncExternalStore } from 'react'
import { motion, useMotionValueEvent, type MotionValue, type Transition } from 'motion/react'
import { scaleBand, scaleLinear } from 'd3-scale'
import { Callout } from '../components/Callout'
import { Scrolly } from '../components/Scrolly'
import { story } from '../data'
import { moneyShort, pct } from '../lib/format'
import { useQuality } from '../lib/quality'
import './Discounts.css'

// ---- Derived figures (all from story.json) ----
const reps = story.reps
const flagged = reps.find((r) => r.flagged)!
const peers = reps.filter((r) => !r.flagged)
const quarters = flagged.quarters.map((q) => q.q)
const Q = quarters.length
const qLabel = (q: string) => `${q.slice(0, 4)} ${q.slice(4)}`
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const discountAt = (i: number) => reps.map((r) => r.quarters[i].discount)
const medianAt = quarters.map((_, i) => median(discountAt(i)))
const peerRange0 = peers.map((r) => r.quarters[0].discount)
// Quarter where the flagged rep's discount jumped the most.
const jumpI = flagged.quarters.reduce((best, q, i, a) => (i && q.discount - a[i - 1].discount > a[best].discount - a[best - 1].discount ? i : best), 1)

const year = quarters[Q - 1].slice(0, 4)
// Revenue-weighted margin over the latest year: sum(gross profit) / sum(revenue).
const marginYTD = (r: (typeof reps)[number]) => {
  const qs = r.quarters.filter((q) => q.q.startsWith(year))
  return qs.reduce((s, q) => s + q.marginPct * q.revenue, 0) / qs.reduce((s, q) => s + q.revenue, 0)
}
const flaggedMargin = marginYTD(flagged)
const peerMargin = median(peers.map(marginYTD))
const isTopSeller = reps.every((r) => r.revenue <= flagged.revenue)

const outlierRule = story.detections.find((d) => d.id === 'discountOutlier')!
const belowCost = story.detections.find((d) => d.id === 'belowCost')!
// The threshold lives only in the rule text ("more than 1.5x the median"), so read it from there.
const ruleFactor = Number(outlierRule.rule.match(/([\d.]+)x/)![1])

const weeks = story.quarterEnd
const early = weeks.slice(0, -2)
const late = weeks.slice(-2)
const wavg = (ws: typeof weeks, k: 'discount' | 'discountExFlagged') => ws.reduce((s, w) => s + w[k] * w.orders, 0) / ws.reduce((s, w) => s + w.orders, 0)
const earlyAll = wavg(early, 'discount')
const earlyEx = wavg(early, 'discountExFlagged')
// How many times the typical salesperson's discount R07 gave in the jump quarter.
const jumpRatio = Math.round(flagged.quarters[jumpI].discount / medianAt[jumpI])

// ---- Chart geometry ----
const W = 640
const H = 440
const M = { top: 84, right: 28, bottom: 48, left: 64 }
const xMax = Math.ceil(Math.max(...reps.flatMap((r) => r.quarters.flatMap((q) => [q.discount, q.marginPct]))) * 10) / 10
const x = scaleLinear()
  .domain([0, xMax])
  .range([M.left, W - M.right])
const y = scaleBand<string>()
  .domain(reps.map((r) => r.rep))
  .range([M.top, H - M.bottom])
const xTicks = x.ticks(4)

// Step 2 (index 1) spans progress [1/n, 2/n): split it evenly across the quarters.
const quarterFor = (p: number) => Math.min(Q - 1, Math.max(0, Math.floor((p * steps.length - 1) * Q)))

const EASE: [number, number, number, number] = [0.77, 0, 0.175, 1]
const DIM = 0.35

// The SVG shrinks to about half size on phones, so callout notes need a bigger font there.
const narrowQuery = matchMedia('(max-width: 860px)')
const subscribeNarrow = (cb: () => void) => (narrowQuery.addEventListener('change', cb), () => narrowQuery.removeEventListener('change', cb))
const useNarrow = () => useSyncExternalStore(subscribeNarrow, () => narrowQuery.matches)

function Graphic({ step, progress }: { step: number; progress: MotionValue<number> }) {
  const { tier } = useQuality()
  const narrow = useNarrow()
  const [qi, setQi] = useState(() => quarterFor(progress.get()))
  useMotionValueEvent(progress, 'change', (p) => setQi(quarterFor(p)))

  const move: Transition = tier === 'low' ? { duration: 0 } : { duration: 0.45, ease: EASE }
  const fade: Transition = tier === 'low' ? { duration: 0 } : { duration: 0.3, ease: [0.23, 1, 0.32, 1] }
  const layer = step <= 2 ? 'dots' : step <= 4 ? 'weeks' : 'rules'
  const margin = step === 2
  const flagOn = step >= 1
  const med = margin ? peerMargin : medianAt[qi]
  const valueOf = (r: (typeof reps)[number]) => (margin ? marginYTD(r) : r.quarters[qi].discount)
  const fv = valueOf(flagged)
  const fy = y(flagged.rep)! + y.bandwidth() / 2
  const noteFont = narrow ? 24 : 13

  return (
    <div className="disc-stage">
      {/* Layer 1: salesperson dot plot (steps 1-3) */}
      <motion.svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-hidden={layer !== 'dots'}
        aria-label={
          margin
            ? `${flagged.rep} keeps ${pct(flaggedMargin)} of each sale in ${year}. A typical salesperson keeps ${pct(peerMargin)}.`
            : `Discount given by each salesperson in ${qLabel(quarters[qi])}: ${flagged.rep} gives ${pct(fv)}, a typical salesperson ${pct(medianAt[qi])}.`
        }
        initial={false}
        animate={{ opacity: layer === 'dots' ? 1 : 0 }}
        transition={fade}
      >
        <text x={M.left} y={22} className="disc-title">
          {margin ? `Money kept from each sale, ${year}` : 'Discount given, by salesperson'}
        </text>
        {!margin && (
          <text x={W - M.right} y={22} textAnchor="end" className="disc-quarter num">
            {qLabel(quarters[qi])}
          </text>
        )}
        {xTicks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={M.top - 8} y2={H - M.bottom} className="disc-grid" />
            <text x={x(t)} y={H - M.bottom + 20} textAnchor="middle" className="disc-tick num">
              {pct(t)}
            </text>
          </g>
        ))}

        {/* Rule line (discount view only) */}
        <motion.g
          initial={false}
          animate={{ transform: `translateX(${x(medianAt[qi] * ruleFactor)}px)`, opacity: flagOn && !margin ? 1 : 0 }}
          transition={move}
        >
          <line y1={M.top - 8} y2={H - M.bottom} className="disc-flagline" />
          <text y={M.top - 14} textAnchor="middle" className="disc-ann">
            rule: {ruleFactor}× typical
          </text>
        </motion.g>

        {/* Typical salesperson */}
        <motion.g initial={false} animate={{ transform: `translateX(${x(med)}px)` }} transition={move}>
          <line y1={M.top - 8} y2={H - M.bottom} className="disc-median" />
          <text y={M.top - 32} textAnchor="middle" className="disc-ann">
            typical <tspan className="num">{pct(med)}</tspan>
          </text>
        </motion.g>

        {reps.map((r) => {
          const cy = y(r.rep)! + y.bandwidth() / 2
          const v = valueOf(r)
          const isFlag = r.flagged && flagOn
          return (
            <g key={r.rep}>
              <text x={M.left - 14} y={cy} dy="0.35em" textAnchor="end" className={`disc-rep num${isFlag ? ' is-flag' : ''}`}>
                {r.rep}
              </text>
              <motion.g initial={false} animate={{ transform: `translate(${x(v)}px, ${cy}px)`, opacity: flagOn && !r.flagged ? DIM : 1 }} transition={move}>
                <title>{`${r.rep}: ${pct(v, 1)} ${margin ? 'kept from each sale' : 'average discount'}`}</title>
                <circle r={14} className="disc-hit" />
                {isFlag ? <path d="M0,-8L8,0L0,8L-8,0Z" className="disc-dot is-flag" /> : <circle r={6} className="disc-dot" />}
                {isFlag && (
                  <text x={14} dy="0.35em" className="disc-value num">
                    {pct(v)}
                  </text>
                )}
              </motion.g>
            </g>
          )
        })}

        {/* The note rides with R07's dot, so the arrow always lands on it. */}
        <motion.g initial={false} animate={{ transform: `translate(${x(fv)}px, ${fy}px)` }} transition={move}>
          <Callout
            from={[22, y.step() * 2]}
            to={[2, 8]}
            text={margin ? [`${flagged.belowCostOrders} orders sold`, 'at a loss'] : [`${flagged.rep} gives`, 'far more off']}
            show={step === 1 || step === 2}
            tone="leak"
            fontSize={noteFont}
          />
        </motion.g>
      </motion.svg>

      {/* Layer 2: discount by week of quarter (steps 4-5) */}
      <WeekChart visible={layer === 'weeks'} focus={step === 4} fade={fade} noteFont={noteFont} />

      {/* Layer 3: the two rules (step 6) */}
      <motion.div className="disc-rules" aria-hidden={layer !== 'rules'} initial={false} animate={{ opacity: layer === 'rules' ? 1 : 0 }} transition={fade}>
        <div className="disc-rule">
          <p className="eyebrow">Rule 1</p>
          <h3>Discount far above the rest</h3>
          <p className="muted">Warn us when a salesperson gives more than {ruleFactor}x the typical discount.</p>
          <p>
            It went off <span className="num disc-hits">{outlierRule.hits}</span> times, all for <span className="num">{outlierRule.who.join(' and ')}</span>.
          </p>
        </div>
        <div className="disc-rule">
          <p className="eyebrow">Rule 2</p>
          <h3>Order sold below cost</h3>
          <p className="muted">Warn us when an order sells for less than it cost to buy.</p>
          <p>
            It caught <span className="num disc-hits">{belowCost.hits}</span> orders, {flagged.belowCostOrders} of them {flagged.rep}'s. Together they lost{' '}
            <span className="num">{moneyShort(-belowCost.impact!)}</span>.
          </p>
        </div>
      </motion.div>
    </div>
  )
}

function WeekChart({ visible, focus, fade, noteFont }: { visible: boolean; focus: boolean; fade: Transition; noteFont: number }) {
  const yMax = Math.ceil(Math.max(...weeks.map((w) => w.discount)) * 20) / 20
  const yS = scaleLinear()
    .domain([0, yMax])
    .range([H - M.bottom, M.top])
  const xS = scaleBand<number>()
    .domain(weeks.map((w) => w.week))
    .range([M.left, W - M.right])
    .padding(0.3)
  const bw = Math.min(24, xS.bandwidth())
  const lateWeeks = new Set(late.map((w) => w.week))
  const mid = (week: number) => xS(week)! + xS.bandwidth() / 2
  // Arrow lands on the left edge of the first late bar; the note sits in the empty space above the early bars.
  const lastEarly = early[early.length - 1]
  const tip: [number, number] = [mid(late[0].week) - bw / 2 - 2, yS(late[0].discount) + 14]
  const note: [number, number] = [mid(lastEarly.week) - 12, (yS(yMax) + yS(Math.max(...early.map((w) => w.discount)))) / 2]
  return (
    <motion.svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-hidden={!visible}
      aria-label={`Discount by week of the quarter: about ${pct(earlyAll)} most weeks, rising to ${pct(late[1].discount)} in the last week. Without ${flagged.rep} it still rises, from ${pct(earlyEx)} to ${pct(late[1].discountExFlagged)}.`}
      initial={false}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={fade}
    >
      <text x={M.left} y={22} className="disc-title">
        Discount by week of the quarter
      </text>
      <g className="disc-legend" transform={`translate(${M.left}, 44)`}>
        <rect width={10} height={10} y={-9} rx={2} className="disc-bar" />
        <text x={16}>Everyone</text>
        <line x1={120} x2={138} y1={-4} y2={-4} className="disc-ex" />
        <text x={144}>Everyone except {flagged.rep}</text>
      </g>
      {yS.ticks(4).map((t) => (
        <g key={t}>
          <line x1={M.left} x2={W - M.right} y1={yS(t)} y2={yS(t)} className="disc-grid" />
          <text x={M.left - 10} y={yS(t)} dy="0.35em" textAnchor="end" className="disc-tick num">
            {pct(t)}
          </text>
        </g>
      ))}
      {weeks.map((w) => {
        const cx = mid(w.week)
        const top = yS(w.discount)
        const h = H - M.bottom - top
        const r = Math.min(4, h)
        const isLate = lateWeeks.has(w.week)
        return (
          <g key={w.week}>
            <title>{`Week ${w.week}: ${pct(w.discount, 1)} everyone, ${pct(w.discountExFlagged, 1)} without ${flagged.rep}`}</title>
            <rect x={cx - xS.step() / 2} y={M.top} width={xS.step()} height={H - M.bottom - M.top} className="disc-hit" />
            <motion.g initial={false} animate={{ opacity: focus && !isLate ? DIM : 1 }} transition={fade}>
              {/* rounded data-end, square at the baseline */}
              <path
                d={`M${cx - bw / 2},${H - M.bottom}V${top + r}Q${cx - bw / 2},${top} ${cx - bw / 2 + r},${top}H${cx + bw / 2 - r}Q${cx + bw / 2},${top} ${cx + bw / 2},${top + r}V${H - M.bottom}Z`}
                className={`disc-bar${isLate ? ' is-flag' : ''}`}
              />
              <line x1={cx - bw / 2 - 4} x2={cx + bw / 2 + 4} y1={yS(w.discountExFlagged)} y2={yS(w.discountExFlagged)} className="disc-ex" />
            </motion.g>
            {isLate && (
              <text x={cx} y={top - 8} textAnchor="middle" className="disc-value num">
                {pct(w.discount)}
              </text>
            )}
            <text x={cx} y={H - M.bottom + 20} textAnchor="middle" className="disc-tick num">
              {w.week}
            </text>
          </g>
        )
      })}
      <text x={(M.left + W - M.right) / 2} y={H - 6} textAnchor="middle" className="disc-tick">
        Week of the quarter
      </text>
      <Callout from={note} to={tip} text={['Last two weeks:', 'discounts jump']} show={focus} tone="leak" anchor="end" fontSize={noteFont} />
    </motion.svg>
  )
}

const steps = [
  <>
    <p className="eyebrow">Discounts · {qLabel(quarters[0])}</p>
    <h3>Most salespeople give similar discounts</h3>
    <p>
      In {qLabel(quarters[0])}, most salespeople took <span className="num">{pct(Math.min(...peerRange0))}</span> to{' '}
      <span className="num">{pct(Math.max(...peerRange0))}</span> off the list price. One did not.
    </p>
  </>,
  <>
    <p className="eyebrow">Scroll through {Q} quarters</p>
    <h3>{flagged.rep} gives far bigger discounts</h3>
    <p>
      In {qLabel(quarters[jumpI])}, {flagged.rep}'s discount jumped to <span className="num leak">{pct(flagged.quarters[jumpI].discount)}</span>. That is about{' '}
      <span className="num">{jumpRatio}x</span> what a typical salesperson gives.
    </p>
  </>,
  <>
    <p className="eyebrow">What it costs</p>
    <h3>{flagged.rep} keeps far less per sale</h3>
    <p>
      {flagged.rep} keeps <span className="num leak">{pct(flaggedMargin)}</span> of each sale; the others keep about{' '}
      <span className="num">{pct(peerMargin)}</span>.{isTopSeller && ` And ${flagged.rep} sells the most, so this costs you the most.`}
    </p>
  </>,
  <>
    <p className="eyebrow">A second pattern</p>
    <h3>Discounts stay flat most weeks</h3>
    <p>
      Each bar is one week of the quarter. Most weeks, the discount stays near <span className="num">{pct(earlyAll)}</span>.
    </p>
  </>,
  <>
    <p className="eyebrow">Quarter end</p>
    <h3>Then they jump at quarter end</h3>
    <p>
      In the last week, discounts hit <span className="num leak">{pct(late[1].discount)}</span>. The white lines leave out {flagged.rep}, and they jump too: the
      whole team does it.
    </p>
  </>,
  <>
    <p className="eyebrow">How we catch it</p>
    <h3>Two simple rules, checked weekly</h3>
    <p>We check both rules every week. The next salesperson who slips gets caught early.</p>
  </>,
]

export default function Discounts() {
  return (
    <Scrolly id="Discounts" steps={steps}>
      {(state) => <Graphic {...state} />}
    </Scrolly>
  )
}
