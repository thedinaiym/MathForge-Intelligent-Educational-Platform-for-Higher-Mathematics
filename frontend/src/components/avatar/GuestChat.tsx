/**
 * GuestChat — Landing page hero chat panel.
 *
 * Allows unauthenticated visitors to send up to GUEST_MESSAGE_LIMIT questions
 * to Aida (the AI avatar). Usage is tracked in localStorage.
 * When the limit is reached, a full-screen modal CTA prompts registration.
 *
 * Props:
 *   lang          — TTS language code (en / ru / kg)
 *   onAidaReply   — called with the response text so the parent can trigger TTS
 *   onThinking    — called with true/false to show avatar thinking state
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Loader2, Send, Sparkles } from 'lucide-react'
import i18n from '../../i18n'

// ── Constants ─────────────────────────────────────────────────────────────────

const GUEST_MESSAGE_LIMIT = 3
const LS_KEY = 'mf_guest_msgs_used'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api'

// ── localStorage helpers ──────────────────────────────────────────────────────

function getUsed(): number {
  return Math.min(parseInt(localStorage.getItem(LS_KEY) ?? '0', 10), GUEST_MESSAGE_LIMIT)
}
function markUsed(): number {
  const next = getUsed() + 1
  localStorage.setItem(LS_KEY, String(next))
  return next
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  role:    'user' | 'aida'
  content: string
}

interface GuestChatProps {
  lang:         'en' | 'ru' | 'kg'
  onAidaReply?: (text: string) => void
  onThinking?:  (thinking: boolean) => void
}

// ── Limit-reached modal ───────────────────────────────────────────────────────

function LimitModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const lang = i18n.resolvedLanguage ?? 'ru'

  const copy = {
    en: {
      title:  "You've used your 3 free messages!",
      body:   "Register for free to keep learning with Aida — unlimited questions, step-by-step solutions, and personalized practice.",
      cta:    "Register Free",
      later:  "Maybe later",
    },
    ru: {
      title:  "Вы использовали 3 бесплатных сообщения!",
      body:   "Зарегистрируйтесь бесплатно, чтобы продолжить обучение с Айдой — безлимитные вопросы, пошаговые решения и персональные задания.",
      cta:    "Зарегистрироваться",
      later:  "Позже",
    },
    kg: {
      title:  "3 акысыз билдирүүнү колдондуңуз!",
      body:   "Айда менен окууну улантуу үчүн акысыз катталыңыз — чексиз суроолор, кадам-кадам чечимдер жана жекелештирилген тапшырмалар.",
      cta:    "Катталуу",
      later:  "Кийинчерек",
    },
  }

  const t = copy[lang as keyof typeof copy] ?? copy.ru

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-5"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-white/10 backdrop-blur-2xl border border-white/20 rounded-3xl p-8 shadow-2xl text-center"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.06) 100%)',
        }}
      >
        {/* Glow */}
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-40 h-40 bg-amber-400/30 rounded-full blur-3xl pointer-events-none" />

        {/* Icon */}
        <div className="relative w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/40">
          <Sparkles size={28} className="text-white" />
        </div>

        <h2 className="text-2xl font-bold text-white mb-3 leading-snug">{t.title}</h2>
        <p className="text-white/60 text-sm leading-relaxed mb-8">{t.body}</p>

        <button
          onClick={() => navigate('/auth')}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl
                     bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400
                     text-white font-bold text-base shadow-xl shadow-amber-500/30
                     transition-all active:scale-95"
        >
          {t.cta}
          <ArrowRight size={18} />
        </button>

        <button
          onClick={onClose}
          className="mt-3 w-full py-2 text-white/40 hover:text-white/60 text-sm transition-colors"
        >
          {t.later}
        </button>
      </div>
    </div>
  )
}

// ── Starter suggestions ───────────────────────────────────────────────────────

