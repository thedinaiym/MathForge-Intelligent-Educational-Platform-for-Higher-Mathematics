import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Star, X } from 'lucide-react'
import api from '../../lib/axios'

interface Props {
  onClose: () => void
}

export default function RatingModal({ onClose }: Props) {
  const { t } = useTranslation()
  const [score, setScore]       = useState(0)
  const [hovered, setHovered]   = useState(0)
  const [feedback, setFeedback] = useState('')
  const [sending, setSending]   = useState(false)
  const [done, setDone]         = useState(false)

  async function submit() {
    if (score === 0) return
    setSending(true)
    try {
      await api.post('/ratings', { score, feedback: feedback.trim() || null })
    } catch { /* non-blocking */ }
    setDone(true)
    setTimeout(onClose, 1400)
  }

  function skip() {
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 relative animate-in fade-in zoom-in-95 duration-200">

        {/* Close */}
        <button
          onClick={skip}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {done ? (
          /* ── Thank-you state ── */
          <div className="text-center py-4">
            <div className="text-4xl mb-3">🙏</div>
            <p className="font-semibold text-slate-800 text-lg">
              {t('rating.thanks', 'Рахмат!')}
            </p>
            <p className="text-sm text-slate-500 mt-1">
              {t('rating.thanksSub', 'Ваша оценка принята')}
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="text-center mb-5">
              <div className="text-3xl mb-2">⭐</div>
              <h2 className="text-lg font-bold text-slate-800">
                {t('rating.title', 'Оцените MathForge')}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                {t('rating.subtitle', 'Как вам платформа? Это займёт 10 секунд.')}
              </p>
            </div>

            {/* Stars */}
            <div className="flex justify-center gap-2 mb-5">
              {[1, 2, 3, 4, 5].map(star => {
                const active = star <= (hovered || score)
                return (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setScore(star)}
                    onMouseEnter={() => setHovered(star)}
                    onMouseLeave={() => setHovered(0)}
                    className="transition-transform hover:scale-110 active:scale-95"
                    aria-label={`${star} stars`}
                  >
                    <Star
                      size={36}
                      className={`transition-colors ${
                        active
                          ? 'fill-amber-400 text-amber-400'
                          : 'fill-slate-100 text-slate-300'
                      }`}
                    />
                  </button>
                )
              })}
            </div>

            {/* Optional feedback */}
            {score > 0 && (
              <textarea
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                placeholder={t('rating.feedbackPlaceholder', 'Расскажите подробнее (необязательно)…')}
                maxLength={500}
                rows={3}
                className="w-full text-sm px-3 py-2 rounded-xl border border-slate-200 resize-none
                           focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 mb-4"
              />
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={skip}
                className="flex-1 py-2.5 text-sm text-slate-500 hover:text-slate-700
                           rounded-xl border border-slate-200 hover:border-slate-300 transition-colors"
              >
                {t('rating.skip', 'Пропустить')}
              </button>
              <button
                onClick={submit}
                disabled={score === 0 || sending}
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl transition-colors
                           bg-amber-400 hover:bg-amber-500 text-white
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {sending
                  ? t('common.loading', 'Загрузка…')
                  : t('rating.submit', 'Отправить')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
