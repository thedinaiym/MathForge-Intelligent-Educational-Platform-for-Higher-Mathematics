/**
 * useWebSpeechSTT — Push-to-Talk wrapper around the browser Web Speech API.
 *
 * Usage:
 *   const { transcript, isListening, isSupported, startListening, stopListening, reset } = useWebSpeechSTT({ lang })
 *
 *   - Call startListening() on mousedown/touchstart
 *   - Call stopListening()  on mouseup/touchend
 *   - `transcript` accumulates the final (non-interim) recognised text
 *   - `interimTranscript` holds the live in-progress text (for display only)
 *   - `reset()` clears both transcripts
 *
 * The hook uses `continuous: false` so the browser automatically finalises
 * when the user stops speaking, but we still call stop() explicitly for PTT
 * to cut recognition as soon as the button is released.
 */

// TypeScript's lib.dom.d.ts already declares SpeechRecognition and its events.
// We only need to extend Window with the vendor-prefixed webkit variant so the
// compiler accepts `window.webkitSpeechRecognition` without casting.
declare global {
  interface Window {
    SpeechRecognition:        typeof SpeechRecognition
    webkitSpeechRecognition:  typeof SpeechRecognition
  }
}

import { useCallback, useEffect, useRef, useState } from 'react'

// Normalise vendor-prefixed constructor
const SpeechRecognitionCtor: (new () => SpeechRecognition) | null =
  (typeof window !== 'undefined' &&
    (window.SpeechRecognition ?? window.webkitSpeechRecognition)) || null

export interface UseWebSpeechSTTOptions {
  /** BCP-47 language tag, e.g. 'ru-RU', 'en-US', 'ky-KG' */
  lang?: string
  /** Called whenever a final transcript segment arrives */
  onResult?: (text: string) => void
  /** Called when the recognition session ends */
  onEnd?: () => void
  /** Called on a recognition error */
  onError?: (error: string) => void
}

export interface WebSpeechSTTHook {
  transcript:        string
  interimTranscript: string
  isListening:       boolean
  isSupported:       boolean
  startListening:    () => void
  stopListening:     () => void
  reset:             () => void
}

export function useWebSpeechSTT({
  lang = 'ru-RU',
  onResult,
  onEnd,
  onError,
}: UseWebSpeechSTTOptions = {}): WebSpeechSTTHook {
  const isSupported = SpeechRecognitionCtor !== null

  const [transcript,        setTranscript]        = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [isListening,       setIsListening]       = useState(false)

  const recognitionRef  = useRef<SpeechRecognition | null>(null)
  const finalRef        = useRef('')          // accumulate across segments
  const stoppedByUsRef  = useRef(false)       // track intentional stop

  // Stable callbacks via refs so the effect doesn't re-run on prop change
  const onResultRef = useRef(onResult)
  const onEndRef    = useRef(onEnd)
  const onErrorRef  = useRef(onError)
  useEffect(() => { onResultRef.current = onResult }, [onResult])
  useEffect(() => { onEndRef.current    = onEnd    }, [onEnd])
  useEffect(() => { onErrorRef.current  = onError  }, [onError])

  const _buildRecognition = useCallback((): SpeechRecognition | null => {
    if (!SpeechRecognitionCtor) return null

    const rec = new SpeechRecognitionCtor()
    rec.lang              = lang
    rec.continuous        = false   // single utterance per PTT press
    rec.interimResults    = true
    rec.maxAlternatives   = 1

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalRef.current += result[0].transcript + ' '
          setTranscript(finalRef.current.trim())
          onResultRef.current?.(finalRef.current.trim())
        } else {
          interim += result[0].transcript
        }
      }
      setInterimTranscript(interim)
    }

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'no-speech' and 'aborted' are expected during normal PTT flow
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        onErrorRef.current?.(event.error)
      }
      setIsListening(false)
      setInterimTranscript('')
    }

    rec.onend = () => {
      setIsListening(false)
      setInterimTranscript('')
      if (!stoppedByUsRef.current) {
        onEndRef.current?.()
      }
    }

    return rec
  }, [lang])

  const startListening = useCallback(() => {
    if (!isSupported || isListening) return

    // Tear down any stale instance
    recognitionRef.current?.abort()

    finalRef.current    = ''
    stoppedByUsRef.current = false
    setTranscript('')
    setInterimTranscript('')

    const rec = _buildRecognition()
    if (!rec) return
    recognitionRef.current = rec

    try {
      rec.start()
      setIsListening(true)
    } catch {
      // Already started — ignore
    }
  }, [isSupported, isListening, _buildRecognition])

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return
    stoppedByUsRef.current = true
    try {
      recognitionRef.current.stop()
    } catch {
      // Already stopped
    }
    setIsListening(false)
    setInterimTranscript('')
    // Fire onEnd after intentional stop too
    setTimeout(() => onEndRef.current?.(), 50)
  }, [])

  const reset = useCallback(() => {
    finalRef.current = ''
    setTranscript('')
    setInterimTranscript('')
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort()
    }
  }, [])

  return {
    transcript,
    interimTranscript,
    isListening,
    isSupported,
    startListening,
    stopListening,
    reset,
  }
}
