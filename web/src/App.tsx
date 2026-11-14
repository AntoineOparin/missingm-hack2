import { MotionConfig } from 'motion/react'
import { QualityProvider, useQuality } from './lib/quality'
import Hook from './sections/Hook'
import WaterFlow from './sections/WaterFlow'
import Discounts from './sections/Discounts'
import Returns from './sections/Returns'
import Receivables from './sections/Receivables'
import Fix from './sections/Fix'
import Queue from './sections/Queue'
import Cleaning from './sections/Cleaning'

function Story() {
  const { tier } = useQuality()
  return (
    <MotionConfig reducedMotion={tier === 'low' ? 'always' : 'user'}>
      <main>
        <Hook />
        <WaterFlow />
        <Discounts />
        <Returns />
        <Receivables />
        <Fix />
        <Queue />
        <Cleaning />
      </main>
    </MotionConfig>
  )
}

export default function App() {
  return (
    <QualityProvider>
      <Story />
    </QualityProvider>
  )
}
