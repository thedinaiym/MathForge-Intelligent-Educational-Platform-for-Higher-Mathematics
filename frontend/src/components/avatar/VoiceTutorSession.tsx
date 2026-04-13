/**
 * VoiceTutorSession
 *
 * Full voice pipeline:
 *   1. "Hold to Talk" button → Web Speech API STT (useWebSpeechSTT)
 *   2. On release → POST /api/tutor/chat (Groq multi-turn)
 *   3. Response text → speakTimed() (TTS microservice)
 *   4. Audio + word boundaries → <AvatarTutor> lip-sync
 *
 * Props
 * ─────
 * lang          TTSLanguage ('en' | 'ru' | 'kg')
 * sttLang       BCP-47 for SpeechRecognition (e.g. 'ru-RU')
 * audioUrl      current TTS audio URL (from useTTSSpeech)
 * wordBoundaries current word boundaries (from useTTSSpeech)
 * isLoading     TTS is generating audio
 * onSpeechEnd   callback when avatar finishes speaking
 * onUserMessage called with recognised text (to append to transcript)
 * onAidaReply   called with Aida's reply text (to append to transcript)
 * onError       called on any pipeline error
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Mic, MicOff, Volume2 } from 'lucide-react'
import AvatarTutor from './AvatarTutor'
import { useWebSpeechSTT } from './useWebSpeechSTT'
import type { TTSLanguage } from './useTTSSpeech'
import type { WordBoundary } from './useTTSSpeech'
import api from '../../lib/axios'

// BCP-47 map for SpeechRecognition
const STT_LANG_MAP: Record<TTSLanguage, string> = {
  en: 'en-US',
  ru: 'ru-RU',
  kg: 'ky-KG',
}

interface ChatMessage {
  role:    'user' | 'assistant'
  content: string
}

interface VoiceTutorSessionProps {
  lang:            TTSLanguage
  audioUrl:        string | null
  wordBoundaries:  WordBoundary[]
  isLoading:       boolean
  speakTimed:      (text: string, language?: TTSLanguage, voiceType?: 'male' | 'female') => Promise<void>
  clear:           () => void
  onSpeechEnd:     () => void
  onUserMessage:   (text: string) => void
  onAidaReply:     (text: string) => void
  onError:         (msg: string) => void
}

type VoicePhase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'

export default function VoiceTutorSession({
  lang,
  audioUrl,
  wordBoundaries,
  isLoading,
  speakTimed,
  clear,
  onSpeechEnd,
  onUserMessage,
  onAidaReply,
  onError,
}: VoiceTutorSessionProps) {
  const { t } = useTranslation()
  const sttLang = STT_LANG_MAP[lang] ?? 'ru-RU'

  const [phase,    setPhase]    = useState<VoicePhase>('idle')
  const [history,  setHistory]  = useState<ChatMessage[]>([])

  const historyRef = useRef<ChatMessage[]>([])

  // Keep ref in sync for use inside callbacks without stale closure
  useEffect(() => { historyRef.current = history }, [history])

  // ── STT ──────────────────────────────────────────────────────────────────
  const handleSTTEnd = useCallback(async () => {
    // Fires when user releases the button — finalised transcript is in stt.transcript
    // We read it from the hook state via a ref trick below
  }, [])

  const stt = useWebSpeechSTT({ lang: sttLang, onEnd: handleSTTEnd })

  // ── Submit recognised text to LLM ─────────────────────────────────────────
  const submitToLLM = useCallback(async (userText: string) => {
    const q = userText.trim()
    if (!q) return

    // Append user message to history
    const userMsg: ChatMessage = { role: 'user', content: q }
    const updatedHistory = [...historyRef.current, userMsg]
    setHistory(updatedHistory)
    historyRef.current = updatedHistory
    onUserMessage(q)
    stt.reset()

    setPhase('thinking')
    clear()

    try {
      const { data } = await api.post<{ reply: string }>('/tutor/chat', {
        messages: updatedHistory,
        language: lang,
      })
      const reply = data.reply.trim()

      // Append Aida reply to history
      const aidaMsg: ChatMessage = { role: 'assistant', content: reply }
      const newHistory = [...updatedHistory, aidaMsg]
      setHistory(newHistory)
      historyRef.current = newHistory
      onAidaReply(reply)

      // Speak the reply — falls back to text-only if TTS is unavailable
      const ttsOk = await speakTimed(reply, lang, 'female')
      setPhase(ttsOk ? 'speaking' : 'idle')
    } catch (err) {
      console.error('[VoiceTutorSession]', err)
      const msg = err instanceof Error ? err.message : 'Unknown error'
      onError(msg)
      setPhase('error')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, clear, speakTimed, onUserMessage, onAidaReply, onError])

  // ── PTT handlers ──────────────────────────────────────────────────────────
  const handlePressStart = () => {
    if (phase === 'thinking' || phase === 'speaking') return
    stt.reset()
    stt.startListening()
    setPhase('listening')
  }

  const handlePressEnd = async () => {
    stt.stopListening()
    // Give recognition a short moment to flush its final result
    await new Promise(r => setTimeout(r, 150))
    // Read final transcript from the stable ref that STT wrote
    const text = stt.transcript
    if (text.trim()) {
      await submitToLLM(text)
    } else {
      setPhase('idle')
    }
  }

  const handleSpeechEnd = () => {
    setPhase('idle')
    onSpeechEnd()
  }

  // ── Phase label ───────────────────────────────────────────────────────────
  const phaseLabel = {
    idle:      '',
    listening: t('avatar.voice.listening'),
    thinking:  t('avatar.thinking'),
    speaking:  t('avatar.speaking'),
    error:     t('avatar.error'),
  }[phase]

  // ── Mic button classes ────────────────────────────────────────────────────
  const micBusy = phase === 'thinking' || isLoading
  const micActive = phase === 'listening'

  return (
    <div className="flex flex-col items-center gap-3 w-full">

      {/* 3D Avatar */}
      <AvatarTutor
        audioUrl={audioUrl}
        wordBoundaries={wordBoundaries}
        height={200}
        onSpeechEnd={handleSpeechEnd}
      />

      {/* Status line */}
      <p className="text-xs text-slate-500 h-4 text-center">
        {phaseLabel}
        {phase === 'listening' && stt.interimTranscript && (
          <span className="ml-1 text-amber-600 italic">"{stt.interimTranscript}"</span>
        )}
      </p>

      {/* Hold-to-Talk button */}
      <button
        onMouseDown={handlePressStart}
        onMouseUp={handlePressEnd}
        onMouseLeave={() => { if (micActive) handlePressEnd() }}
        onTouchStart={e => { e.preventDefault(); handlePressStart() }}
        onTouchEnd={e => { e.preventDefault(); handlePressEnd() }}
        disabled={micBusy || phase === 'speaking'}
        aria-label={t('avatar.voice.holdToTalk')}
        className={`
          w-16 h-16 rounded-full flex items-center justify-center
          shadow-lg transition-all duration-150 select-none
          ${micActive
            ? 'bg-red-500 scale-110 ring-4 ring-red-300'
            : micBusy
              ? 'bg-slate-300 cursor-not-allowed'
              : phase === 'speaking'
                ? 'bg-amber-400 cursor-default'
                : 'bg-amber-500 hover:bg-amber-600 active:scale-95'}
        `}
      >
        {micBusy
          ? <Loader2 size={22} className="text-white animate-spin" />
          : phase === 'speaking'
            ? <Volume2 size={22} className="text-white" />
            : micActive
              ? <MicOff size={22} className="text-white" />
              : <Mic size={22} className="text-white" />
        }
      </button>

      {/* Instruction */}
      <p className="text-[10px] text-slate-400 text-center leading-tight">
        {!stt.isSupported
          ? t('avatar.voice.notSupported')
          : phase === 'listening'
            ? t('avatar.voice.releaseToSend')
            : t('avatar.voice.holdToTalk')
        }
      </p>
    </div>
  )
}
