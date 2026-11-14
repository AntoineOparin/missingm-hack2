import { useEffect, useSyncExternalStore } from 'react'
import { MotionConfig } from 'motion/react'
import { QualityProvider, useQuality } from './lib/quality'
import { queue } from './data'
import { moneyShort } from './lib/format'
import Hook from './sections/Hook'
import WaterFlow from './sections/WaterFlow'
import Discounts from './sections/Discounts'
import Returns from './sections/Returns'
import Receivables from './sections/Receivables'
import Fix from './sections/Fix'
import Queue from './sections/Queue'
import Cleaning from './sections/Cleaning'

// Two pages, switched by the URL hash so it works on any static host with no router:
// the story at "/", the chase-list tool at "/#/tool".
const TOOL = '#/tool'
const onHashChange = (cb: () => void) => {
  addEventListener('hashchange', cb)
  return () => removeEventListener('hashchange', cb)
}
const useHash = () => useSyncExternalStore(onHashChange, () => location.hash)

function ToolLink() {
  const pastDue = queue.filter((q) => q.daysOverdue > 0).reduce((sum, q) => sum + q.amount, 0)
  return (
    <section id="Tool-link" className="tool-link">
      <p className="eyebrow">The part that runs every week</p>
      <h2>Stop chasing bills by hand.</h2>
      <p className="muted">
        The tool lists the <span className="num">{queue.length}</span> bills to chase this week, biggest risk first, with an email ready to send for each.{' '}
        <span className="num">{moneyShort(pastDue)}</span> is already past due.
      </p>
      <a className="button" href={TOOL} target="_blank" rel="noopener">
        Open the chase list ↗
      </a>
    </section>
  )
}

function Pages() {
  const { tier } = useQuality()
  const hash = useHash()
  const tool = hash === TOOL

  // Top of the tool page; coming back, return to where the story left off.
  useEffect(() => {
    if (tool) scrollTo(0, 0)
    else if (hash.length > 1) document.getElementById(hash.slice(1))?.scrollIntoView()
  }, [tool, hash])

  return (
    <MotionConfig reducedMotion={tier === 'low' ? 'always' : 'user'}>
      {tool ? (
        <main>
          <nav className="tool-nav">
            <a href="#Tool-link">← Back to the story</a>
          </nav>
          <Queue />
        </main>
      ) : (
        <main>
          <Hook />
          <WaterFlow />
          <Discounts />
          <Returns />
          <Receivables />
          <Fix />
          <ToolLink />
          <Cleaning />
        </main>
      )}
    </MotionConfig>
  )
}

export default function App() {
  return (
    <QualityProvider>
      <Pages />
    </QualityProvider>
  )
}
