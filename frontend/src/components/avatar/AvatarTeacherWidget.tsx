import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, ChevronDown, Keyboard, Loader2, Mic, Send, X } from 'lucide-react'
import AvatarTutor from './AvatarTutor'
import VoiceTutorSession from './VoiceTutorSession'
import { useTTSSpeech, type TTSLanguage } from './useTTSSpeech'
import api from '../../lib/axios'

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

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (open && mode === 'text') setTimeout(() => inputRef.current?.focus(), 200)
  }, [open, mode])

  const hasGreetedRef = useRef(false)
  useEffect(() => {
    if (open && !hasGreetedRef.current) {
      hasGreetedRef.current = true
      const greeting = t('avatar.greeting')
      setMessages([{ role: 'aida', content: greeting }])
      speakTimed(greeting, lang, 'female')
      setPhase('speaking')
    }
  }, [open, lang, speakTimed, t])

  const handleSpeechEnd = () => setPhase('idle')

  const handleTextSubmit = async () => {
    const q = question.trim()
    if (!q || phase === 'thinking' || phase === 'speaking') return

    clear()
    setQuestion('')
    setMessages(prev => [...prev, { role: 'user', content: q }])
    setPhase('thinking')

    try {
      const { data } = await api.post<{ explanation: string }>('/avatar/explain', {
        question: q,
        language: lang,
      })

      setMessages(prev => [...prev, { role: 'aida', content: data.explanation }])
      const ttsOk = await speakTimed(data.explanation, lang, 'female')
      if (ttsOk) {
        setPhase('speaking')
      } else if ('speechSynthesis' in window) {
        setPhase('speaking')
        const utt = new SpeechSynthesisUtterance(data.explanation)
        utt.lang = ({ kg: 'ru-RU', ru: 'ru-RU', en: 'en-US' } as Record<string, string>)[lang] ?? 'ru-RU'
        utt.onend = () => setPhase('idle')
        utt.onerror = () => setPhase('idle')
        window.speechSynthesis.cancel()
        window.speechSynthesis.speak(utt)
      } else {
        setPhase('idle')
      }
    } catch (err) {
      console.error('[AvatarTeacherWidget]', err)
      setMessages(prev => [...prev, { role: 'aida', content: t('avatar.error') }])
      setPhase('error')
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleTextSubmit()
    }
  }

  const switchMode = (next: UIMode) => {
    clear()
    setPhase('idle')
    setMode(next)
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden" style={{ maxHeight: '620px' }}>
          
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-400">
            <div className="flex items-center gap-2 text-white">
              <Bot size={18} />
              <span className="font-semibold text-sm">{t('avatar.name')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex bg-amber-600/40 rounded-full p-0.5 gap-0.5">
                <button onClick={() => switchMode('text')} className={`rounded-full p-1 ${mode === 'text' ? 'bg-white text-amber-600' : 'text-white/80'}`}><Keyboard size={13} /></button>
                <button onClick={() => switchMode('voice')} className={`rounded-full p-1 ${mode === 'voice' ? 'bg-white text-amber-600' : 'text-white/80'}`}><Mic size={13} /></button>
              </div>
              <button onClick={() => setOpen(false)} className="text-white/80"><X size={16} /></button>
            </div>
          </div>

          {mode === 'voice' ? (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2" style={{ maxHeight: '200px' }}>
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${msg.role === 'user' ? 'bg-amber-500 text-white' : 'bg-slate-100'}`}>{msg.content}</div>
                  </div>
                ))}
                <div ref={chatBottomRef} />
              </div>
              <div className="px-3 py-3 border-t border-slate-100">
                <VoiceTutorSession
                  lang={lang}
                  audioUrl={audioUrl}
                  wordBoundaries={wordBoundaries}
                  isLoading={isLoading}
                  speakTimed={speakTimed} // ИСПРАВЛЕНО: убрана опечатка с двоеточием
                  clear={clear}
                  onSpeechEnd={handleSpeechEnd}
                  onUserMessage={text => setMessages(prev => [...prev, { role: 'user', content: text }])}
                  onAidaReply={text => setMessages(prev => [...prev, { role: 'aida', content: text }])}
                  onError={() => setMessages(prev => [...prev, { role: 'aida', content: t('avatar.error') }])}
                />
              </div>
            </div>
          ) : (
            <>
              <AvatarTutor audioUrl={audioUrl} wordBoundaries={wordBoundaries} height={200} onSpeechEnd={handleSpeechEnd} />
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2" style={{ maxHeight: '180px' }}>
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${msg.role === 'user' ? 'bg-amber-500 text-white' : 'bg-slate-100'}`}>{msg.content}</div>
                  </div>
                ))}
                <div ref={chatBottomRef} />
              </div>
              <div className="px-3 py-2 border-t border-slate-100 flex items-center gap-2">
                <input ref={inputRef} value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={handleKey} placeholder={t('avatar.placeholder')} className="flex-1 text-sm border rounded-xl px-3 py-2" />
                <button onClick={handleTextSubmit} className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center">
                  {phase === 'thinking' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <button onClick={() => setOpen(v => !v)} className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white ${open ? 'bg-slate-700' : 'bg-amber-500'}`}>
        {open ? <ChevronDown size={22} /> : <Bot size={22} />}
      </button>
    </div>
  )
}
