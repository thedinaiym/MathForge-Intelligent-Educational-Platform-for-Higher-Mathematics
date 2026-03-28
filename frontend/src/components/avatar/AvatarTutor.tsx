/**
 * AvatarTutor.tsx — Phase 20
 *
 * 3D Anime Avatar (VRM) with real-time Web Audio API lip-sync.
 *
 * ── Quick start ──────────────────────────────────────────────────────────────
 * 1. Drop any VRM file into /frontend/public/tutor.vrm
 *    (free models: https://hub.vroid.com  or  https://3d.nicovideo.jp)
 * 2. Install deps:
 *    npm install three@^0.169 @react-three/fiber@^9 @react-three/drei@^10 @pixiv/three-vrm@^3
 *    npm install -D @types/three
 * 3. Use in any page:
 *    <AvatarTutor audioUrl={blobUrl} />
 *
 * ── Audio URL ────────────────────────────────────────────────────────────────
 * Call the TTS microservice, create a blob URL, pass it here:
 *
 *   const res  = await fetch('http://localhost:8001/api/tts/generate', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ text, language: 'ru', voice_type: 'female' }),
 *   })
 *   const blob = await res.blob()
 *   const url  = URL.createObjectURL(blob)
 *   setAudioUrl(url)
 *   // remember to call URL.revokeObjectURL(url) when done
 *
 * ── VRM compatibility ─────────────────────────────────────────────────────────
 * Supports VRM 0.x (blendShapeProxy) and VRM 1.0 (expressionManager).
 * The mouth blendshape is 'A' (VRM 0.x) / 'aa' (VRM 1.0).
 */
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  VRM,
  VRMExpressionPresetName,
  VRMHumanBoneName,
  VRMLoaderPlugin,
  VRMUtils,
} from '@pixiv/three-vrm'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AvatarTutorProps {
  /** Blob URL (or any audio URL) pointing to the TTS audio to play and lip-sync. */
  audioUrl?: string | null
  /** Path to the VRM model inside /public. Default: /tutor.vrm */
  modelPath?: string
  /** Canvas height. Default: 480 */
  height?: number | string
  /** Called when speech audio finishes playing. */
  onSpeechEnd?: () => void
  /** Called after the VRM model has loaded successfully. */
  onModelReady?: () => void
}

// ── Constants ─────────────────────────────────────────────────────────────────

const VRM_PATH = '/tutor.vrm'

// Camera frames the head-to-chest area of a standard VRM avatar.
// VRM origin is at feet; head is at ~1.55 m.
const CAM_POSITION = new THREE.Vector3(0, 1.45, 2.1)
const CAM_TARGET   = new THREE.Vector3(0, 1.45, 0)

// ── Root exported component ───────────────────────────────────────────────────

export default function AvatarTutor({
  audioUrl,
  modelPath = VRM_PATH,
  height = 480,
  onSpeechEnd,
  onModelReady,
}: AvatarTutorProps) {
  const [loadError, setLoadError] = useState<string | null>(null)

  return (
    <div
      style={{ width: '100%', height, position: 'relative' }}
      className="rounded-2xl overflow-hidden bg-gradient-to-b from-slate-900 to-slate-800"
    >
      {loadError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 z-10 pointer-events-none">
          <span className="text-3xl">🤖</span>
          <p className="text-sm">{loadError}</p>
          <p className="text-xs text-slate-500">Place tutor.vrm in /public</p>
        </div>
      )}

      <Canvas
        camera={{
          position: CAM_POSITION.toArray() as [number, number, number],
          fov: 30,
          near: 0.1,
          far: 20,
        }}
        gl={{
          antialias: true,
          alpha: true,
          outputColorSpace: THREE.SRGBColorSpace,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.1,
        }}
        dpr={[1, 2]}
        style={{ background: 'transparent' }}
      >
        {/* ── Lighting ── */}
        <SceneLighting />

        {/* ── VRM Avatar with lip-sync ── */}
        <Suspense fallback={<LoadingSpinner />}>
          <VRMAvatar
            modelPath={modelPath}
            audioUrl={audioUrl ?? null}
            onSpeechEnd={onSpeechEnd}
            onModelReady={onModelReady}
            onLoadError={setLoadError}
          />
        </Suspense>
      </Canvas>
    </div>
  )
}

// ── Scene lighting ────────────────────────────────────────────────────────────

