import { motion } from 'motion/react'
import { useQuality } from '../lib/quality'

type Point = [number, number]
type Props = {
  /** Where the note sits (SVG user units). The arrow starts here. */
  from: Point
  /** The mark to point at. The arrow tip lands here. */
  to: Point
  /** Short note, 6 words or fewer per line. */
  text: string | string[]
  show: boolean
  tone?: 'text' | 'leak' | 'ok' | 'oak'
  /** How much the arrow curves: 0 is straight, negative bends the other way. */
  bend?: number
  fontSize?: number
  anchor?: 'start' | 'middle' | 'end'
}

/**
 * Hand-drawn style arrow with a short note, for use inside an <svg>.
 * Pattern: show the whole chart first, then switch a Callout on to say where to look.
 */
export function Callout({ from, to, text, show, tone = 'text', bend = 0.25, fontSize = 14, anchor }: Props) {
  const { tier } = useQuality()
  const [x1, y1] = from
  const [x2, y2] = to
  const dx = x2 - x1
  const dy = y2 - y1
  // Control point: midpoint pushed sideways, so the arrow curves.
  const cx = (x1 + x2) / 2 - dy * bend
  const cy = (y1 + y2) / 2 + dx * bend
  // Stop a little short so the tip does not cover the mark.
  const len = Math.hypot(x2 - cx, y2 - cy) || 1
  const tx = x2 - ((x2 - cx) / len) * 6
  const ty = y2 - ((y2 - cy) / len) * 6
  const a = Math.atan2(ty - cy, tx - cx)
  const head = (da: number) => `M${tx} ${ty} L${tx - 9 * Math.cos(a + da)} ${ty - 9 * Math.sin(a + da)}`
  const lines = Array.isArray(text) ? text : [text]
  const mostlyVertical = Math.abs(dy) > Math.abs(dx) * 1.5
  const textAnchor = anchor ?? (mostlyVertical ? 'middle' : dx >= 0 ? 'end' : 'start')
  // Put the note on the far side of the arrow start.
  const textX = textAnchor === 'middle' ? x1 : x1 + (dx >= 0 ? -6 : 6)
  const below = mostlyVertical && dy < 0
  const textY = mostlyVertical
    ? below
      ? y1 + fontSize + 4
      : y1 - 6 - (lines.length - 1) * fontSize * 1.2
    : y1 - ((lines.length - 1) * fontSize * 1.2) / 2 + fontSize * 0.35
  const t = tier === 'low' ? { duration: 0 } : { duration: 0.45, ease: 'easeOut' as const }

  return (
    <motion.g
      className="callout"
      data-tone={tone}
      initial={false}
      animate={{ opacity: show ? 1 : 0 }}
      transition={t}
      aria-hidden={!show}
      style={{ pointerEvents: 'none' }}
    >
      <motion.path d={`M${x1} ${y1} Q${cx} ${cy} ${tx} ${ty}`} initial={false} animate={{ pathLength: show ? 1 : 0 }} transition={t} />
      <path d={`${head(0.45)} ${head(-0.45)}`} />
      <text x={textX} y={textY} textAnchor={textAnchor} fontSize={fontSize}>
        {lines.map((line, i) => (
          <tspan key={i} x={textX} dy={i === 0 ? 0 : fontSize * 1.2}>
            {line}
          </tspan>
        ))}
      </text>
    </motion.g>
  )
}
