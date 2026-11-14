import { Component, lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { motion, useInView, useMotionValue, useTransform, type MotionValue } from 'motion/react'
import { Callout } from '../components/Callout'
import { Scrolly } from '../components/Scrolly'
import { useQuality } from '../lib/quality'
import { moneyShort, pct, signedPct } from '../lib/format'
import {
  bezierPath,
  change,
  cogsChange,
  DRAIN_Y,
  HOLE_Y,
  leakCurves,
  levelOf,
  maxInflow,
  ORIGIN,
  paceGap,
  paceProfit,
  PIPE_H,
  PIPE_Y,
  PITCH,
  project,
  R,
  RIM_RY,
  H,
  shape,
  VB,
  vy,
  y25,
  y26,
} from './bucket/geometry'
import './Bucket.css'

// Only the high tier ever requests this chunk, so other tiers never download three.js.
const Bucket3D = lazy(() => import('./bucket/Bucket3D'))

const steps = [
  <>
    <p className="eyebrow">2025</p>
    <h3>Every sale pours into a bucket.</h3>
    <p>
      At list price, <b className="num">{moneyShort(y25.gross)}</b> poured in. After discounts, costs and refunds, <b className="num">{moneyShort(y25.profitAfterRefunds)}</b>{' '}
      stayed. That is your profit.
    </p>
  </>,
  <>
    <p className="eyebrow">2026</p>
    <h3>More money poured in.</h3>
    <p>
      Sales at list price grew <b className="num">{pct(change.gross)}</b>, to <b className="num">{moneyShort(y26.gross)}</b>. That is the growth everyone sees.
    </p>
  </>,
  <>
    <p className="eyebrow">The leaks</p>
    <h3>The holes grew faster than sales.</h3>
    <p>Discounts and refunds both grew much faster than sales. So more of every sale leaks away.</p>
  </>,
  <>
    <p className="eyebrow">What stayed</p>
    <h3>Profit barely went up.</h3>
    <p>
      Profit grew only <b className="num">{pct(change.profitAfterRefunds)}</b>. If it had kept up with revenue, you would have{' '}
      <b className="num leak">{moneyShort(paceGap)}</b> more.
    </p>
  </>,
]

const ariaLabel =
  `Leaking bucket. Sales at list price grew ${pct(change.gross)}, from ${moneyShort(y25.gross)} to ${moneyShort(y26.gross)}. ` +
  `Discounts grew ${pct(change.discounts)} to ${moneyShort(y26.discounts)} and refunds grew ${pct(change.refunds)} to ${moneyShort(y26.refunds)}. ` +
  `Cost of products was ${moneyShort(y26.cogs)}, a normal cost. Profit grew only ${pct(change.profitAfterRefunds)}, to ${moneyShort(y26.profitAfterRefunds)}: ` +
  `${moneyShort(paceGap)} less than if it had kept up with revenue.`

export default function Bucket() {
  return (
    <Scrolly id="Bucket" steps={steps}>
      {({ step, progress }) => <Stage step={step} progress={progress} />}
    </Scrolly>
  )
}

function Stage({ step, progress }: { step: number; progress: MotionValue<number> }) {
  const { tier } = useQuality()
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref)
  // Stage width in px, so callout notes keep a readable screen size at any stage size.
  const [width, setWidth] = useState(VB.w)
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(ref.current!)
    return () => ro.disconnect()
  }, [])
  // 0 = 2025 shapes, 1 = 2026. Scrubbed across the scroll into step 2 on mid/high; a hard switch on low.
  const scrubbed = useTransform(progress, [0.15, 0.3], [0, 1])
  const switched = useMotionValue(step >= 1 ? 1 : 0)
  useEffect(() => switched.set(step >= 1 ? 1 : 0), [step, switched])
  const t = tier === 'low' ? switched : scrubbed

  const svg = <BucketSvg t={t} />
  return (
    <div className="bucket-wrap">
      <div ref={ref} className="bucket-stage" style={{ '--vb': VB.w / VB.h } as CSSProperties} data-step={step} data-flow={tier !== 'low' && inView} role="img" aria-label={ariaLabel}>
        {tier === 'high' ? (
          <Fallback to={svg}>
            <Suspense fallback={svg}>
              <Bucket3D t={t} step={step} active={inView} />
            </Suspense>
          </Fallback>
        ) : (
          svg
        )}
        <Overlay step={step} width={width} />
      </div>
    </div>
  )
}

/** If three.js fails to load or WebGL is unavailable, show the 2D bucket instead of breaking the page. */
class Fallback extends Component<{ to: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError = () => ({ failed: true })
  render = () => (this.state.failed ? this.props.to : this.props.children)
}

// viewBox anchors, shared by both renderers
const L = ORIGIN.x - R
const RT = ORIGIN.x + R
const RIM = vy(H)
const BASE = ORIGIN.y
const HOLE = vy(HOLE_Y)
const PIPE = vy(PIPE_Y) // pipe mouth
const PIPE_TOP = vy(PIPE_Y + PIPE_H) - (maxInflow / 2 + 10) * Math.sin(PITCH) // matches the 3D pipe's top cap
const FADE_TOP = BASE + 90
const arc = (y: number, r = R, ry = RIM_RY, sweep = 0) => `M${ORIGIN.x - r},${y} A${r} ${ry} 0 0 ${sweep} ${ORIGIN.x + r},${y}`

