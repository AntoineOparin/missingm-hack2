import { useSyncExternalStore } from 'react'
import { motion, type Transition } from 'motion/react'
import { scaleLinear } from 'd3-scale'
import { Callout } from '../components/Callout'
import { Scrolly } from '../components/Scrolly'
import { story } from '../data'
import { money, moneyShort, pct } from '../lib/format'
import { useQuality } from '../lib/quality'

const { returns, yoy } = story
const flagged = returns.find((r) => r.flag)!
const hotspot = story.detections.find((d) => d.id === 'returnHotspot')!
// The threshold lives in the pipeline's rule text, so the card never types it.
const threshold = hotspot.rule.match(/\d+%/)![0]

const W = 600
const H = 400
const DIM = 0.35

// The SVG shrinks to about 60% on phones, so callout notes need a bigger font there.
const narrowQuery = matchMedia('(max-width: 860px)')
const subscribeNarrow = (cb: () => void) => (narrowQuery.addEventListener('change', cb), () => narrowQuery.removeEventListener('change', cb))
const useNarrow = () => useSyncExternalStore(subscribeNarrow, () => narrowQuery.matches)

// Treemap: one row per product, one block per reason, area ∝ refund dollars.
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

/** Reason text that fits a block, or nothing; ~6.3px per character at 11px. */
function fit(text: string, w: number) {
  if (text.length * 6.3 + 12 <= w) return text
  const short = text.split(' ')[0]
  return short.length * 6.3 + 12 <= w ? short : ''
}

function Graphic({ step }: { step: number }) {
  const { tier } = useQuality()
  const narrow = useNarrow()
  const t: Transition = tier === 'low' ? { duration: 0.2 } : { duration: 0.5, ease: [0.23, 1, 0.32, 1] }
  // After the first step only the desk block stays lit; the rest dim and lose their text.
  const lit = (c: Cell) => step === 0 || c.r.flag
  const noteFont = narrow ? 20 : 11
  const flagMidY = flaggedCell.y + flaggedCell.h / 2
  // Notes sit in the empty left gutter; on phones the bigger text needs the arrow start closer to the blocks.
  const gutterX = narrow ? 8 : 34

  const label = [
    `Refunds split into blocks by product and reason. The ${flagged.product} damaged-in-transit block is by far the biggest.`,
    `${flagged.product}, damaged in transit, is ${pct(flagged.share)} of all refunds.`,
    `${flagged.product}, damaged in transit, is ${pct(flagged.share)} of all refunds. Fix the packing or the carrier.`,
    `${flagged.product}, damaged in transit, is caught by the rule: ${hotspot.rule}`,
  ][step]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
      <text x={0} y={16} fontSize={14} fill="var(--muted)">
        What was sent back, and why
      </text>

      {rows.map((row) => (
        <g key={row.name}>
          <text x={0} y={row.y + Math.min(row.h / 2, 18) + 4} fontSize={14} fill="var(--text)">
            {row.name}
          </text>
          {row.h >= 36 && (
            <text className="num" x={0} y={row.y + 36} fontSize={13} fill="var(--muted)">
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
            animate={{ opacity: lit(c) ? 1 : DIM }}
            transition={{ ...t, delay: tier === 'low' || step !== 0 ? 0 : Math.min(i, 20) * 0.02 }}
          >
            <rect x={c.x} y={c.y} width={c.w} height={c.h} fill="var(--chrome)" fillOpacity={0.35}>
              <title>{`${c.r.product}, ${c.r.reason}: ${money(c.r.refund)} (${c.r.count} sent back, ${pct(c.r.share, 1)} of refunds)`}</title>
            </rect>
            {/* the desk block gets its own big label below while it is the focus */}
            {c.w >= 72 && c.h >= 38 && text && (
              <motion.g
                pointerEvents="none"
                fill="var(--text)"
                initial={false}
                animate={{ opacity: lit(c) && !(c.r.flag && step >= 1) ? 1 : 0 }}
                transition={t}
              >
                <text x={c.x + 6} y={c.y + 17} fontSize={13} fontWeight={600}>
                  {text}
                </text>
                <text className="num" x={c.x + 6} y={c.y + 32} fontSize={13}>
                  {moneyShort(c.r.refund)}
                </text>
              </motion.g>
            )}
          </motion.g>
        )
      })}

      {/* the desk block: red fill and a large label while the story is on it */}
      <motion.g pointerEvents="none" initial={false} animate={{ opacity: step >= 1 ? 1 : 0 }} transition={t}>
        <rect x={flaggedCell.x} y={flaggedCell.y} width={flaggedCell.w} height={flaggedCell.h} fill="var(--leak)" />
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
        text={step === 2 ? ['Fix packing', 'or carrier'] : step === 3 ? ['The rule', 'flags this'] : ['One desk,', 'one reason']}
        show={step >= 1}
        tone={step === 2 ? 'ok' : 'leak'}
        anchor="end"
        fontSize={noteFont}
      />
    </svg>
  )
}

export default function Returns() {
  const steps = [
    <>
      <h3>Where the refund money goes</h3>
      <p>
        Refunds grew <span className="num leak">{pct(yoy.change.refunds)}</span> this year, sales only <span className="num">{pct(yoy.change.revenue)}</span>.
        Each block is one product and one reason it came back.
      </p>
    </>,
    <>
      <h3>
        One desk problem: <span className="num leak">{pct(flagged.share)}</span> of refunds
      </h3>
      <p>
        The {flagged.product} keeps arriving damaged. That cost <span className="num">{moneyShort(flagged.refund)}</span> in refunds.
      </p>
    </>,
    <>
      <h3>Fix the packing, not the desk</h3>
      <p>The desks break on the way to the customer. Better packing or a new carrier would cut these refunds.</p>
    </>,
    <>
      <h3>A rule that catches it</h3>
      <p>
        Flag any product and reason behind more than <span className="num">{threshold}</span> of all refunds. It went off{' '}
        {hotspot.hits === 1 ? (
          'once'
        ) : (
          <>
            <span className="num">{hotspot.hits}</span> times
          </>
        )}
        : this desk.
      </p>
    </>,
  ]

  return (
    <Scrolly id="Returns" title="Refunds" steps={steps}>
      {({ step }) => <Graphic step={step} />}
    </Scrolly>
  )
}
