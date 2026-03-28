import { useTranslation } from 'react-i18next'
import { Brain } from 'lucide-react'

// ── Instagram SVG icon (lucide-react's Instagram may differ in stroke weight) ─
const InstagramIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
  </svg>
)

const INSTAGRAM_URL =
  'https://www.instagram.com/mathforgeapp?igsh=bTd5dWV4MnRuaDBl&utm_source=qr'

export default function Footer() {
  const { t } = useTranslation()

  return (
    <footer className="bg-slate-900 text-white">
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">

          {/* ── Brand ──────────────────────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <Brain size={18} className="text-amber-400" />
              </div>
              <span className="text-lg font-bold tracking-tight">MathForge</span>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
              {t('footer.tagline')}
            </p>
          </div>

          {/* ── Links ──────────────────────────────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">
              {t('footer.platform')}
            </p>
            <ul className="space-y-2 text-sm text-slate-400">
              <li>
                <a href="/auth" className="hover:text-amber-400 transition-colors">
                  {t('footer.getStarted')}
                </a>
              </li>
              <li>
                <a href="/app/math-library" className="hover:text-amber-400 transition-colors">
                  {t('nav.mathLibrary')}
                </a>
              </li>
              <li>
                <a href="/#about" className="hover:text-amber-400 transition-colors">
                  {t('footer.aboutLink')}
                </a>
              </li>
            </ul>
          </div>

          {/* ── Social ─────────────────────────────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">
              {t('footer.followUs')}
            </p>
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl
                         bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400
                         text-white text-sm font-medium
                         hover:opacity-90 active:scale-95 transition-all shadow-lg
                         shadow-pink-500/20"
            >
              <InstagramIcon />
              @mathforgeapp
            </a>
            <p className="text-slate-500 text-xs mt-3">{t('footer.socialHint')}</p>
          </div>

        </div>

        {/* ── Bottom bar ─────────────────────────────────────────────────────── */}
        <div className="mt-12 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <span>© 2026 MathForge — {t('footer.rights')}</span>
          <span>{t('footer.madeIn')}</span>
        </div>
      </div>
    </footer>
  )
}
