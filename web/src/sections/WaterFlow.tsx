import { useRef, type CSSProperties } from 'react'
import { motion, useInView } from 'motion/react'
import { Scrolly } from '../components/Scrolly'
import { Callout } from '../components/Callout'
import { story } from '../data'
import { moneyShort, pct } from '../lib/format'
import { useQuality } from '../lib/quality'
import art from '../assets/water.jpg'
import './WaterFlow.css'

const { yoy } = story
const YEARS = { '2025': yoy['2025'], '2026': yoy['2026'] }
type Year = keyof typeof YEARS
const shortfall = yoy['2025'].profitAfterRefunds * (1 + yoy.change.revenue) - yoy['2026'].profitAfterRefunds

// --- Illustration geometry, in the image's own pixels (660 x 506).
const ART_W = 660
const ART_H = 506
// The scene is widened to the left with a mirror image of the artwork's left part,
// which gives a second thin figure under a second leak. The pipe and floor lines meet at the seam.
const SEAM = 44
const MIRROR_TO = 224 // how far into the artwork the mirrored part reaches (just past the thin figure's foot)
const LEFT = 2 * SEAM - MIRROR_TO
const VIEW_H = 606 // artwork plus the dollar bar underneath
const SIGN_SHIFT = 24 // the floor this far below the signature is plain, so it can stand in for it
const LEAK_Y = 142 // underside of the pipe, where the drips start
const REFUND_X = 140 // the leak drawn in the artwork
const DISCOUNT_X = 2 * SEAM - REFUND_X // its mirror image
// The poured stream, traced from the artwork: pipe mouth down to the open mouth.
const STREAM_SHAPE = '300,97 340,113 380,140 420,172 455,205 490,240 498,250 450,243 420,232 400,222 385,205 365,180 340,152 300,141'
const STREAM_LINE = 'M292 119 C340 126 385 158 425 198 S480 246 505 262'
const PROFIT_AT = [488, 402] // the plain front panel of the armchair
const STREAKS = [-3, -2, -1, 0, 1, 2, 3]
const DROP = 'M0 -10 C1 -4 4.2 0 4.2 4 A4.2 4.2 0 1 1 -4.2 4 C-4.2 0 -1 -4 0 -10 Z'
// One falling drop per this many dollars, so a bigger leak drips more.
const DOLLARS_PER_DROP = 160_000
const dropsFor = (amount: number) => Math.max(1, Math.min(6, Math.round(amount / DOLLARS_PER_DROP)))

// --- Dollar bar: where each sales dollar went, widths in proportion to dollars.
const BAR = { x: LEFT + 16, w: ART_W - LEFT - 32, y: 536, h: 22 }
const parts = (y: Year) => {
  const d = YEARS[y]
  const list = [
    { id: 'discounts', name: 'Discounts', value: d.discounts },
    { id: 'refunds', name: 'Refunds', value: d.refunds },
    { id: 'costs', name: 'Cost of products', value: d.cogs },
    { id: 'kept', name: 'Kept as profit', value: d.profitAfterRefunds },
  ]
  let x = BAR.x
  return list.map((p) => {
    const w = (p.value / d.gross) * BAR.w
    const out = { ...p, x, w }
    x += w
    return out
  })
}

function Drips({ x, count }: { x: number; count: number }) {
  return (
    <g transform={`translate(${x} ${LEAK_Y + 8})`}>
      {Array.from({ length: count }, (_, i) => (
        // --at: where this drop rests along the fall when the animation is off
        <path
          key={`${count}-${i}`}
          className="water-drop"
          d={DROP}
          style={{ animationDelay: `${(-i * 1.7) / count}s`, '--at': (i + 0.5) / count } as CSSProperties}
        />
      ))}
    </g>
  )
}

