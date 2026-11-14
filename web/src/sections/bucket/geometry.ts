import { story } from '../../data'

/**
 * One world, two renderers. World units = SVG viewBox units, origin at the bucket's base centre.
 * The SVG draws the same orthographic three-quarter projection the 3D camera uses, so the shared
 * HTML labels land on the same spots in both versions.
 */
// Tall enough that the pipe top and the faded stream ends keep a ~16-unit margin inside the frame.
export const VB = { w: 640, h: 590 }
export const PITCH = (20 * Math.PI) / 180
const COS = Math.cos(PITCH)
const SIN = Math.sin(PITCH)
export const ORIGIN = { x: 320, y: 433 } // where the base centre sits in the viewBox
export const R = 120 // bucket radius
export const H = 240 // bucket height
export const RIM_RY = R * SIN // a horizontal circle seen from above becomes an ellipse this tall
export const PIPE_Y = 390 // world height of the inflow pipe mouth
export const PIPE_H = 30 // world height of the pipe itself
export const HOLE_Y = 30 // world height of the two leak holes
export const DRAIN_Y = -149 // streams end here, hidden under the bottom fade, inside the frame
const MAX_STREAM = 110

export type V3 = [number, number, number]
/** World point -> viewBox point. Same maths as the 3D camera (orthographic, tilted down by PITCH). */
export const project = ([x, y, z]: V3): [number, number] => [ORIGIN.x + x, ORIGIN.y - (y * COS - z * SIN)]
export const vy = (y: number) => project([0, y, 0])[1]

export const { 2025: y25, 2026: y26, change } = story.yoy
export const cogsChange = y26.cogs / y25.cogs - 1
/** Profit after refunds had it grown as fast as revenue. */
export const paceProfit = y25.profitAfterRefunds * (1 + change.revenue)
export const paceGap = paceProfit - y26.profitAfterRefunds

// shortcut: widths are scaled to the 2026 inflow, assumes 2026 is the larger year; rescale if a year shrinks
const widthPerDollar = MAX_STREAM / Math.max(y25.gross, y26.gross)
const levelPerDollar = H / (Math.max(paceProfit, y25.profitAfterRefunds, y26.profitAfterRefunds) * 1.2)

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** Stream diameter and water height at blend t (0 = 2025, 1 = 2026). */
export function shape(t: number) {
  const v = (k: 'gross' | 'discounts' | 'cogs' | 'refunds' | 'profitAfterRefunds') => lerp(y25[k], y26[k], t)
  return {
    inflow: v('gross') * widthPerDollar,
    discounts: v('discounts') * widthPerDollar,
    cogs: v('cogs') * widthPerDollar,
    refunds: v('refunds') * widthPerDollar,
    level: v('profitAfterRefunds') * levelPerDollar,
  }
}
export const levelOf = (profit: number) => profit * levelPerDollar
export const maxInflow = MAX_STREAM

/** Leak streams as cubic Béziers in world space: out of the side wall, arcing down off screen. */
const side = (s: 1 | -1): [V3, V3, V3, V3] => [
  [s * R, HOLE_Y, 0],
  [s * (R + 60), HOLE_Y, 0],
  [s * (R + 100), HOLE_Y - 40, 0],
  [s * (R + 110), DRAIN_Y, 0],
]
export const leakCurves = { discounts: side(-1), refunds: side(1) }
/** An orthographic projection is affine, so a projected Bézier is the Bézier of the projected points. */
export const bezierPath = (pts: [V3, V3, V3, V3]) => {
  const [a, b, c, d] = pts.map(project)
  return `M${a} C${b} ${c} ${d}`
}
