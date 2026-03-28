/**
 * useTTSSpeech — calls the Phase 19 TTS microservice and returns a blob URL
 * ready to feed into <AvatarTutor audioUrl={...} />.
 *
 * Usage:
 *   const { audioUrl, speak, isSpeaking, clear } = useTTSSpeech()
 *
 *   // Speak a sentence:
 *   await speak('Привет, я ваш репетитор!', 'ru', 'female')
 *
 *   // Plug the URL directly into AvatarTutor:
 *   <AvatarTutor audioUrl={audioUrl} onSpeechEnd={clear} />
 */
import { useCallback, useRef, useState } from 'react'

const TTS_BASE_URL = import.meta.env.VITE_TTS_URL ?? 'http://localhost:8001'

export type TTSLanguage  = 'kg' | 'ru' | 'en'
export type TTSVoiceType = 'male' | 'female'

interface TTSSpeechHook {
  /** Current blob URL for <AvatarTutor> — null while idle or loading. */
  audioUrl:   string | null
  /** True while the HTTP request is in-flight. */
  isLoading:  boolean
  /** True after audioUrl is set (until clear() is called). */
  isSpeaking: boolean
  /** Fetch TTS audio and set audioUrl. */
  speak: (text: string, language?: TTSLanguage, voiceType?: TTSVoiceType) => Promise<void>
  /** Revoke the current blob URL and reset state. */
  clear: () => void
  /** Last error message, or null. */
  error: string | null
}

export function useTTSSpeech(): TTSSpeechHook {
  const [audioUrl,   setAudioUrl]   = useState<string | null>(null)
  const [isLoading,  setIsLoading]  = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // Keep ref to current blob URL so we can revoke it on the next call
  const prevUrlRef = useRef<string | null>(null)

  const clear = useCallback(() => {
    if (prevUrlRef.current) {
      URL.revokeObjectURL(prevUrlRef.current)
      prevUrlRef.current = null
    }
    setAudioUrl(null)
    setIsSpeaking(false)
    setError(null)
  }, [])

  const speak = useCallback(async (
    text:      string,
    language:  TTSLanguage  = 'ru',
    voiceType: TTSVoiceType = 'female',
  ) => {
    if (!text.trim()) return

    // Revoke previous blob URL to free memory
    if (prevUrlRef.current) {
      URL.revokeObjectURL(prevUrlRef.current)
      prevUrlRef.current = null
    }
    setAudioUrl(null)
    setIsSpeaking(false)
    setError(null)
    setIsLoading(true)

    try {
      const res = await fetch(`${TTS_BASE_URL}/api/tts/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          language,
          voice_type: voiceType,
        }),
      })

      if (!res.ok) {
        const detail = await res.text().catch(() => res.statusText)
        throw new Error(`TTS service error ${res.status}: ${detail}`)
      }

      const blob   = await res.blob()
      const url    = URL.createObjectURL(blob)
      prevUrlRef.current = url

      setAudioUrl(url)
      setIsSpeaking(true)
    } catch (err: any) {
      console.error('[useTTSSpeech]', err)
      setError(err?.message ?? 'TTS request failed')
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { audioUrl, isLoading, isSpeaking, speak, clear, error }
}