function Scene({ step }: { step: number }) {
  const { tier } = useQuality()
  const ref = useRef<SVGSVGElement>(null)
  const inView = useInView(ref, { amount: 0.2 })
  const year: Year = step === 0 ? '2025' : '2026'
  const d = YEARS[year]
  const bar = parts(year)
  const kept = bar[3]
  const gapW = (shortfall / d.gross) * BAR.w
  const dim = (on: boolean) => ({ opacity: on ? 1 : 0.35 })
  const label =
    step < 3
      ? `In ${year}, ${moneyShort(d.gross)} of sales poured in. ${moneyShort(d.discounts)} dripped away as discounts and ${moneyShort(d.refunds)} as refunds. ${moneyShort(d.profitAfterRefunds)} was kept as profit.`
      : `Profit in 2026 was ${moneyShort(d.profitAfterRefunds)}, ${moneyShort(shortfall)} short of where it would be had it kept up with revenue.`

  return (
    <svg
      ref={ref}
      className="water"
      data-year={year}
      data-moving={tier !== 'low' && inView}
      viewBox={`${LEFT} 0 ${ART_W - LEFT} ${VIEW_H}`}
      role="img"
      aria-label={label}
    >
      <defs>
        <clipPath id="water-frame">
          <rect x={LEFT} y={0} width={ART_W - LEFT} height={ART_H} rx={10} />
        </clipPath>
        <clipPath id="water-mirror">
          <rect x={LEFT} y={0} width={SEAM - LEFT + 0.5} height={ART_H} />
        </clipPath>
        <clipPath id="water-original">
          <rect x={SEAM} y={0} width={ART_W - SEAM} height={ART_H} />
        </clipPath>
        {/* clip is in the image's own pixels: the clean strip of floor just under the signature */}
        <clipPath id="water-sign">
          <rect x={52} y={456 + SIGN_SHIFT} width={78} height={24} />
        </clipPath>
        <clipPath id="water-stream">
          <polygon points={STREAM_SHAPE} />
        </clipPath>
      </defs>

      <g clipPath="url(#water-frame)">
        <g clipPath="url(#water-mirror)">
          <image href={art} width={ART_W} height={ART_H} transform={`translate(${2 * SEAM} 0) scale(-1 1)`} />
          {/* the artist's signature would read backwards in the mirrored part: cover that copy only */}
          <image href={art} width={ART_W} height={ART_H} clipPath="url(#water-sign)" transform={`translate(${2 * SEAM} ${-SIGN_SHIFT}) scale(-1 1)`} />
        </g>
        <image href={art} width={ART_W} height={ART_H} clipPath="url(#water-original)" />

        {/* Moving water, drawn like the artwork: fine white and ink streaks along the pour, white drops with an ink outline. */}
        <g clipPath="url(#water-stream)" className="water-streaks">
          {STREAKS.map((k) => (
            <path
              key={k}
              d={STREAM_LINE}
              className={k % 2 ? 'water-streak water-streak-ink' : 'water-streak'}
              data-extra={Math.abs(k) === 3}
              transform={`translate(${k * 3.4} ${-k * 4.4})`}
              style={{ animationDelay: `${-((k + 3) * 0.37)}s` }}
            />
          ))}
        </g>
        <g className="water-drips">
          <Drips x={DISCOUNT_X} count={dropsFor(d.discounts)} />
          <Drips x={REFUND_X} count={dropsFor(d.refunds)} />
        </g>

        <text className="water-year num" x={ART_W - 18} y={40} textAnchor="end">
          {year}
        </text>
        <motion.g initial={false} animate={dim(step !== 2 && step !== 3)}>
          <text className="water-label" x={268} y={46}>
            Sales at list price
          </text>
          <text className="water-label water-value num" x={268} y={66}>
            {moneyShort(d.gross)}
          </text>
        </motion.g>
        {/* profit sits on the armchair: it is what the business gets to keep */}
        <motion.g initial={false} animate={dim(step === 0 || step === 3)}>
          <text className="water-label" x={PROFIT_AT[0]} y={PROFIT_AT[1]} textAnchor="middle">
            Kept as profit
          </text>
          <text className="water-label water-value num" x={PROFIT_AT[0]} y={PROFIT_AT[1] + 20} textAnchor="middle">
            {moneyShort(d.profitAfterRefunds)}
          </text>
        </motion.g>
        <motion.g initial={false} animate={dim(step !== 1 && step !== 3)}>
          <text className="water-label" x={DISCOUNT_X - 14} y={176} textAnchor="end">
            Discounts
          </text>
          <text className="water-label water-value num" x={DISCOUNT_X - 14} y={196} textAnchor="end">
            {moneyShort(d.discounts)}
          </text>
          <text className="water-label" x={REFUND_X + 14} y={176}>
            Refunds
          </text>
          <text className="water-label water-value num" x={REFUND_X + 14} y={196}>
            {moneyShort(d.refunds)}
          </text>
        </motion.g>
      </g>

      {/* Dollar bar: the drawing shows the idea, this shows the real proportions. */}
      <text className="water-bar-title" x={BAR.x} y={BAR.y - 10}>
        Where each sales dollar went, {year}
      </text>
      {bar.map((p) => (
        <g key={p.id}>
          <motion.rect
            className="water-seg"
            data-part={p.id}
            y={BAR.y}
            height={BAR.h}
            initial={false}
            animate={{ attrX: p.x + 1, width: Math.max(0, p.w - 2) }}
          />
          <motion.g initial={false} animate={{ x: p.x + p.w / 2 }}>
            <text className="water-seg-name" y={BAR.y + BAR.h + 16} textAnchor="middle">
              {p.name}
            </text>
            <text className="water-seg-value num" y={BAR.y + BAR.h + 32} textAnchor="middle">
              {moneyShort(p.value)}
            </text>
          </motion.g>
        </g>
      ))}
      {/* The slice of profit that is missing, drawn as an empty outline next to what was kept. */}
      <motion.rect
        className="water-gap"
        x={kept.x - gapW}
        y={BAR.y - 3}
        width={gapW}
        height={BAR.h + 6}
        initial={false}
        animate={{ opacity: step === 3 ? 1 : 0 }}
      />
      <g className="water-notes">
        <Callout show={step === 1} from={[314, 214]} to={[352, 166]} text={[`${pct(yoy.change.gross)} more`, 'poured in']} fontSize={13} />
        <Callout
          show={step === 2}
          tone="leak"
          from={[DISCOUNT_X, 60]}
          to={[DISCOUNT_X, LEAK_Y - 4]}
          bend={0.12}
          text={['This leak', `grew ${pct(yoy.change.discounts)}`]}
          fontSize={13}
        />
        <Callout
          show={step === 2}
          tone="leak"
          from={[REFUND_X, 60]}
          to={[REFUND_X, LEAK_Y - 4]}
          bend={-0.12}
          text={['This leak', `grew ${pct(yoy.change.refunds)}`]}
          fontSize={13}
        />
        <Callout
          show={step === 3}
          tone="leak"
          from={[kept.x - gapW / 2 - 36, 484]}
          to={[kept.x - gapW / 2, BAR.y - 2]}
          text={[`${moneyShort(shortfall)} short of`, 'where it should be']}
          fontSize={13}
        />
      </g>
      <text className="water-credit" x={ART_W - 16} y={VIEW_H - 4} textAnchor="end">
        Illustration: Baysal. Mirrored and animated for this story.
      </text>
    </svg>
  )
}