function SceneLighting() {
  return (
    <>
      {/* Warm ambient fill */}
      <ambientLight intensity={0.55} color="#fef3e2" />
      {/* Key light — front-left, warm */}
      <directionalLight
        position={[1.5, 3, 2.5]}
        intensity={1.4}
        color="#fff8f0"
        castShadow
      />
      {/* Rim / back light — cool blue for anime depth */}
      <directionalLight
        position={[-2, 1.5, -2]}
        intensity={0.4}
        color="#9bbeff"
      />
      {/* Subtle fill from below (prevents totally black shadows) */}
      <directionalLight
        position={[0, -1, 1]}
        intensity={0.15}
        color="#ffffff"
      />
    </>
  )
}

// ── Suspense loading spinner (rendered inside Canvas via Html) ────────────────

function LoadingSpinner() {
  return (
    <Html center>
      <div className="flex flex-col items-center gap-2">
        <div className="w-8 h-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
        <span className="text-xs text-slate-300 whitespace-nowrap">Loading avatar…</span>
      </div>
    </Html>
  )
}

// ── VRM Avatar — loads model, drives lip-sync and idle animations ─────────────

interface VRMAvatarProps {
  modelPath: string
  audioUrl: string | null
  onSpeechEnd?: () => void
  onModelReady?: () => void
  onLoadError?: (msg: string) => void
}