const SUGGESTIONS: Record<string, string[]> = {
  en: ['What is a derivative?', 'Explain linear equations', 'How to solve quadratics?'],
  ru: ['Что такое производная?', 'Объясни линейные уравнения', 'Как решать квадратные?'],
  kg: ['Туунду деген эмне?', 'Сызыктуу теңдемени түшүндүр', 'Квадрат теңдемени кантип чечүүгө болот?'],
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GuestChat({ lang, onAidaReply, onThinking }: GuestChatProps) {
  const [messages,    setMessages]    = useState<Message[]>([])
  const [input,       setInput]       = useState('')
  const [thinking,    setThinking]    = useState(false)
  const [usedCount,   setUsedCount]   = useState(getUsed)
  const [showModal,   setShowModal]   = useState(false)
  const inputRef      = useRef<HTMLInputElement>(null)
  const bottomRef     = useRef<HTMLDivElement>(null)

  const remaining = GUEST_MESSAGE_LIMIT - usedCount
  const exhausted = remaining <= 0

  // Auto-scroll — block:'nearest' scrolls only within the chat container,
  // not the whole page (prevents jump to second section on load/lang-change).
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages, thinking])

  // Greeting on mount
  useEffect(() => {
    const greetings: Record<string, string> = {
      en: "Hi! I'm Aida, your AI math tutor. Ask me anything — I have 3 free answers ready for you! 🧮",
      ru: "Привет! Я Айда, ваш AI-репетитор по математике. Задайте любой вопрос — у вас 3 бесплатных ответа! 🧮",
      kg: "Саламатсызбы! Мен Айда, сиздин AI математика мугалимиңизмин. Каалаган суроону бериңиз — сизге 3 акысыз жооп даяр! 🧮",
    }
    const greeting = greetings[lang] ?? greetings.ru
    setMessages([{ role: 'aida', content: greeting }])
  }, [lang])

  // Normalise BCP-47 variants (e.g. 'ky', 'ky-KG') to backend-accepted codes
  const apiLang = ({ ky: 'kg' } as Record<string, string>)[lang.split('-')[0]] ?? lang

  const sendMessage = async (text: string) => {
    const q = text.trim()
    if (!q || thinking || exhausted) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: q }])
    setThinking(true)
    onThinking?.(true)

    try {
      const res = await fetch(`${API_BASE}/avatar/guest-explain`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ question: q, language: apiLang }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: { explanation: string } = await res.json()

      setMessages(prev => [...prev, { role: 'aida', content: data.explanation }])
      onAidaReply?.(data.explanation)

      const newCount = markUsed()
      setUsedCount(newCount)
      if (newCount >= GUEST_MESSAGE_LIMIT) {
        setTimeout(() => setShowModal(true), 1800)
      }
    } catch (err) {
      console.error('[GuestChat]', err)
      const errMsgs: Record<string, string> = {
        en: "Sorry, I'm having trouble connecting. Please try again.",
        ru: "Извините, возникла проблема с подключением. Попробуйте ещё раз.",
        kg: "Кечиресиз, туташуу менен көйгөй бар. Кайра аракет кылыңыз.",
      }
      setMessages(prev => [...prev, { role: 'aida', content: errMsgs[lang] ?? errMsgs.ru }])
    } finally {
      setThinking(false)
      onThinking?.(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const suggestions = SUGGESTIONS[lang] ?? SUGGESTIONS.ru

  return (
    <>
      {showModal && <LimitModal onClose={() => setShowModal(false)} />}

      <div className="flex flex-col h-full w-full">

        {/* ── Message list ── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/20">

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'aida' && (
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex-shrink-0 mr-2 mt-0.5 flex items-center justify-center text-[10px] font-bold text-white">
                  A
                </div>
              )}
              <div className={`
                max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed
                ${msg.role === 'user'
                  ? 'bg-amber-500 text-white rounded-br-sm shadow-lg shadow-amber-500/20'
                  : 'bg-white/10 text-white border border-white/10 rounded-bl-sm backdrop-blur-sm'}
              `}>
                {msg.content}
              </div>
            </div>
          ))}

          {/* Thinking indicator */}
          {thinking && (
            <div className="flex justify-start items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white">
                A
              </div>
              <div className="bg-white/10 border border-white/10 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5 backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── Suggestions (shown only before first user message) ── */}
        {messages.filter(m => m.role === 'user').length === 0 && (
          <div className="px-4 pb-2 flex flex-wrap gap-2">
            {suggestions.map(s => (
              <button
                key={s}
                onClick={() => sendMessage(s)}
                className="px-3 py-1.5 rounded-xl bg-white/8 hover:bg-white/15 border border-white/15
                           text-white/70 hover:text-white text-xs transition-all cursor-pointer"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* ── Counter bar ── */}
        {!exhausted && usedCount > 0 && (
          <div className="px-4 pb-1">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-0.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400/60 rounded-full transition-all duration-700"
                  style={{ width: `${(usedCount / GUEST_MESSAGE_LIMIT) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-white/30 whitespace-nowrap flex-shrink-0">
                {remaining} left
              </span>
            </div>
          </div>
        )}

        {/* ── Input row ── */}
        <div className="px-4 pb-4 pt-2">
          {exhausted ? (
            <button
              onClick={() => setShowModal(true)}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl
                         bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400
                         text-white font-semibold text-sm shadow-xl shadow-amber-500/30
                         transition-all active:scale-95"
            >
              <Sparkles size={15} />
              Continue with Aida — Register Free
              <ArrowRight size={15} />
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-white/8 border border-white/15 rounded-2xl px-4 py-1 backdrop-blur-sm focus-within:border-amber-400/50 transition-colors">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={
                  lang === 'ru' ? 'Задайте вопрос Айде…' :
                  lang === 'kg' ? 'Айдага суроо бериңиз…' :
                  'Ask Aida anything…'
                }
                disabled={thinking}
                className="flex-1 bg-transparent text-white placeholder-white/30 text-sm py-2.5
                           focus:outline-none disabled:opacity-40"
                autoComplete="off"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || thinking}
                className="w-8 h-8 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-30
                           flex items-center justify-center text-white transition-all flex-shrink-0
                           active:scale-90"
              >
                {thinking
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Send size={14} />
                }
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
