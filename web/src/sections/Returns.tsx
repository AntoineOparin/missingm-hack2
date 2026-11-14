import { useRef, useSyncExternalStore } from 'react'
import { motion, useInView, type Transition } from 'motion/react'
import { scaleBand, scaleLinear } from 'd3-scale'
import { Callout } from '../components/Callout'
import { Scrolly } from '../components/Scrolly'
import { story } from '../data'
import { money, moneyShort, pct } from '../lib/format'
import { useQuality } from '../lib/quality'

const { returns, returnsByQuarter, yoy } = story
const flagged = returns.find((r) => r.flag)!
const OVERSTOCK = 'Overstock / ordered in error'
const overstockWho = story.returnReasons.find((r) => r.reason === OVERSTOCK)!
const overstock = returns.filter((r) => r.reason === OVERSTOCK)
const overstockTotal = overstock.reduce((s, r) => s + r.refund, 0)
const qLabel = (q: string) => `${q.slice(4)} ${q.slice(0, 4)}`
const lastYear = returnsByQuarter[returnsByQuarter.length - 1].q.slice(0, 4)
const spike = returnsByQuarter.reduce((a, b) => (b.refund > a.refund ? b : a))
const others = returnsByQuarter.filter((d) => d !== spike).map((d) => d.refund).sort((a, b) => a - b)
// How many normal (typical) quarters the spike quarter is worth.
const spikeRatio = Math.round(spike.refund / others[others.length >> 1])

const W = 600
const H = 400
const DIM = 0.35

// The SVG shrinks to about 60% on phones, so callout notes need a bigger font there.
const narrowQuery = matchMedia('(max-width: 860px)')
const subscribeNarrow = (cb: () => void) => (narrowQuery.addEventListener('change', cb), () => narrowQuery.removeEventListener('change', cb))
const useNarrow = () => useSyncExternalStore(subscribeNarrow, () => narrowQuery.matches)

// --- Quarterly bars (steps 0-1)
const PLOT = { top: 56, bottom: 352, left: 8, right: W - 8 }
const x = scaleBand(returnsByQuarter.map((d) => d.q), [PLOT.left, PLOT.right]).padding(0.28)
const y = scaleLinear([0, Math.max(...returnsByQuarter.map((d) => d.refund))], [PLOT.bottom, PLOT.top]).nice()

// --- Treemap (steps 2-5): one row per product, one block per reason, area ∝ refund dollars.
// Products under 3% of refunds share one row so every row is tall enough to label.
const total = returns.reduce((s, r) => s + r.refund, 0)
const GUTTER = 150
const MAP = { top: 40, bottom: H, left: GUTTER, right: W }
const byProduct = new Map<string, typeof returns>()
for (const r of returns) byProduct.set(r.product, [...(byProduct.get(r.product) ?? []), r])
const big = [...byProduct].filter(([, rs]) => rs.reduce((s, r) => s + r.refund, 0) / total >= 0.03)
const small = [...byProduct].filter(([, rs]) => rs.reduce((s, r) => s + r.refund, 0) / total < 0.03)
const groups = [
  ...big.map(([name, rs]) => ({ name, rs })),
  ...(small.length ? [{ name: `${small.length} other products`, rs: small.flatMap(([, rs]) => rs) }] : []),
]
  .map((g) => ({ ...g, rs: [...g.rs].sort((a, b) => b.refund - a.refund), sum: g.rs.reduce((s, r) => s + r.refund, 0) }))
  .sort((a, b) => b.sum - a.sum)

type Cell = { key: string; x: number; y: number; w: number; h: number; r: (typeof returns)[number] }
const rows: { name: string; sum: number; y: number; h: number }[] = []
const cells: Cell[] = []
{
  const rowScale = scaleLinear([0, total], [MAP.top, MAP.bottom])
  let acc = 0
  for (const g of groups) {
    const y0 = rowScale(acc)
    const h = rowScale(acc + g.sum) - y0
    rows.push({ name: g.name, sum: g.sum, y: y0, h })
    const colScale = scaleLinear([0, g.sum], [MAP.left, MAP.right])
    let accX = 0
    for (const r of g.rs) {
      const x0 = colScale(accX)
      // 1px inset on every side leaves a 2px gap between neighbours
      cells.push({ key: `${r.product}|${r.reason}`, x: x0 + 1, y: y0 + 1, w: colScale(accX + r.refund) - x0 - 2, h: h - 2, r })
      accX += r.refund
    }
    acc += g.sum
  }
}
const flaggedCell = cells.find((c) => c.r.flag)!
const overstockCell = cells.filter((c) => c.r.reason === OVERSTOCK).reduce((a, b) => (b.r.refund > a.r.refund ? b : a))

