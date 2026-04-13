/**
 * useTTSSpeech — calls the TTS microservice and returns a blob URL
 * ready to feed into <AvatarTutor audioUrl={...} />.
 *
 * Two modes:
 *   speak()      → POST /api/tts/generate         → MP3 blob URL (simple)
 *   speakTimed() → POST /api/tts/generate-with-timing → MP3 blob URL + word boundaries
 *
 * Both functions return `true` if audio is ready to play, `false` if TTS
 * failed or timed out.  Callers MUST check the return value to decide
 * whether to enter a 'speaking' phase — otherwise the UI hangs forever
 * when TTS is unavailable.
 *
 * Usage:
 *   const { audioUrl, wordBoundaries, speakTimed, clear } = useTTSSpeech()
 *   const ok = await speakTimed('Привет!', 'ru', 'female')
 *   setPhase(ok ? 'speaking' : 'idle')
 */
import { useCallback, useRef, useState } from 'react'

const TTS_BASE_URL = import.meta.env.VITE_TTS_URL ?? 'http://localhost:8001'
const TTS_TIMEOUT_MS = 10_000   // 10 s — abort and fall back to text-only

export type TTSLanguage  = 'kg' | 'ru' | 'en'
export type TTSVoiceType = 'male' | 'female'

export interface WordBoundary {
  word:        string
  offset_ms:   number
  duration_ms: number
}

interface TTSSpeechHook {
  audioUrl:        string | null
  wordBoundaries:  WordBoundary[]
  isLoading:       boolean
  isSpeaking:      boolean
  /** Returns true if audio is ready, false if TTS failed/timed out. */
  speak:      (text: string, language?: TTSLanguage, voiceType?: TTSVoiceType) => Promise<boolean>
  /** Returns true if audio is ready, false if TTS failed/timed out. */
  speakTimed: (text: string, language?: TTSLanguage, voiceType?: TTSVoiceType) => Promise<boolean>
  clear: () => void
  error: string | null
}

export function useTTSSpeech(): TTSSpeechHook {
  const [audioUrl,       setAudioUrl]       = useState<string | null>(null)
  const [wordBoundaries, setWordBoundaries] = useState<WordBoundary[]>([])
  const [isLoading,      setIsLoading]      = useState(false)
  const [isSpeaking,     setIsSpeaking]     = useState(false)
  const [error,          setError]          = useState<string | null>(null)

  const prevUrlRef = useRef<string | null>(null)

  const _revokePrev = () => {
    if (prevUrlRef.current) {
      URL.revokeObjectURL(prevUrlRef.current)
      prevUrlRef.current = null
    }
  }

  const _reset = () => {
    _revokePrev()
    setAudioUrl(null)
    setWordBoundaries([])
    setIsSpeaking(false)
    setError(null)
  }

  const clear = useCallback(() => {
    _reset()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Simple mode — returns MP3 blob URL, no timing data. */
  const speak = useCallback(async (
    text:      string,
    language:  TTSLanguage  = 'ru',
    voiceType: TTSVoiceType = 'female',
  ): Promise<boolean> => {
    if (!text.trim()) return false
    _reset()
    setIsLoading(true)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS)

    try {
      const res = await fetch(`${TTS_BASE_URL}/api/tts/generate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text, language, voice_type: voiceType }),
        signal:  controller.signal,
      })
      if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text().catch(() => res.statusText)}`)
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      prevUrlRef.current = url
      setAudioUrl(url)
      setIsSpeaking(true)
      return true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'TTS request failed'
      console.warn('[useTTSSpeech] TTS unavailable — showing text only:', msg)
      setError(msg)
      return false
    } finally {
      clearTimeout(timer)
      setIsLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Timed mode — returns MP3 blob URL AND word-boundary timing for precise lip-sync. */
  const speakTimed = useCallback(async (
    text:      string,
    language:  TTSLanguage  = 'ru',
    voiceType: TTSVoiceType = 'female',
  ): Promise<boolean> => {
    if (!text.trim()) return false
    _reset()
    setIsLoading(true)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS)

    try {
      const res = await fetch(`${TTS_BASE_URL}/api/tts/generate-with-timing`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text, language, voice_type: voiceType }),
        signal:  controller.signal,
      })
      if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text().catch(() => res.statusText)}`)

      const json: {
        audio_base64:    string
        word_boundaries: WordBoundary[]
      } = await res.json()

      // Convert base64 → Blob → Object URL
      const bytes  = Uint8Array.from(atob(json.audio_base64), c => c.charCodeAt(0))
      const blob   = new Blob([bytes], { type: 'audio/mpeg' })
      const url    = URL.createObjectURL(blob)

      prevUrlRef.current = url
      setAudioUrl(url)
      setWordBoundaries(json.word_boundaries ?? [])
      setIsSpeaking(true)
      return true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'TTS request failed'
      console.warn('[useTTSSpeech] TTS unavailable — showing text only:', msg)
      setError(msg)
      return false
    } finally {
      clearTimeout(timer)
      setIsLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { audioUrl, wordBoundaries, isLoading, isSpeaking, speak, speakTimed, clear, error }
}
