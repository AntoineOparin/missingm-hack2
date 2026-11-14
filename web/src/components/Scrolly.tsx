import { useRef, useState, type ReactNode } from 'react'
import { useMotionValueEvent, useScroll, type MotionValue } from 'motion/react'

type Props = {
  id: string
  /** One text card per step; each takes one viewport of scroll. */
  steps: ReactNode[]
  /** The pinned graphic. `step` is the active card index, `progress` is 0..1 across the whole section. */
  children: (state: { step: number; progress: MotionValue<number> }) => ReactNode
}

/** Pinned graphic on the right, text cards scrolling past on the left. */
export function Scrolly({ id, steps, children }: Props) {
  const ref = useRef<HTMLElement>(null)
  const [step, setStep] = useState(0)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  useMotionValueEvent(scrollYProgress, 'change', (p) => setStep(Math.min(steps.length - 1, Math.floor(p * steps.length))))

  return (
    <section id={id} ref={ref} className="scrolly">
      <div className="scrolly-graphic">{children({ step, progress: scrollYProgress })}</div>
      <div className="scrolly-steps">
        {steps.map((content, i) => (
          <div key={i} className="scrolly-step" data-active={i === step}>
            <div className="card">{content}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
