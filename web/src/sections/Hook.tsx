import { useState, useSyncExternalStore } from 'react'
import { motion, useTransform, type MotionValue } from 'motion/react'
import { scaleLinear } from 'd3-scale'
import { area, line } from 'd3-shape'
import { story } from '../data'
import { Scrolly } from '../components/Scrolly'
import { Arrow } from '../components/Arrow'
import { Callout } from '../components/Callout'
import { moneyShort, pct, signedPct } from '../lib/format'
import { useQuality } from '../lib/quality'
import './Hook.css'

const { yoy, quarters, meta } = story
const qLabel = (q: string) => `${q.slice(4)} ${q.slice(0, 4)}`

// Both series indexed to 100 at the first quarter so growth compares on one scale.
const rev = quarters.map((q) => (q.revenue / quarters[0].revenue) * 100)
const prof = quarters.map((q) => (q.profitAfterRefunds / quarters[0].profitAfterRefunds) * 100)
const last = quarters.length - 1
const firstYearEnd = quarters.findLastIndex((q) => q.q.startsWith(quarters[0].q.slice(0, 4)))
const laterYear = quarters.slice(firstYearEnd + 1)
const dipQuarter = laterYear.reduce((a, b) => (b.profitAfterRefunds < a.profitAfterRefunds ? b : a))
const dipIdx = quarters.indexOf(dipQuarter)

// What profit would have been had it grown as fast as revenue, minus what it was.
const keptPace = yoy['2025'].profitAfterRefunds * (yoy['2026'].revenue / yoy['2025'].revenue)
const gap = keptPace - yoy['2026'].profitAfterRefunds

const W = 640
const H = 380
const M = { t: 44, r: 128, b: 44, l: 40 }
const x = scaleLinear()
  .domain([0, last])
  .range([M.l, W - M.r])
const y = scaleLinear()
  .domain([Math.min(90, ...prof), Math.max(...rev) * 1.04])
  .nice()
  .range([H - M.b, M.t])
const linePath = line<number>()
  .x((_, i) => x(i))
  .y((v) => y(v))
const revPath = linePath(rev)!
const profPath = linePath(prof)!
const gapPath = area<number>()
  .x((_, i) => x(i))
  .y0((_, i) => y(prof[i]))
  .y1((v) => y(v))(rev)!
const gapLabelAt = rev.reduce((best, v, i) => (v - prof[i] > rev[best] - prof[best] ? i : best), 0)

const fade = { duration: 0.25, ease: [0.23, 1, 0.32, 1] } as const
const DIM = 0.35

// The SVG renders at about half size on a phone, so callout notes need bigger user units there.
const phoneMq = matchMedia('(max-width: 860px)')
const subscribe = (cb: () => void) => (phoneMq.addEventListener('change', cb), () => phoneMq.removeEventListener('change', cb))
const usePhone = () => useSyncExternalStore(subscribe, () => phoneMq.matches)

function Title() {
  return (
    <section id="Hook" className="hook-title">
      <header className="running-head">
        <span>Chrome &amp; Oak · the books</span>
        <span>{meta.comparison}</span>
      </header>
      <motion.div
        className="hook-title-inner"
        initial={{ opacity: 1, transform: 'translateY(12px)' }}
        animate={{ opacity: 1, transform: 'translateY(0px)' }}
        transition={{ duration: 0.6, ease: fade.ease }}
      >
        <blockquote className="hook-quote">
          <h1>“Then why is cash so tight?</h1>
          <p>Revenue is growing but profit isn’t keeping up, and I’m chasing unpaid invoices every week.”</p>
          <footer className="hook-attrib muted">— the CFO</footer>
        </blockquote>
        <p className="hook-cue muted" aria-hidden="true">
          Scroll to follow the money <Arrow dir="down" />
        </p>
      </motion.div>
    </section>
  )
}

