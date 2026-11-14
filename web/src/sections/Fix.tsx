import { useState } from 'react'
import { motion } from 'motion/react'
import { story } from '../data'
import { money, moneyShort, signedPct } from '../lib/format'
import './Fix.css'

const { yoy, scenarios } = story
const last = yoy['2025'].profitAfterRefunds
const base = yoy['2026'].profitAfterRefunds
// What 2026 profit would have been had it grown as fast as revenue.
const target = last * (1 + yoy.change.revenue)
const profitLevers = scenarios.filter((s) => s.kind === 'profit')
const cashLevers = scenarios.filter((s) => s.kind === 'cash')
const allOn = base + profitLevers.reduce((sum, s) => sum + s.recovered, 0)

// Water-level bar geometry (viewBox units).
const W = 400
const TOP = 16
const BOTTOM = 344
const BAR_X = 165
const BAR_W = 70
const max = Math.max(allOn, target) * 1.06
const y = (v: number) => BOTTOM - (v / max) * (BOTTOM - TOP)

export default function Fix() {
  const [on, setOn] = useState<Record<string, boolean>>({})
  const toggle = (id: string) => setOn((o) => ({ ...o, [id]: !o[id] }))

  const added = profitLevers.reduce((sum, s) => sum + (on[s.id] ? s.recovered : 0), 0)
  const cash = cashLevers.reduce((sum, s) => sum + (on[s.id] ? s.recovered : 0), 0)
  const profit = base + added
  const growth = profit / last - 1
  const catchesUp = growth >= yoy.change.revenue

  const lever = (s: (typeof scenarios)[number]) => (
    <button key={s.id} type="button" role="switch" aria-checked={!!on[s.id]} className="fix-toggle" onClick={() => toggle(s.id)}>
      <span className="fix-switch" aria-hidden="true" />
      <span className="fix-toggle-text">
        <span className="fix-toggle-label">{s.label}</span>
        <span className="fix-toggle-note muted">{s.assumption}</span>
      </span>
      <span className="num fix-toggle-amount">+{moneyShort(s.recovered)}</span>
    </button>
  )

  return (
    <section id="Fix" className="fix">
      <header className="fix-head">
        <p className="eyebrow">What to do</p>
        <h2>Three fixes, priced in dollars</h2>
        <p className="muted">Switch each fix on. The first two add to profit. The third brings in cash once.</p>
      </header>

      <div className="fix-grid">
        <div className="fix-levers">
          <p className="fix-group">Adds profit</p>
          {profitLevers.map(lever)}
          <p className="fix-group">Brings in cash once</p>
          {cashLevers.map(lever)}
          <div className="card fix-readout" aria-live="polite">
            <div>
              <p className="fix-stat-name">Sales growth</p>
              <p className="num fix-stat">{signedPct(yoy.change.revenue)}</p>
            </div>
            <div>
              <p className="fix-stat-name">Profit growth</p>
              <p className={`num fix-stat ${added > 0 ? 'ok' : 'leak'}`}>{signedPct(growth)}</p>
              {added > 0 && <p className="muted fix-was">was {signedPct(yoy.change.profitAfterRefunds)}</p>}
            </div>
            <div>
              <p className="fix-stat-name">Cash in, once</p>
              <p className={`num fix-stat ${cash > 0 ? 'ok' : 'muted'}`}>{moneyShort(cash)}</p>
            </div>
            <p className="fix-verdict">
              {catchesUp
                ? 'Now profit grows as fast as sales.'
                : added > 0
                  ? 'Closer, but profit still grows slower than sales.'
                  : 'Profit grows slower than sales. Switch on a fix.'}
            </p>
          </div>
        </div>

        <div className="card fix-panel">
          <svg
            viewBox={`0 0 ${W} ${BOTTOM + 16}`}
            role="img"
            aria-label={`Profit: ${money(base)} this year, ${money(profit)} with the fixes you picked. If profit had kept up with sales it would be ${money(target)}.`}
          >
            <rect x={BAR_X} y={TOP} width={BAR_W} height={BOTTOM - TOP} rx={6} className="fix-tank" />
            <motion.rect
              x={BAR_X}
              width={BAR_W}
              className="fix-recovered"
              initial={false}
              // y/height attributes, not scaleY: Motion overrides transform-origin on SVG, which centred the block
              animate={{ attrY: y(profit), height: BOTTOM - y(profit) }}
              transition={{ type: 'spring', duration: 0.5, bounce: 0 }}
            />
            <rect x={BAR_X} y={y(base)} width={BAR_W} height={BOTTOM - y(base)} className="fix-base" />
            <line x1={BAR_X} x2={BAR_X + BAR_W} y1={y(base)} y2={y(base)} className="fix-gap" />

            <line x1={BAR_X - 12} x2={BAR_X + BAR_W} y1={y(last)} y2={y(last)} className="fix-ref" />
            <line x1={BAR_X - 12} x2={BAR_X + BAR_W} y1={y(target)} y2={y(target)} className="fix-ref fix-ref-target" />
            <Label x={BAR_X - 18} y={y(last)} anchor="end" name="2025" value={money(last)} />
            <Label x={BAR_X - 18} y={y(target)} anchor="end" name="Kept up with sales" value={money(target)} />
            <Label x={BAR_X + BAR_W + 14} y={y(base)} anchor="start" name="This year" value={money(base)} />
            {added > 0 && <Label x={BAR_X + BAR_W + 14} y={y(profit)} anchor="start" name="With fixes" value={money(profit)} />}
          </svg>
        </div>
      </div>
    </section>
  )
}

function Label({ x, y, anchor, name, value }: { x: number; y: number; anchor: 'start' | 'end'; name: string; value: string }) {
  return (
    <text x={x} y={y} textAnchor={anchor} className="fix-label">
      <tspan x={x} dy="-0.2em">
        {name}
      </tspan>
      <tspan x={x} dy="1.15em" className="num fix-label-value">
        {value}
      </tspan>
    </text>
  )
}