function VRMAvatar({
  modelPath,
  audioUrl,
  onSpeechEnd,
  onModelReady,
  onLoadError,
}: VRMAvatarProps) {
  // ── VRM state ─────────────────────────────────────────────────────────────
  const [vrm, setVrm] = useState<VRM | null>(null)
  const vrmRef = useRef<VRM | null>(null)

  // ── Audio / lip-sync state ────────────────────────────────────────────────
  const audioCtxRef   = useRef<AudioContext | null>(null)
  const analyserRef   = useRef<AnalyserNode | null>(null)
  const sourceRef     = useRef<AudioBufferSourceNode | null>(null)
  const freqDataRef   = useRef<Uint8Array | null>(null)
  const isSpeakingRef = useRef(false)

  // ── Smoothed mouth value for lerping ─────────────────────────────────────
  const mouthValueRef = useRef(0)

  // ── Idle animation timers ─────────────────────────────────────────────────
  const nextBlinkRef   = useRef(Date.now() + _randomBlinkDelay())
  const isBlinkingRef  = useRef(false)

  // ── Load VRM ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))

    loader.load(
      modelPath,
      (gltf) => {
        if (cancelled) return

        const loadedVrm: VRM | undefined = gltf.userData.vrm
        if (!loadedVrm) {
          onLoadError?.('Loaded file is not a VRM model.')
          return
        }

        // VRM 0.x models face -Z; rotate so they face the camera (+Z)
        VRMUtils.rotateVRM0(loadedVrm)

        vrmRef.current = loadedVrm
        setVrm(loadedVrm)
        onModelReady?.()
      },
      undefined,
      (err) => {
        if (!cancelled) {
          console.error('[AvatarTutor] VRM load error:', err)
          onLoadError?.(`Could not load ${modelPath}`)
        }
      },
    )

    return () => {
      cancelled = true
      // Dispose geometry / materials to prevent WebGL memory leaks
      if (vrmRef.current) {
        VRMUtils.deepDispose(vrmRef.current.scene)
        vrmRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelPath])

  // ── Play audio + set up analyser whenever audioUrl changes ────────────────
  const playAudio = useCallback(async (url: string) => {
    // Stop previous audio
    _stopSource(sourceRef)
    isSpeakingRef.current = false

    if (!url) return

    try {
      // Create / resume AudioContext (browser autoplay policy requires a user gesture
      // before the first AudioContext.resume(); the button click that triggers TTS counts)
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext()
      }
      const ctx = audioCtxRef.current
      if (ctx.state === 'suspended') await ctx.resume()

      // Fetch & decode audio
      const response   = await fetch(url)
      const arrayBuf   = await response.arrayBuffer()
      const audioBuf   = await ctx.decodeAudioData(arrayBuf)

      // Analyser for lip-sync frequency data
      const analyser = ctx.createAnalyser()
      analyser.fftSize        = 512    // 256 frequency bins
      analyser.smoothingTimeConstant = 0.7
      analyserRef.current  = analyser
      freqDataRef.current  = new Uint8Array(analyser.frequencyBinCount)

      // Source → Analyser → Destination (speakers)
      const source   = ctx.createBufferSource()
      source.buffer  = audioBuf
      source.connect(analyser)
      analyser.connect(ctx.destination)

      source.onended = () => {
        isSpeakingRef.current = false
        onSpeechEnd?.()
      }

      source.start(0)
      sourceRef.current    = source
      isSpeakingRef.current = true

    } catch (err) {
      console.error('[AvatarTutor] Audio play error:', err)
    }
  }, [onSpeechEnd])

  useEffect(() => {
    if (audioUrl) {
      playAudio(audioUrl)
    } else {
      _stopSource(sourceRef)
      isSpeakingRef.current = false
    }
    // Cleanup when component unmounts or audioUrl changes again
    return () => { _stopSource(sourceRef) }
  }, [audioUrl, playAudio])

  // ── Cleanup AudioContext on unmount ───────────────────────────────────────
  useEffect(() => {
    return () => {
      audioCtxRef.current?.close()
    }
  }, [])

  // ── useFrame — animation loop (lip-sync + idle) ───────────────────────────
  useFrame((_, delta) => {
    const v = vrm ?? vrmRef.current
    if (!v) return

    // ── 1. Lip-sync ────────────────────────────────────────────────────────
    let targetMouth = 0
    if (isSpeakingRef.current && analyserRef.current && freqDataRef.current) {
      analyserRef.current.getByteFrequencyData(freqDataRef.current)

      // Average the speech-frequency bins (~300–3 500 Hz).
      // With fftSize=512 at 44 100 Hz sample rate:
      //   bin width = 44100 / 512 ≈ 86 Hz
      //   bin 4  ≈ 345 Hz  (lower speech)
      //   bin 40 ≈ 3 450 Hz (upper speech)
      const bins = freqDataRef.current.slice(4, 40)
      const avg  = bins.reduce((a, b) => a + b, 0) / bins.length
      targetMouth = Math.min((avg / 255) * 3.5, 1)   // 3.5× amplification
    }

    // Smooth mouth movement with exponential lerp
    mouthValueRef.current = THREE.MathUtils.lerp(
      mouthValueRef.current,
      targetMouth,
      1 - Math.pow(0.001, delta),
    )
    _setMouth(v, mouthValueRef.current)

    // ── 2. Eye blinking ────────────────────────────────────────────────────
    const now = Date.now()
    if (!isBlinkingRef.current && now > nextBlinkRef.current) {
      isBlinkingRef.current = true
      _setExpression(v, 'blink', VRMExpressionPresetName.Blink, 1)
      setTimeout(() => {
        _setExpression(v, 'blink', VRMExpressionPresetName.Blink, 0)
        isBlinkingRef.current = false
        nextBlinkRef.current  = Date.now() + _randomBlinkDelay()
      }, 130)
    }

    // ── 3. Idle breathing (subtle chest/head sway) ─────────────────────────
    const t = performance.now() * 0.001  // seconds

    const chestBone = v.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.Chest)
    if (chestBone) {
      // Gentle inhale/exhale — 0.4 Hz, ~0.012 rad amplitude
      chestBone.rotation.x = Math.sin(t * 0.4 * Math.PI * 2) * 0.012
    }

    const headBone = v.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.Head)
    if (headBone) {
      // Very slow head micro-movement to look alive
      headBone.rotation.y = Math.sin(t * 0.18 * Math.PI * 2) * 0.035
      headBone.rotation.z = Math.sin(t * 0.11 * Math.PI * 2) * 0.015
    }

    // ── 4. VRM internal update (spring bones, constraints) ────────────────
    v.update(delta)
  })

  if (!vrm) return null

  return <primitive object={vrm.scene} />
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Set the mouth/aa expression — handles both VRM 0.x and VRM 1.0 APIs. */
function _setMouth(vrm: VRM, value: number) {
  // VRM 1.0
  if (vrm.expressionManager) {
    vrm.expressionManager.setValue(VRMExpressionPresetName.Aa, value)
    return
  }
  // VRM 0.x fallback (blendShapeProxy is typed as `any` in older @pixiv/three-vrm)
  const proxy = (vrm as any).blendShapeProxy
  if (proxy) {
    // VRM 0.x preset names are uppercase strings
    proxy.setValue('A', value)
  }
}

/** Set a named expression — handles both VRM 0.x and VRM 1.0. */
function _setExpression(
  vrm: VRM,
  vrmZeroName: string,
  vrm1Name: VRMExpressionPresetName,
  value: number,
) {
  if (vrm.expressionManager) {
    vrm.expressionManager.setValue(vrm1Name, value)
  } else {
    const proxy = (vrm as any).blendShapeProxy
    proxy?.setValue(vrmZeroName.toUpperCase(), value)
  }
}

/** Stop and disconnect the current AudioBufferSourceNode if any. */
function _stopSource(ref: React.MutableRefObject<AudioBufferSourceNode | null>) {
  if (ref.current) {
    try {
      ref.current.stop()
      ref.current.disconnect()
    } catch {
      // already stopped — ignore
    }
    ref.current = null
  }
}

/** Random blink interval: 2–6 seconds. */
function _randomBlinkDelay() {
  return 2_000 + Math.random() * 4_000
}