function Chart({ step, progress }: { step: number; progress: MotionValue<number> }) {
  const { tier } = useQuality()
  const [hover, setHover] = useState<number | null>(null)
  const fs = usePhone() ? 23 : 13

  // Step 0 draws the first year, step 1 the rest; scroll-linked on mid/high, instant on low.
  const scrubW = useTransform(progress, [0, 0.18, 0.27, 0.45], [x(0), x(firstYearEnd), x(firstYearEnd), x(last)])
  const revealW = tier === 'low' ? (step === 0 ? x(firstYearEnd) : x(last)) : scrubW
  // End labels wait until the lines have reached them.
  const scrubEnd = useTransform(progress, [0.43, 0.47], [0, 1])
  const endOpacity = tier === 'low' ? (step >= 1 ? 1 : 0) : scrubEnd
  const maxHover = step === 0 ? firstYearEnd : last
  const ticks = y.ticks(5)
  // Step 2 looks at the profit dip, so revenue steps back.
  const revOpacity = step === 2 ? DIM : 1
  const gapMid = (y(rev[gapLabelAt]) + y(prof[gapLabelAt])) / 2

  return (
    <div className="hook-chart">
      <motion.div className="hook-stats" initial={false} animate={{ opacity: step === 3 ? 1 : 0 }} transition={fade} aria-hidden={step !== 3}>
        {/* The headline in the books: two entries, then the shortfall carried in red. */}
        <table className="ledger">
          <thead>
            <tr>
              <th scope="col">Jan to Sep</th>
              <th scope="col" className="fig">
                2025
              </th>
              <th scope="col" className="fig">
                2026
              </th>
              <th scope="col" className="fig">
                Change
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <span className="hook-key" data-k="rev" /> Revenue
              </td>
              <td className="fig">{moneyShort(yoy['2025'].revenue)}</td>
              <td className="fig">{moneyShort(yoy['2026'].revenue)}</td>
              <td className="fig">{signedPct(yoy.change.revenue)}</td>
            </tr>
            <tr>
              <td>
                <span className="hook-key" data-k="prof" /> Profit
              </td>
              <td className="fig">{moneyShort(yoy['2025'].profitAfterRefunds)}</td>
              <td className="fig">{moneyShort(yoy['2026'].profitAfterRefunds)}</td>
              <td className="fig">{signedPct(yoy.change.profitAfterRefunds)}</td>
            </tr>
            <tr className="total">
              <td>
                <span className="hook-key" data-k="gap" /> Missed profit
              </td>
              <td />
              <td className="fig leak">({moneyShort(gap)})</td>
              <td />
            </tr>
          </tbody>
        </table>
      </motion.div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Revenue and profit (after refunds), both set to 100 in ${qLabel(quarters[0].q)}. They move together in ${quarters[0].q.slice(0, 4)}, then split. Profit drops in ${qLabel(dipQuarter.q)} when refunds jump. Revenue grew ${pct(yoy.change.revenue)}, profit only ${pct(yoy.change.profitAfterRefunds)}: about ${moneyShort(gap)} of profit missed.`}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id="hook-reveal">
            <motion.rect x={0} y={0} height={H} width={revealW} />
          </clipPath>
        </defs>

        <g className="hook-legend" transform={`translate(${M.l},18)`}>
          <line x1={0} x2={18} y1={0} y2={0} className="hook-rev" />
          <text x={24} y={4}>
            Revenue
          </text>
          <line x1={124} x2={142} y1={0} y2={0} className="hook-prof" />
          <text x={148} y={4}>
            Profit
          </text>
        </g>

        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className={t === 100 ? 'hook-base' : 'hook-grid'} />
            <text x={M.l - 8} y={y(t) + 4} className="hook-tick" textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {quarters.map((q, i) => (
          <text key={q.q} x={x(i)} y={H - M.b + 20} className="hook-tick" textAnchor="middle">
            {q.q.slice(4)}
            {(i === 0 || i === firstYearEnd + 1) && (
              <tspan x={x(i)} dy="1.3em">
                {q.q.slice(0, 4)}
              </tspan>
            )}
          </text>
        ))}

        <g clipPath="url(#hook-reveal)">
          <motion.path d={gapPath} className="hook-gap" initial={false} animate={{ opacity: step === 3 ? 1 : 0 }} transition={fade} />
          <motion.path d={revPath} className="hook-rev" initial={false} animate={{ opacity: revOpacity }} transition={fade} />
          <path d={profPath} className="hook-prof" />
        </g>
        <circle cx={x(0)} cy={y(100)} r={4} className="hook-dot" />

        <motion.g style={{ opacity: endOpacity }}>
          <motion.g initial={false} animate={{ opacity: revOpacity }} transition={fade}>
            <circle cx={x(last)} cy={y(rev[last])} r={4} className="hook-dot hook-dot-rev" />
            <text x={x(last) + 10} y={y(rev[last]) + 4} className="hook-end">
              Revenue <tspan className="num">{Math.round(rev[last])}</tspan>
            </text>
          </motion.g>
          <circle cx={x(last)} cy={y(prof[last])} r={4} className="hook-dot hook-dot-prof" />
          <text x={x(last) + 10} y={y(prof[last]) + 4} className="hook-end">
            Profit <tspan className="num">{Math.round(prof[last])}</tspan>
          </text>
        </motion.g>

        <Callout
          from={[x(dipIdx) - 30, y(prof[dipIdx]) + 26]}
          to={[x(dipIdx), y(prof[dipIdx])]}
          text={['Refunds jumped,', 'profit fell']}
          show={step === 2}
          tone="leak"
          fontSize={fs}
        />
        <Callout
          from={[x(gapLabelAt) - 150, M.t + 50]}
          to={[x(gapLabelAt), gapMid]}
          text={['Profit that', 'fell behind']}
          show={step === 3}
          tone="leak"
          fontSize={fs}
        />

        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={H - M.b} className="hook-grid" />
            <g transform={`translate(${hover > last / 2 ? x(hover) - 170 : x(hover) + 10},${M.t})`}>
              <rect width={160} height={64} className="hook-tip" />
              <text x={12} y={20} className="hook-tip-title">
                {qLabel(quarters[hover].q)}
              </text>
              <text x={12} y={38} className="hook-tip-row">
                Revenue <tspan className="num">{moneyShort(quarters[hover].revenue)}</tspan>
              </text>
              <text x={12} y={54} className="hook-tip-row">
                Profit <tspan className="num">{moneyShort(quarters[hover].profitAfterRefunds)}</tspan>
              </text>
            </g>
          </g>
        )}
        {quarters.map(
          (q, i) =>
            i <= maxHover && (
              <rect
                key={q.q}
                x={x(i) - (x(1) - x(0)) / 2}
                y={M.t}
                width={x(1) - x(0)}
                height={H - M.t - M.b}
                fill="transparent"
                onPointerEnter={() => setHover(i)}
              />
            ),
        )}
      </svg>
    </div>
  )
}

export default function Hook() {
  const steps = [
    <>
      <h3>At first, they moved together</h3>
      <p className="entry-date">{quarters[0].q.slice(0, 4)}</p>
      <p>Both lines start at 100, so you can compare growth. Profit here means what you keep after refunds.</p>
    </>,
    <>
      <h3>Then they split apart</h3>
      <p className="entry-date">{laterYear[0].q.slice(0, 4)}</p>
      <p>Revenue kept climbing. Profit did not keep up.</p>
    </>,
    <>
      <h3>Refunds pulled profit down</h3>
      <p className="entry-date">{qLabel(dipQuarter.q)}</p>
      <p>
        Refunds jumped to <span className="num">{moneyShort(dipQuarter.refunds)}</span> in one quarter. Profit fell, even while revenue grew.
      </p>
    </>,
    <>
      <h3>
        You missed <span className="num leak">{moneyShort(gap)}</span> of profit
      </h3>
      <p>
        Revenue grew <span className="num">{pct(yoy.change.revenue)}</span>. If profit had grown as fast, you would have that much more.
      </p>
    </>,
  ]

  return (
    <>
      <Title />
      <Scrolly id="Hook-growth" title="Sales and profit" steps={steps}>
        {(state) => <Chart {...state} />}
      </Scrolly>
    </>
  )
}