function BucketSvg({ t }: { t: MotionValue<number> }) {
  const w = (k: 'inflow' | 'discounts' | 'cogs' | 'refunds') => (v: number) => shape(v)[k]
  const inflow = useTransform(t, w('inflow'))
  const discounts = useTransform(t, w('discounts'))
  const refunds = useTransform(t, w('refunds'))
  const cogs = useTransform(t, w('cogs'))
  const surface = useTransform(t, (v) => vy(shape(v).level))
  const water = useTransform(surface, (s) => `M${L + 3},${s} L${L + 3},${BASE} A${R - 3} ${RIM_RY - 1} 0 0 0 ${RT - 3},${BASE} L${RT - 3},${s} Z`)
  const pour = useTransform(surface, (s) => `M${ORIGIN.x},${PIPE} L${ORIGIN.x},${s}`)
  const splashRx = useTransform(inflow, (x) => x / 2 + 6)
  const splashRy = useTransform(splashRx, (x) => (x * RIM_RY) / R)

  return (
    <svg className="bucket-art" viewBox={`0 0 ${VB.w} ${VB.h}`} aria-hidden="true">
      {/* back of the glass */}
      <path className="glass-back" d={`M${L},${RIM} L${L},${BASE} A${R} ${RIM_RY} 0 0 0 ${RT},${BASE} L${RT},${RIM} A${R} ${RIM_RY} 0 0 0 ${L},${RIM} Z`} />
      <path className="glass-edge faint" d={arc(RIM, R, RIM_RY, 1)} />

      {/* cost of goods: the normal drain */}
      <Stream className="is-cogs cogs" d={`M${ORIGIN.x},${BASE} L${ORIGIN.x},${vy(DRAIN_Y)}`} w={cogs} />

      {/* what stays: profit after refunds */}
      <g className="is-kept">
        <motion.path className="water" d={water} />
        <motion.ellipse className="water-top" cx={ORIGIN.x} cy={surface} rx={R - 3} ry={RIM_RY - 1} />
      </g>

      {/* the pour */}
      <rect className="pipe" x={ORIGIN.x - maxInflow / 2 - 10} y={PIPE_TOP} width={maxInflow + 20} height={PIPE - PIPE_TOP} rx={4} />
      <Stream className="is-inflow inflow" d={pour} w={inflow}>
        <motion.ellipse className="splash" cx={ORIGIN.x} cy={surface} rx={splashRx} ry={splashRy} />
      </Stream>

      {/* the two leaks */}
      <Leak d={bezierPath(leakCurves.discounts)} x={L} w={discounts} />
      <Leak d={bezierPath(leakCurves.refunds)} x={RT} w={refunds} />

      {/* front of the glass */}
      <path className="glass-edge" d={`M${L},${RIM} L${L},${BASE} A${R} ${RIM_RY} 0 0 0 ${RT},${BASE} L${RT},${RIM}`} />
      <path className="glass-edge rim" d={arc(RIM)} />
      <line className="glass-shine" x1={L + 22} y1={RIM + 40} x2={L + 22} y2={BASE - 10} />
    </svg>
  )
}

/** A stream of width `w`, plus a thin dashed copy that crawls along it to show direction (CSS, paused off screen). */
function Stream({ d, w, className, children }: { d: string | MotionValue<string>; w: MotionValue<number>; className: string; children?: ReactNode }) {
  const flow = useTransform(w, (x) => Math.max(1.5, x * 0.3))
  return (
    <g className={className}>
      <motion.path className="stream" d={d} strokeWidth={w} />
      <motion.path className="bucket-flow" d={d} strokeWidth={flow} />
      {children}
    </g>
  )
}

/** Hole seen almost edge-on: as tall as the stream it lets out. */
function Leak({ d, x, w }: { d: string; x: number; w: MotionValue<number> }) {
  const rx = useTransform(w, (v) => Math.max(2, v * 0.18))
  const ry = useTransform(w, (v) => v / 2)
  return (
    <Stream className="is-leak leak" d={d} w={w}>
      <motion.ellipse className="hole" cx={x} cy={HOLE} rx={rx} ry={ry} />
    </Stream>
  )
}

type Anchor ='tl' | 'tr' | 'bl' | 'br' | 'l' | 'r' | 'c'
function Tag({ x, y, at, className = '', children }: { x: number; y: number; at: Anchor; className?: string; children: ReactNode }) {
  return (
    <div className={`bucket-tag ${className}`} data-at={at} style={{ left: `${(x / VB.w) * 100}%`, top: `${(y / VB.h) * 100}%` }}>
      {children}
    </div>
  )
}

