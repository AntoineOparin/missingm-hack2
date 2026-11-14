/** A small inked arrow in the Callout's stroke, sized to the text beside it. Decorative: the text carries the meaning. */
const ROTATE = { right: 0, down: 90, left: 180, up: 270 } as const

export function Arrow({ dir = 'right' }: { dir?: keyof typeof ROTATE }) {
  return (
    <svg className="arrow" viewBox="0 0 16 16" aria-hidden="true" style={{ rotate: `${ROTATE[dir]}deg` }}>
      <path d="M2 8.5 Q8 7.5 13.5 8 M9.5 4.5 L13.5 8 L9.5 11.5" />
    </svg>
  )
}

/** The same arrow inside a chart's SVG, drawn at (x, y) in that chart's viewBox units. */
export function SvgArrow({ x, y, size = 12 }: { x: number; y: number; size?: number }) {
  const s = size / 16
  return (
    <path
      className="arrow-path"
      transform={`translate(${x} ${y - size / 2}) scale(${s})`}
      d="M2 8.5 Q8 7.5 13.5 8 M9.5 4.5 L13.5 8 L9.5 11.5"
      aria-hidden="true"
    />
  )
}
