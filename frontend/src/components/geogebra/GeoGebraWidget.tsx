/**
 * GeoGebraWidget — reusable Math Apps component.
 *
 * Loads the official GeoGebra Math Apps Bundle (deployggb.js) once via a
 * dynamically injected <script> tag, then initialises a GGBApplet inside
 * the container div.  A second mount of the component reuses the cached
 * global script — no double-download.
 *
 * Props
 * ─────
 * appName          'graphing' | 'geometry' | '3d' | 'cas' | 'suite'
 *                  Default: 'suite'  (all tools in one)
 * width / height   Pixel dimensions. Defaults: fill container.
 * showAlgebraInput Show the input bar (bottom of graphing/cas views)
 * showToolBar      Show the toolbar (top icon strip)
 * showMenuBar      Show File/Edit/View menu bar
 * showFullscreenButton  Toggle fullscreen button inside the applet
 * language         ISO code forwarded to GeoGebra UI ('ru', 'en', 'ky'…)
 * onReady          Called once the applet is initialised
 */
import { useEffect, useId, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

// ── Types from GeoGebra's global API ─────────────────────────────────────────

declare global {
  interface Window {
    GGBApplet?: new (
      params: Record<string, unknown>,
      html5NoWebGL?: boolean,
    ) => { inject: (containerIdOrEl: string | HTMLElement) => void }
    _ggbDeployScriptLoaded?: boolean
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEPLOY_SCRIPT = 'https://www.geogebra.org/apps/deployggb.js'

export type GeoGebraApp = 'suite' | 'graphing' | 'geometry' | '3d' | 'cas'

export interface GeoGebraWidgetProps {
  /** Which GeoGebra app to load. Defaults to 'suite'. */
  appName?: GeoGebraApp
  /** Container width in px. Defaults to 100% of parent. */
  width?: number
  /**
   * Container height in px.
   * Pass 0 or omit to let the parent's CSS (e.g. flex-1) control the height.
   * Default: 480.
   */
  height?: number
  /** Show the algebra input bar at the bottom. Default: true */
  showAlgebraInput?: boolean
  /** Show the top toolbar. Default: true */
  showToolBar?: boolean
  /** Show the menu bar. Default: false */
  showMenuBar?: boolean
  /** Show fullscreen button inside applet. Default: true */
  showFullscreenButton?: boolean
  /** BCP-47 locale forwarded to GeoGebra. Default: 'en' */
  language?: string
  /** Called once the applet has finished initialising. */
  onReady?: () => void
}

// ── Script loader (singleton promise) ────────────────────────────────────────

let scriptPromise: Promise<void> | null = null

function loadDeployScript(): Promise<void> {
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<void>((resolve, reject) => {
    // Already in DOM (e.g. HMR re-render)
    if (window._ggbDeployScriptLoaded) { resolve(); return }

    const script = document.createElement('script')
    script.src = DEPLOY_SCRIPT
    script.async = true
    script.onload = () => { window._ggbDeployScriptLoaded = true; resolve() }
    script.onerror = () => {
      scriptPromise = null
      reject(new Error('Failed to load GeoGebra deploy script'))
    }
    document.head.appendChild(script)
  })

  return scriptPromise
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GeoGebraWidget({
  appName = 'suite',
  width,
  height = 480,   // 0 means "use CSS, don't set px height on GGBApplet params"
  showAlgebraInput = true,
  showToolBar = true,
  showMenuBar = false,
  showFullscreenButton = true,
  language = 'en',
  onReady,
}: GeoGebraWidgetProps) {
  // Stable unique ID for GeoGebra applet container (survives HMR)
  const uid = useId().replace(/:/g, '_')
  const containerId = `ggb_container_${uid}`

  const containerRef = useRef<HTMLDivElement>(null)
  const injectedRef = useRef(false)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (injectedRef.current) return   // already injected in this mount
    injectedRef.current = true

    loadDeployScript()
      .then(() => {
        if (!window.GGBApplet) {
          throw new Error('GGBApplet is not defined after script load.')
        }
        if (!containerRef.current) return

        const params: Record<string, unknown> = {
          appName,
          // If a fixed pixel width is supplied, use it; otherwise let GeoGebra
          // fill the container via scaleContainerClass.
          ...(width ? { width } : { scaleContainerClass: 'ggb-scale-container' }),
          // height 0 means "fill via CSS flex" — omit from params so GeoGebra
          // does not set an explicit pixel height on the canvas.
          ...(height ? { height } : {}),
          showAlgebraInput,
          showToolBar,
          showMenuBar,
          showFullscreenButton,
          language,
          // Disable the "powered by GeoGebra" splash to save vertical space
          showSplash: false,
          // Enables touch events on mobile
          enableLabelDrags: false,
          // Callback name registered on window
          appletOnLoad: `__ggb_ready_${uid}`,
          // Use HTML5 canvas — no Java required
          preferHTML5: true,
        }

        // Register the ready callback on window
        ;(window as any)[`__ggb_ready_${uid}`] = () => {
          setStatus('ready')
          onReady?.()
          // Clean up the global
          delete (window as any)[`__ggb_ready_${uid}`]
        }

        const applet = new window.GGBApplet!(params, true)
        applet.inject(containerId)
      })
      .catch((err: Error) => {
        setErrorMsg(err.message)
        setStatus('error')
      })

    // Cleanup: nothing to destroy (GeoGebra has no public destroy API in Math Apps bundle)
    return () => {
      // Remove the ready-callback if unmounted before it fires
      delete (window as any)[`__ggb_ready_${uid}`]
    }
  }, []) // intentionally empty: initialise once per mount

  return (
    <div
      className="relative ggb-scale-container w-full"
      // When height is 0, let parent CSS (flex-1, h-full etc.) control height.
      style={height ? { height } : { height: '100%' }}
    >
      {/* GeoGebra injects into this div by ID */}
      <div id={containerId} ref={containerRef} className="w-full h-full" />

      {/* Loading overlay */}
      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3
          bg-slate-50 rounded-xl border border-slate-100 pointer-events-none">
          <Loader2 size={28} className="animate-spin text-amber-400" />
          <p className="text-xs text-slate-400">Loading GeoGebra…</p>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2
          bg-red-50 rounded-xl border border-red-200 p-6 text-center">
          <p className="text-sm font-semibold text-red-600">Could not load GeoGebra</p>
          <p className="text-xs text-red-400 max-w-xs">{errorMsg}</p>
          <p className="text-xs text-slate-400 mt-1">
            Check your internet connection — GeoGebra loads from geogebra.org.
          </p>
        </div>
      )}
    </div>
  )
}
