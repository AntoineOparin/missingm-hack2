import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { useMotionValueEvent, type MotionValue } from 'motion/react'
import * as THREE from 'three'
import { useQuality } from '../../lib/quality'
import { DRAIN_Y, H, HOLE_Y, leakCurves, maxInflow, ORIGIN, PIPE_H, PIPE_Y, PITCH, R, shape, VB, type V3 } from './geometry'

/**
 * The same bucket as the SVG, in 3D. Orthographic camera at the SVG's exact projection: a fixed
 * three-quarter view with no perspective, so hole and stream widths stay comparable, and the shared
 * HTML labels sit on the right spots. No controls.
 */
export default function Bucket3D({ t, step, active }: { t: MotionValue<number>; step: number; active: boolean }) {
  const { downgrade } = useQuality()
  const [maxDpr, setMaxDpr] = useState(1.5)
  return (
    <Canvas
      orthographic
      flat
      camera={{ manual: true, near: 1, far: 3000 }}
      dpr={[1, maxDpr]}
      // Continuous while on screen (glints flow, and PerformanceMonitor needs real frames); fully stopped off screen.
      frameloop={active ? 'always' : 'never'}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {/* Sustained drop: first lower resolution, then fall back to the 2D bucket. */}
      <PerformanceMonitor onDecline={() => (maxDpr > 1 ? setMaxDpr(1) : downgrade())} />
      <Rig />
      <Scene t={t} step={step} />
    </Canvas>
  )
}

/** Fit the viewBox inside the canvas ("meet"), pitched down by PITCH, origin at the base centre. */
function Rig() {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera
  const size = useThree((s) => s.size)
  useLayoutEffect(() => {
    const a = size.width / size.height
    const fitWidth = a < VB.w / VB.h
    const w = fitWidth ? VB.w : VB.h * a
    const h = fitWidth ? VB.w / a : VB.h
    const cx = VB.w / 2 - ORIGIN.x
    const cy = ORIGIN.y - VB.h / 2
    Object.assign(camera, { left: cx - w / 2, right: cx + w / 2, top: cy + h / 2, bottom: cy - h / 2, zoom: 1 })
    camera.position.set(0, 1000 * Math.sin(PITCH), 1000 * Math.cos(PITCH))
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera, size])
  return null
}

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
const curve = ([a, b, c, d]: V3[]) => new THREE.CubicBezierCurve3(...[a, b, c, d].map((p) => new THREE.Vector3(...p)) as [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3])
const LEAKS = { discounts: curve(leakCurves.discounts), refunds: curve(leakCurves.refunds) }
const TOWARD_CAMERA = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH))
const GLINTS_PER_STREAM = 8