/** Reason text that fits a block, or nothing; ~6.3px per character at 11px. */
function fit(text: string, w: number) {
  if (text.length * 6.3 + 12 <= w) return text
  const short = text.split(' ')[0]
  return short.length * 6.3 + 12 <= w ? short : ''
}

const TITLES = ['Money refunded each quarter', 'What was sent back, and why', `${OVERSTOCK}: ${moneyShort(overstockTotal)} refunded`]
const titleFor = (step: number) => (step <= 1 ? 0 : step <= 4 ? 1 : 2)

function Graphic({ step }: { step: number }) {
  const { tier } = useQuality()
  const narrow = useNarrow()
  const ref = useRef<SVGSVGElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.4 })
  const t: Transition = tier === 'low' ? { duration: 0.2 } : { duration: 0.5, ease: [0.23, 1, 0.32, 1] }
  const grow = tier === 'low' || inView
  const blocks = step >= 2
  // Only the block the story is about stays lit; the rest dim and lose their text.
  const lit = (c: Cell) => step === 2 || (step <= 4 ? c.r.flag : c.r.reason === OVERSTOCK)
  const noteFont = narrow ? 20 : 11
  const flagMidY = flaggedCell.y + flaggedCell.h / 2
  // Notes sit in the empty left gutter; on phones the bigger text needs the arrow start closer to the blocks.
  const gutterX = narrow ? 8 : 34

  const label = [
    `Money refunded each quarter, from ${moneyShort(returnsByQuarter[0].refund)} up to ${moneyShort(spike.refund)}.`,
    `Refunds peaked at ${moneyShort(spike.refund)} in ${qLabel(spike.q)}.`,
    `Refunds split into blocks by product and reason. The ${flagged.product} damaged-in-transit block is by far the biggest.`,
    `${flagged.product}, damaged in transit, is ${pct(flagged.share)} of all refunds.`,
    `${flagged.product}, damaged in transit, is ${pct(flagged.share)} of all refunds. Fix the packing or the carrier.`,
    `${OVERSTOCK} refunds total ${moneyShort(overstockTotal)}, the second biggest reason.`,
  ][step]

  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
      {TITLES.map((title, i) => (
        <motion.text key={i} x={0} y={16} fontSize={13} fill="var(--muted)" initial={false} animate={{ opacity: titleFor(step) === i ? 1 : 0 }} transition={t}>
          {title}
        </motion.text>
      ))}

      {/* Steps 0-1: refunds per quarter */}
      <motion.g initial={false} animate={{ opacity: blocks ? 0 : 1 }} transition={t} style={{ pointerEvents: blocks ? 'none' : 'auto' }}>
        <line x1={PLOT.left} x2={PLOT.right} y1={PLOT.bottom} y2={PLOT.bottom} stroke="var(--line)" />
        {returnsByQuarter.map((d, i) => {
          const latest = d.q.startsWith(lastYear)
          return (
            <motion.g key={d.q} initial={false} animate={{ opacity: step === 1 && d !== spike ? DIM : 1 }} transition={t}>
              <motion.rect
                x={x(d.q)}
                y={y(d.refund)}
                width={x.bandwidth()}
                height={PLOT.bottom - y(d.refund)}
                rx={4}
                fill={latest ? 'var(--leak)' : 'var(--chrome)'}
                fillOpacity={latest ? 0.9 : 0.55}
                style={{ transformBox: 'fill-box', transformOrigin: 'bottom' }}
                initial={tier === 'low' ? false : { transform: 'scaleY(0)' }}
                animate={{ transform: grow ? 'scaleY(1)' : 'scaleY(0)' }}
                transition={{ ...t, delay: tier === 'low' ? 0 : i * 0.05 }}
              >
                <title>{`${qLabel(d.q)}: ${money(d.refund)} refunded`}</title>
              </motion.rect>
              <motion.text
                className="num"
                x={x(d.q)! + x.bandwidth() / 2}
                y={y(d.refund) - 8}
                textAnchor="middle"
                fontSize={12}
                fill="var(--text)"
                initial={tier === 'low' ? false : { opacity: 0 }}
                animate={{ opacity: grow ? 1 : 0 }}
                transition={{ ...t, delay: tier === 'low' ? 0 : 0.3 + i * 0.05 }}
              >
                {moneyShort(d.refund)}
              </motion.text>
              <text x={x(d.q)! + x.bandwidth() / 2} y={PLOT.bottom + 20} textAnchor="middle" fontSize={12} fill="var(--muted)">
                {d.q.slice(4)}
              </text>
            </motion.g>
          )
        })}
        {/* year labels under each run of quarters */}
        {[...new Set(returnsByQuarter.map((d) => d.q.slice(0, 4)))].map((yr) => {
          const qs = returnsByQuarter.filter((d) => d.q.startsWith(yr))
          const x0 = x(qs[0].q)!
          const x1 = x(qs[qs.length - 1].q)! + x.bandwidth()
          return (
            <g key={yr}>
              <line x1={x0} x2={x1} y1={PLOT.bottom + 30} y2={PLOT.bottom + 30} stroke="var(--line)" />
              <text x={(x0 + x1) / 2} y={PLOT.bottom + 46} textAnchor="middle" fontSize={12} fill="var(--muted)" className="num">
                {yr}
              </text>
            </g>
          )
        })}
        <Callout
          from={[x(spike.q)! - 46, y(spike.refund) - 6]}
          to={[x(spike.q)!, y(spike.refund) + 24]}
          text={['Refunds spike', 'in one quarter']}
          show={step === 1}
          tone="leak"
          fontSize={noteFont}
        />
      </motion.g>

      {/* Steps 2-5: blocks by product and reason */}
      <motion.g initial={false} animate={{ opacity: blocks ? 1 : 0 }} transition={t} style={{ pointerEvents: blocks ? 'auto' : 'none' }}>
        {rows.map((row) => (
          <g key={row.name}>
            <text x={0} y={row.y + Math.min(row.h / 2, 18) + 4} fontSize={12} fill="var(--text)">
              {row.name}
            </text>
            {row.h >= 36 && (
              <text className="num" x={0} y={row.y + 36} fontSize={11} fill="var(--muted)">
                {moneyShort(row.sum)}
              </text>
            )}
          </g>
        ))}
        {cells.map((c, i) => {
          const text = fit(c.r.reason, c.w)
          return c.w <= 0 ? null : (
            <motion.g
              key={c.key}
              initial={false}
              animate={{ opacity: blocks ? (lit(c) ? 1 : DIM) : 0 }}
              transition={{ ...t, delay: tier === 'low' || step !== 2 ? 0 : Math.min(i, 20) * 0.02 }}
            >
              <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={3} fill="var(--chrome)" fillOpacity={0.7}>
                <title>{`${c.r.product}, ${c.r.reason}: ${money(c.r.refund)} (${c.r.count} sent back, ${pct(c.r.share, 1)} of refunds)`}</title>
              </rect>
              {/* the desk block gets its own big label below while it is the focus */}
              {c.w >= 56 && c.h >= 34 && text && (
                <motion.g pointerEvents="none" fill="var(--bg)" initial={false} animate={{ opacity: lit(c) && !(c.r.flag && step >= 3) ? 1 : 0 }} transition={t}>
                  <text x={c.x + 6} y={c.y + 16} fontSize={11} fontWeight={600}>
                    {text}
                  </text>
                  <text className="num" x={c.x + 6} y={c.y + 30} fontSize={11}>
                    {moneyShort(c.r.refund)}
                  </text>
                </motion.g>
              )}
            </motion.g>
          )
        })}

        {/* the desk block: red fill and a large label while the story is on it */}
        <motion.g pointerEvents="none" initial={false} animate={{ opacity: step === 3 || step === 4 ? 1 : 0 }} transition={t}>
          <rect x={flaggedCell.x} y={flaggedCell.y} width={flaggedCell.w} height={flaggedCell.h} rx={3} fill="var(--leak)" />
          <g fill="var(--bg)">
            <text className="num" x={flaggedCell.x + 16} y={flaggedCell.y + 60} fontSize={52} fontWeight={700}>
              {pct(flagged.share)}
            </text>
            <text x={flaggedCell.x + 16} y={flaggedCell.y + 84} fontSize={14} fontWeight={600}>
              of all refunds
            </text>
            <text x={flaggedCell.x + 16} y={flaggedCell.y + flaggedCell.h - 36} fontSize={13} fontWeight={600}>
              {flagged.reason}
            </text>
            <text className="num" x={flaggedCell.x + 16} y={flaggedCell.y + flaggedCell.h - 16} fontSize={12}>
              {flagged.count} sent back · {money(flagged.refund)}
            </text>
          </g>
        </motion.g>

        <Callout
          from={[flaggedCell.x - gutterX, flagMidY + 30]}
          to={[flaggedCell.x, flagMidY]}
          text={step === 4 ? ['Fix packing', 'or carrier'] : ['One desk,', 'one reason']}
          show={step === 3 || step === 4}
          tone={step === 4 ? 'ok' : 'leak'}
          anchor="end"
          fontSize={noteFont}
        />
        <Callout
          from={[overstockCell.x - gutterX, overstockCell.y - 44]}
          to={[overstockCell.x + 14, overstockCell.y]}
          text={['Next biggest:', 'wrong orders']}
          show={step === 5}
          anchor="end"
          fontSize={noteFont}
        />
      </motion.g>
    </svg>
  )
}

