import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Mic, MicOff, Volume2 } from 'lucide-react'
import AvatarTutor from './AvatarTutor'
import { useWebSpeechSTT } from './useWebSpeechSTT'
import type { TTSLanguage } from './useTTSSpeech'
import type { WordBoundary } from './useTTSSpeech'
import api from '../../lib/axios'

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
  // ИСПРАВЛЕНО: возвращаем Promise<boolean>, так как это делает хук useTTSSpeech
  speakTimed:      (text: string, language?: TTSLanguage, voiceType?: 'male' | 'female') => Promise<boolean>
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

  useEffect(() => { historyRef.current = history }, [history])

  const handleSTTEnd = useCallback(async () => {
    // Transcript логика
  }, [])

  const stt = useWebSpeechSTT({ lang: sttLang, onEnd: handleSTTEnd })

  const submitToLLM = useCallback(async (userText: string) => {
    const q = userText.trim()
    if (!q) return

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

      const aidaMsg: ChatMessage = { role: 'assistant', content: reply }
      const newHistory = [...updatedHistory, aidaMsg]
      setHistory(newHistory)
      historyRef.current = newHistory
      onAidaReply(reply)

      const ttsOk = await speakTimed(reply, lang, 'female')
      if (ttsOk) {
        setPhase('speaking')
      } else if ('speechSynthesis' in window) {
        setPhase('speaking')
        const utt = new SpeechSynthesisUtterance(reply)
        utt.lang = ({ kg: 'ru-RU', ru: 'ru-RU', en: 'en-US' } as Record<string, string>)[lang] ?? 'ru-RU'
        utt.onend = () => setPhase('idle')
        utt.onerror = () => setPhase('idle')
        window.speechSynthesis.cancel()
        window.speechSynthesis.speak(utt)
      } else {
        setPhase('idle')
      }
    } catch (err) {
      console.error('[VoiceTutorSession]', err)
      const msg = err instanceof Error ? err.message : 'Unknown error'
      onError(msg)
      setPhase('error')
    }
  }, [lang, clear, speakTimed, onUserMessage, onAidaReply, onError, stt])

  const handlePressStart = () => {
    if (phase === 'thinking' || phase === 'speaking') return
    stt.reset()
    stt.startListening()
    setPhase('listening')
  }

  const handlePressEnd = async () => {
    stt.stopListening()
    await new Promise(r => setTimeout(r, 150))
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

  const phaseLabel = {
    idle:      '',
    listening: t('avatar.voice.listening'),
    thinking:  t('avatar.thinking'),
    speaking:  t('avatar.speaking'),
    error:     t('avatar.error'),
  }[phase]

  const micBusy = phase === 'thinking' || isLoading
  const micActive = phase === 'listening'

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <AvatarTutor
        audioUrl={audioUrl}
        wordBoundaries={wordBoundaries}
        height={200}
        onSpeechEnd={handleSpeechEnd}
      />

      <p className="text-xs text-slate-500 h-4 text-center">
        {phaseLabel}
        {phase === 'listening' && stt.interimTranscript && (
          <span className="ml-1 text-amber-600 italic">"{stt.interimTranscript}"</span>
        )}
      </p>

      <button
        onMouseDown={handlePressStart}
        onMouseUp={handlePressEnd}
        onMouseLeave={() => { if (micActive) handlePressEnd() }}
        onTouchStart={e => { e.preventDefault(); handlePressStart() }}
        onTouchEnd={e => { e.preventDefault(); handlePressEnd() }}
        disabled={micBusy || phase === 'speaking'}
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