export default function WaterFlow() {
  const a = YEARS['2025']
  const b = YEARS['2026']
  const steps = [
    <>
      <p className="eyebrow">2025</p>
      <h3>Every sale pours down one pipe.</h3>
      <p>
        At list price, <span className="num">{moneyShort(a.gross)}</span> poured in. After discounts, costs and refunds,{' '}
        <span className="num">{moneyShort(a.profitAfterRefunds)}</span> stayed. That is your profit.
      </p>
    </>,
    <>
      <p className="eyebrow">2026</p>
      <h3>More money poured in.</h3>
      <p>
        Sales at list price grew <span className="num">{pct(yoy.change.gross)}</span>, to <span className="num">{moneyShort(b.gross)}</span>. That is the growth
        everyone sees.
      </p>
    </>,
    <>
      <p className="eyebrow leak">The leaks</p>
      <h3>The leaks grew faster than sales.</h3>
      <p>Discounts and refunds both grew much faster than sales. So more of every sale drips away before it reaches you.</p>
    </>,
    <>
      <p className="eyebrow">What stayed</p>
      <h3>Profit barely went up.</h3>
      <p>
        Profit grew only <span className="num">{pct(yoy.change.profitAfterRefunds)}</span>. If it had kept up with revenue, you would have{' '}
        <span className="num leak">{moneyShort(shortfall)}</span> more.
      </p>
    </>,
  ]

  return (
    <Scrolly id="Flow" steps={steps}>
      {({ step }) => <Scene step={step} />}
    </Scrolly>
  )
}
