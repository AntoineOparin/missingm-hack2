import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

/** low: no continuous animation. mid: full 2D motion. high: mid + 3D scenes. */
export type Tier = 'low' | 'mid' | 'high'
const TIERS: Tier[] = ['low', 'mid', 'high']

function override(): Tier | null {
  const q = new URLSearchParams(location.search).get('quality') as Tier | null
  return q && TIERS.includes(q) ? q : null
}

function hasWebGL() {
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

function initial(): Tier {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 'low'
  if ((navigator.hardwareConcurrency ?? 8) <= 4) return 'low'
  return 'mid'
}

const QualityContext = createContext<{ tier: Tier; downgrade: () => void }>({ tier: 'mid', downgrade: () => {} })

export function QualityProvider({ children }: { children: ReactNode }) {
  const [tier, setTier] = useState<Tier>(() => override() ?? initial())

  // Probe real frame times for ~1s; hardware hints alone are unreliable.
  useEffect(() => {
    if (override() || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frames = 0
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      frames++
      if (now - start < 1000) return void (raf = requestAnimationFrame(tick))
      const fps = frames / ((now - start) / 1000)
      // thresholds are starting guesses: tune on the demo machine
      setTier(fps < 30 ? 'low' : fps >= 55 && hasWebGL() && (navigator.hardwareConcurrency ?? 8) > 4 ? 'high' : 'mid')
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => void (document.documentElement.dataset.quality = tier), [tier])

  const downgrade = () => setTier((t) => TIERS[Math.max(0, TIERS.indexOf(t) - 1)])
  return <QualityContext.Provider value={{ tier, downgrade }}>{children}</QualityContext.Provider>
}

/** `tier` picks what to render; call `downgrade()` if a heavy scene drops frames. */
export const useQuality = () => useContext(QualityContext)