function Scene({ t, step }: { t: MotionValue<number>; step: number }) {
  // Scroll blend, quantised so tube geometry rebuilds at most ~40 times across the transition.
  const [blend, setBlend] = useState(() => t.get())
  useMotionValueEvent(t, 'change', (v) => setBlend(Math.round(v * 40) / 40))
  const s = shape(blend)
  const r = { inflow: s.inflow / 2, discounts: s.discounts / 2, refunds: s.refunds / 2, cogs: s.cogs / 2 }
  const c = useMemo(() => ({ oak: token('--oak'), chrome: token('--chrome'), leak: token('--leak'), text: token('--text'), bg: token('--bg') }), [])
  // Same emphasis as the SVG (Bucket.css): step 0 shows everything, later steps dim all but the card's subject.
  const focus = [null, 'inflow', 'leak', 'kept'][step]
  const fade = (part: 'inflow' | 'cogs' | 'leak' | 'kept') => (focus && part !== focus ? 0.35 : 1)

  return (
    <>
      <ambientLight intensity={1.1} />
      <directionalLight position={[-300, 600, 500]} intensity={1.8} />

      {/* pipe */}
      <mesh position={[0, PIPE_Y + PIPE_H / 2, 0]}>
        <cylinderGeometry args={[maxInflow / 2 + 10, maxInflow / 2 + 10, PIPE_H, 48]} />
        <meshStandardMaterial color={c.chrome} metalness={0.5} roughness={0.35} />
      </mesh>

      {/* inflow: unit cylinder scaled, so scroll never rebuilds it */}
      <mesh position={[0, (PIPE_Y + s.level) / 2, 0]} scale={[r.inflow, PIPE_Y - s.level, r.inflow]}>
        <cylinderGeometry args={[1, 1, 1, 32, 1, true]} />
        <meshStandardMaterial color={c.oak} roughness={0.3} transparent opacity={fade('inflow')} />
      </mesh>

      {/* splash where the pour meets the surface */}
      <mesh position={[0, s.level + 0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[r.inflow + 6, 40]} />
        <meshBasicMaterial color={c.text} transparent opacity={0.25 * fade('inflow')} />
      </mesh>

      {/* water: what stays */}
      <mesh position={[0, s.level / 2, 0]} scale={[1, s.level, 1]}>
        <cylinderGeometry args={[R - 3, R - 3, 1, 64]} />
        <meshStandardMaterial color={c.oak} roughness={0.35} transparent opacity={fade('kept')} />
      </mesh>

      {/* cost of goods drain */}
      <mesh position={[0, DRAIN_Y / 2, 0]} scale={[r.cogs, -DRAIN_Y, r.cogs]}>
        <cylinderGeometry args={[1, 1, 1, 32, 1, true]} />
        <meshStandardMaterial color={c.chrome} roughness={0.5} transparent opacity={0.55 * fade('cogs')} />
      </mesh>

      {/* leaks: tube along the shared curve, plus a ring for the hole */}
      {(['discounts', 'refunds'] as const).map((k) => (
        <group key={k}>
          <mesh>
            <tubeGeometry args={[LEAKS[k], 48, r[k], 16, false]} />
            <meshStandardMaterial color={c.leak} roughness={0.35} transparent opacity={fade('leak')} />
          </mesh>
          <mesh position={[k === 'discounts' ? -R : R, HOLE_Y, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[r[k] + 1.5, 1.8, 8, 40]} />
            <meshBasicMaterial color={c.bg} />
          </mesh>
        </group>
      ))}

      {/* glass */}
      <mesh position={[0, H / 2, 0]} renderOrder={2}>
        <cylinderGeometry args={[R, R, H, 64, 1, true]} />
        <meshPhysicalMaterial color={c.chrome} roughness={0.08} metalness={0.1} transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {[H, 0].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[R, y ? 2.5 : 1.5, 12, 96]} />
          <meshStandardMaterial color={c.chrome} metalness={0.6} roughness={0.3} />
        </mesh>
      ))}

      <Glints r={r} level={s.level} color={c.text} opacity={step >= 2 ? 0.25 : 0.55} />
    </>
  )
}

/** A few bright specks riding the front of each stream, so the direction of flow reads. One draw call. */
type GlintProps = { r: Record<'inflow' | 'discounts' | 'refunds' | 'cogs', number>; level: number; color: string; opacity: number }
function Glints({ r, level, color, opacity }: GlintProps) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const tmp = useMemo(() => ({ o: new THREE.Object3D(), p: new THREE.Vector3() }), [])
  const phase = useRef(0)

  useFrame((_, delta) => {
    const mesh = ref.current
    if (!mesh) return
    phase.current = (phase.current + delta * 0.45) % 1
    // useFrame always calls the latest closure, so r and level are current
    const streams: [number, (u: number, out: THREE.Vector3) => THREE.Vector3][] = [
      [r.inflow, (u, out) => out.set(0, PIPE_Y - u * (PIPE_Y - level), 0)],
      [r.cogs, (u, out) => out.set(0, u * DRAIN_Y, 0)],
      [r.discounts, (u, out) => LEAKS.discounts.getPoint(u, out)],
      [r.refunds, (u, out) => LEAKS.refunds.getPoint(u, out)],
    ]
    streams.forEach(([radius, at], k) => {
      for (let i = 0; i < GLINTS_PER_STREAM; i++) {
        const u = (i / GLINTS_PER_STREAM + phase.current) % 1
        at(u, tmp.p).addScaledVector(TOWARD_CAMERA, radius + 0.5)
        tmp.o.position.copy(tmp.p)
        tmp.o.scale.setScalar(THREE.MathUtils.clamp(radius * 0.25, 1.2, 4))
        tmp.o.updateMatrix()
        mesh.setMatrixAt(k * GLINTS_PER_STREAM + i, tmp.o.matrix)
      }
    })
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, 4 * GLINTS_PER_STREAM]} frustumCulled={false}>
      <sphereGeometry args={[1, 8, 6]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} />
    </instancedMesh>
  )
}
