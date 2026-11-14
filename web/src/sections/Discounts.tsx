import { useState, useSyncExternalStore } from 'react'
import { motion, useMotionValueEvent, type MotionValue, type Transition } from 'motion/react'
import { scaleBand, scaleLinear } from 'd3-scale'
import { Callout } from '../components/Callout'
import { Scrolly } from '../components/Scrolly'
import { story } from '../data'
import { pct } from '../lib/format'
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
const cap = story.scenarios.find((s) => s.id === 'discountCap')!
// The threshold lives only in the rule text ("more than 1.5x the median"), so read it from there.
const ruleFactor = Number(outlierRule.rule.match(/([\d.]+)x/)![1])

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
  const margin = step === 2
  const flagOn = step >= 1
  const med = margin ? peerMargin : medianAt[qi]
  const valueOf = (r: (typeof reps)[number]) => (margin ? marginYTD(r) : r.quarters[qi].discount)
  const fv = valueOf(flagged)
  const fy = y(flagged.rep)! + y.bandwidth() / 2
  const noteFont = narrow ? 24 : 13

  return (
    <div className="disc-stage">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={
          margin
            ? `${flagged.rep} keeps ${pct(flaggedMargin)} of each sale in ${year}. A typical salesperson keeps ${pct(peerMargin)}.`
            : step === 3
              ? `The rule line sits at ${ruleFactor} times the typical discount. Only ${flagged.rep} is past it, at ${pct(fv)}.`
              : `Discount given by each salesperson in ${qLabel(quarters[qi])}: ${flagged.rep} gives ${pct(fv)}, a typical salesperson ${pct(medianAt[qi])}.`
        }
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
            text={margin ? [`${flagged.rep} keeps`, 'far less per sale'] : [`${flagged.rep} gives`, 'far more off']}
            show={step === 1 || step === 2}
            tone="leak"
            fontSize={noteFont}
          />
        </motion.g>
      </svg>
    </div>
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
    <p className="eyebrow">Why it matters</p>
    <h3>{flagged.rep} keeps far less per sale</h3>
    <p>
      {flagged.rep} keeps <span className="num leak">{pct(flaggedMargin)}</span> of each sale; the others keep about{' '}
      <span className="num">{pct(peerMargin)}</span>.{isTopSeller && ` And ${flagged.rep} sells the most, so this costs you the most.`}
    </p>
  </>,
  <>
    <p className="eyebrow">How we catch it</p>
    <h3>One rule catches it</h3>
    <p>
      We flag any salesperson whose discount in a quarter is over {ruleFactor}x the typical one: it went off{' '}
      <span className="num leak">{outlierRule.hits}</span> times, all for {outlierRule.who.join(' and ')}.
    </p>
    <p>What to do: {cap.label}. Anything bigger needs a manager's OK.</p>
  </>,
]

export default function Discounts() {
  return (
    <Scrolly id="Discounts" steps={steps}>
      {(state) => <Graphic {...state} />}
    </Scrolly>
  )
}