/** Labels, level markers and callouts: plain HTML/SVG on top, so they stay crisp and identical over the SVG or the 3D bucket. */
function Overlay({ step, width }: { step: number; width: number }) {
  const yr = step === 0 ? y25 : y26
  const now = step >= 1
  const lvl25 = vy(levelOf(y25.profitAfterRefunds))
  const lvl26 = vy(levelOf(y26.profitAfterRefunds))
  const pace = vy(levelOf(paceProfit))
  const [cogsX] = project([shape(1).cogs / 2 + 14, 0, 0])
  const narrow = width < 520
  const fs = ((narrow ? 12 : 14) * VB.w) / width // note size in viewBox units for ~12-14 screen px
  const pourY = (PIPE + lvl26) / 2
  const pourX = ORIGIN.x - shape(1).inflow / 2
  return (
    <>
      {/* streams fade out before the frame edge instead of running off it */}
      <div
        className="bucket-fade"
        style={{ top: `${(FADE_TOP / VB.h) * 100}%`, background: `linear-gradient(transparent, var(--bg) ${((vy(DRAIN_Y) - FADE_TOP) / (VB.h - FADE_TOP)) * 100}%)` }}
      />

      <svg className="bucket-marks" viewBox={`0 0 ${VB.w} ${VB.h}`} aria-hidden="true">
        <g className="bucket-lines" data-show={step === 3}>
          <path className="mark-then" d={arc(lvl25, R - 3, RIM_RY - 1)} />
          <path className="mark-pace" d={arc(pace, R - 3, RIM_RY - 1)} />
        </g>
        <Callout show={step === 1} from={[pourX - 70, pourY + 40]} to={[pourX, pourY]} text={[`${pct(change.gross)} more`, 'poured in']} tone="oak" fontSize={fs} />
        <Callout show={step === 2} from={[L - 25, BASE + 38]} to={[L, HOLE]} text={narrow ? `Grew ${pct(change.discounts)}` : ['This hole', `grew ${pct(change.discounts)}`]} tone="leak" bend={-0.15} anchor="middle" fontSize={fs} />
        <Callout show={step === 2} from={[RT + 25, BASE + 38]} to={[RT, HOLE]} text={narrow ? `Grew ${pct(change.refunds)}` : ['This hole', `grew ${pct(change.refunds)}`]} tone="leak" bend={0.15} anchor="middle" fontSize={fs} />
        <Callout show={step === 3} from={[RT + 44, (pace + lvl26) / 2]} to={[RT + 3, (pace + lvl26) / 2]} text={narrow ? `${moneyShort(paceGap)} short` : [`${moneyShort(paceGap)} short of`, 'where it should be']} tone="leak" fontSize={fs} />
      </svg>

      <div className="bucket-year num" aria-hidden="true">
        {step === 0 ? 2025 : 2026}
      </div>

      <div aria-hidden="true">
        <Tag x={ORIGIN.x + maxInflow / 2 + 22} y={PIPE_TOP} at="tl" className="is-inflow">
          <span className="tag-name">Sales at list price</span>
          <span className="tag-amt num">
            {moneyShort(yr.gross)}
            {now && <em className="tag-chg">{signedPct(change.gross)}</em>}
          </span>
        </Tag>

        <Tag x={L - 14} y={HOLE - 26} at="br" className="is-leak">
          <span className="tag-name leak-name">Discounts</span>
          <span className="tag-amt num">{moneyShort(yr.discounts)}</span>
        </Tag>

        <Tag x={RT + 14} y={HOLE - 26} at="bl" className="is-leak">
          <span className="tag-name leak-name">Refunds</span>
          <span className="tag-amt num">{moneyShort(yr.refunds)}</span>
        </Tag>

        <Tag x={cogsX} y={BASE + 112} at="l" className="is-cogs">
          <span className="tag-name">Cost of products</span>
          <span className="tag-amt num">
            {moneyShort(yr.cogs)}
            {step >= 2 && <em className="tag-chg">{signedPct(cogsChange)}</em>}
          </span>
          <span className="tag-note">a normal cost, not a leak</span>
        </Tag>

        <Tag x={ORIGIN.x} y={(lvl26 + BASE) / 2 + 14} at="c" className="is-kept kept">
          <span className="tag-name">
            Kept<span className="wide"> as profit</span>
          </span>
          <span className="tag-amt num">
            {moneyShort(yr.profitAfterRefunds)}
            {step >= 3 && <em className="tag-chg">{signedPct(change.profitAfterRefunds)}</em>}
          </span>
        </Tag>

        <div className="bucket-step3" data-show={step === 3}>
          <Tag x={RT + 24} y={pace - 6} at="bl">
            <span className="tag-name">
              <span className="wide">If profit kept up with revenue ({signedPct(change.revenue)})</span>
              <span className="narrow">If it kept up</span>
            </span>
            <span className="tag-amt num">{moneyShort(paceProfit)}</span>
          </Tag>
          <Tag x={L - 12} y={lvl25} at="r" className="inline">
            <span className="tag-name">2025 level</span>
            <span className="tag-amt num">{moneyShort(y25.profitAfterRefunds)}</span>
          </Tag>
        </div>
      </div>
    </>
  )
}
