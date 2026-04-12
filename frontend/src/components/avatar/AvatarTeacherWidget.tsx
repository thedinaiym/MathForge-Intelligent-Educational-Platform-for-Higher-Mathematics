/**
 * AvatarTeacherWidget
 *
 * Floating bottom-right panel with the AI avatar tutor (Aida).
 * Supports two input modes:
 *   • Text mode  — type a question, press Enter or Send
 *   • Voice mode — hold the mic button, speak, release to send
 *
 * Languages: en / ru / kg — auto-detected from i18next.
 * Voice: female (Nazgul / Svetlana / Jenny).
 *
 * Requires:
 *   - /public/tutor.vrm  (drop any VRM file there)
 *   - VITE_TTS_URL env var pointing to the TTS microservice
 *   - VITE_API_URL env var pointing to the main backend
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, ChevronDown, Keyboard, Loader2, Mic, Send, X } from 'lucide-react'
import AvatarTutor from './AvatarTutor'
import VoiceTutorSession from './VoiceTutorSession'
import { useTTSSpeech, type TTSLanguage } from './useTTSSpeech'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// Map i18next language codes → TTS language codes
const LANG_MAP: Record<string, TTSLanguage> = {
  en: 'en',
  ru: 'ru',
  kg: 'kg',
  ky: 'kg',
}

type Phase   = 'idle' | 'thinking' | 'speaking' | 'error'
type UIMode  = 'text' | 'voice'

interface Message {
  role:    'user' | 'aida'
  content: string
}

export default function AvatarTeacherWidget() {
  const { i18n, t } = useTranslation()
  const lang: TTSLanguage = LANG_MAP[i18n.language] ?? 'ru'

  const [open,     setOpen]     = useState(false)
  const [mode,     setMode]     = useState<UIMode>('text')
  const [phase,    setPhase]    = useState<Phase>('idle')
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<Message[]>([])

  const { audioUrl, wordBoundaries, isLoading, speakTimed, clear } = useTTSSpeech()
  const inputRef      = useRef<HTMLInputElement>(null)
  const chatBottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll chat on new message
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when panel opens in text mode
  useEffect(() => {
    if (open && mode === 'text') setTimeout(() => inputRef.current?.focus(), 200)
  }, [open, mode])

  // Greet on first open
  const hasGreetedRef = useRef(false)
  useEffect(() => {
    if (open && !hasGreetedRef.current) {
      hasGreetedRef.current = true
      const greeting = t('avatar.greeting')
      setMessages([{ role: 'aida', content: greeting }])
      speakTimed(greeting, lang, 'female')
      setPhase('speaking')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleSpeechEnd = () => setPhase('idle')

  // ── Text mode: submit ─────────────────────────────────────────────────────
  const handleTextSubmit = async () => {
    const q = question.trim()
    if (!q || phase === 'thinking' || phase === 'speaking') return

    clear()
    setQuestion('')
    setMessages(prev => [...prev, { role: 'user', content: q }])
    setPhase('thinking')

    try {
      const token = localStorage.getItem('access_token') ?? ''
      const res   = await fetch(`${API_BASE}/api/avatar/explain`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ question: q, language: lang }),
      })

      if (!res.ok) throw new Error(`API ${res.status}`)
      const data: { explanation: string } = await res.json()

      setMessages(prev => [...prev, { role: 'aida', content: data.explanation }])
      await speakTimed(data.explanation, lang, 'female')
      setPhase('speaking')
    } catch (err) {
      console.error('[AvatarTeacherWidget]', err)
      const errMsg = t('avatar.error')
      setMessages(prev => [...prev, { role: 'aida', content: errMsg }])
      setPhase('error')
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleTextSubmit()
    }
  }

  // ── Mode toggle ───────────────────────────────────────────────────────────
  const switchMode = (next: UIMode) => {
    clear()
    setPhase('idle')
    setMode(next)
  }

  const handleClose = () => {
    setOpen(false)
    clear()
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">

      {/* ── Expanded panel ── */}
      {open && (
        <div
          className="w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
          style={{ maxHeight: '620px' }}
        >

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-400">
            <div className="flex items-center gap-2">
              <Bot size={18} className="text-white" />
              <span className="text-white font-semibold text-sm">{t('avatar.name')}</span>
              <span className="text-amber-100 text-xs">
                {phase === 'thinking' && t('avatar.thinking')}
                {phase === 'speaking' && t('avatar.speaking')}
              </span>
            </div>

            {/* Mode switcher + close */}
            <div className="flex items-center gap-2">
              {/* Text / Voice toggle pills */}
              <div className="flex bg-amber-600/40 rounded-full p-0.5 gap-0.5">
                <button
                  onClick={() => switchMode('text')}
                  className={`
                    rounded-full p-1 transition-colors
                    ${mode === 'text' ? 'bg-white text-amber-600' : 'text-white/80 hover:text-white'}
                  `}
                  title={t('avatar.voice.textMode')}
                >
                  <Keyboard size={13} />
                </button>
                <button
                  onClick={() => switchMode('voice')}
                  className={`
                    rounded-full p-1 transition-colors
                    ${mode === 'voice' ? 'bg-white text-amber-600' : 'text-white/80 hover:text-white'}
                  `}
                  title={t('avatar.voice.voiceMode')}
                >
                  <Mic size={13} />
                </button>
              </div>

              <button
                onClick={handleClose}
                className="text-white/80 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* ── VOICE MODE ── */}
          {mode === 'voice' ? (
            <div className="flex flex-col flex-1 min-h-0">
              {/* Chat transcript (voice) */}
              <div
                className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0"
                style={{ maxHeight: '200px' }}
              >
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`
                      max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-snug
                      ${msg.role === 'user'
                        ? 'bg-amber-500 text-white rounded-br-sm'
                        : 'bg-slate-100 text-slate-800 rounded-bl-sm'}
                    `}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                <div ref={chatBottomRef} />
              </div>

              {/* Voice session (avatar + PTT button) */}
              <div className="px-3 py-3 flex flex-col items-center border-t border-slate-100">
                <VoiceTutorSession
                  lang={lang}
                  audioUrl={audioUrl}
                  wordBoundaries={wordBoundaries}
                  isLoading={isLoading}
                  speakTimed={speakTimed}
                  clear={clear}
                  onSpeechEnd={handleSpeechEnd}
                  onUserMessage={text => setMessages(prev => [...prev, { role: 'user', content: text }])}
                  onAidaReply={text => setMessages(prev => [...prev, { role: 'aida', content: text }])}
                  onError={msg => {
                    setMessages(prev => [...prev, { role: 'aida', content: t('avatar.error') }])
                    console.error('[VoiceMode]', msg)
                  }}
                />
              </div>
            </div>
          ) : (
            /* ── TEXT MODE ── */
            <>
              {/* 3D Avatar canvas */}
              <div className="flex-shrink-0">
                <AvatarTutor
                  audioUrl={audioUrl}
                  wordBoundaries={wordBoundaries}
                  height={200}
                  onSpeechEnd={handleSpeechEnd}
                />
              </div>

              {/* Chat transcript */}
              <div
                className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0"
                style={{ maxHeight: '180px' }}
              >
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`
                      max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-snug
                      ${msg.role === 'user'
                        ? 'bg-amber-500 text-white rounded-br-sm'
                        : 'bg-slate-100 text-slate-800 rounded-bl-sm'}
                    `}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                <div ref={chatBottomRef} />
              </div>

              {/* Input row */}
              <div className="px-3 py-2 border-t border-slate-100 flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder={t('avatar.placeholder')}
                  disabled={phase === 'thinking'}
                  className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2
                             focus:outline-none focus:ring-2 focus:ring-amber-400
                             disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                  onClick={handleTextSubmit}
                  disabled={!question.trim() || phase === 'thinking'}
                  className="w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-600 disabled:opacity-40
                             flex items-center justify-center text-white transition-colors flex-shrink-0"
                >
                  {isLoading || phase === 'thinking'
                    ? <Loader2 size={14} className="animate-spin" />
                    : <Send size={14} />
                  }
                </button>
              </div>

              {/* Language / voice hint */}
              <div className="px-3 pb-2 flex items-center gap-1 text-[10px] text-slate-400">
                <Mic size={9} />
                <span>
                  {lang === 'kg' ? 'Назгул (кыргызча)' :
                   lang === 'ru' ? 'Светлана (русский)' :
                   'Jenny (English)'}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Floating toggle button ── */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`
          w-14 h-14 rounded-full shadow-lg flex items-center justify-center
          transition-all duration-200
          ${open
            ? 'bg-slate-700 hover:bg-slate-600'
            : 'bg-gradient-to-br from-amber-500 to-orange-400 hover:scale-105'}
        `}
        title={t('avatar.toggleTitle')}
      >
        {open
          ? <ChevronDown size={22} className="text-white" />
          : <Bot size={22} className="text-white" />
        }
      </button>
    </div>
  )
}