export default function Returns() {
  const steps = [
    <>
      <p className="eyebrow">Refunds</p>
      <h3>Refunds are growing fast</h3>
      <p>
        Refunds rose <span className="num leak">{pct(yoy.change.refunds)}</span> this year, while sales grew only{' '}
        <span className="num">{pct(yoy.change.revenue)}</span>. Every refund is money you thought you had.
      </p>
    </>,
    <>
      <p className="eyebrow">One bad quarter</p>
      <h3>Refunds spiked in {qLabel(spike.q)}</h3>
      <p>
        Refunds hit <span className="num leak">{moneyShort(spike.refund)}</span> that quarter. That is about <span className="num">{spikeRatio}x</span> a normal
        quarter.
      </p>
    </>,
    <>
      <p className="eyebrow">Where refunds come from</p>
      <h3>Where the refund money goes</h3>
      <p>Each block is one product and one reason it came back. Bigger block, more money refunded.</p>
    </>,
    <>
      <p className="eyebrow" style={{ color: 'var(--leak)' }}>The big one</p>
      <h3>
        One desk problem: <span className="num leak">{pct(flagged.share)}</span> of refunds
      </h3>
      <p>
        The {flagged.product} keeps arriving damaged. That cost <span className="num">{moneyShort(flagged.refund)}</span> in refunds.
      </p>
    </>,
    <>
      <p className="eyebrow" style={{ color: 'var(--ok)' }}>What to do</p>
      <h3>Fix the packing, not the desk</h3>
      <p>The desks break on the way to the customer. Better packing or a new carrier would cut these refunds.</p>
    </>,
    <>
      <p className="eyebrow">Second biggest reason</p>
      <h3>Wrong orders come second</h3>
      <p>
        Wrong orders cost <span className="num">{moneyShort(overstockTotal)}</span> in refunds. <span className="num">{pct(overstockWho.topSegmentShare)}</span> came from{' '}
        {overstockWho.topSegment.toLowerCase()}s: a restocking fee would curb them.
      </p>
    </>,
  ]

  return (
    <Scrolly id="Returns" steps={steps}>
      {({ step }) => <Graphic step={step} />}
    </Scrolly>
  )
}
