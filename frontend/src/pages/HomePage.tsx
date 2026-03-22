import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Brain, Globe, Coins, FileText, GraduationCap, BookOpen } from 'lucide-react'
import Button from '../components/ui/Button'
import { useAuthStore } from '../store/authStore'
import i18n from '../i18n'

const LOCALES = ['ru', 'en', 'kg'] as const

export default function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-slate-50">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-8 py-4 border-b border-slate-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <span className="text-xl font-bold text-amber-600">MathForge</span>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {LOCALES.map((loc) => (
              <button
                key={loc}
                onClick={() => i18n.changeLanguage(loc)}
                className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                  i18n.language === loc
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-amber-100'
                }`}
              >
                {loc.toUpperCase()}
              </button>
            ))}
          </div>
          {user ? (
            <Button onClick={() => navigate('/app/profile')} size="sm" variant="secondary">
              {user.name || t('nav.profile')}
            </Button>
          ) : (
            <Button onClick={() => navigate('/auth')} size="sm">
              {t('home.getStarted')}
            </Button>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center px-6 py-20">
        <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-700 px-4 py-1.5 rounded-full text-sm font-medium mb-6">
          <Brain size={16} />
          Neuro-Symbolic AI
        </div>
        <h1 className="text-5xl font-bold text-slate-800 max-w-3xl leading-tight mb-6">
          {t('home.hero')}
        </h1>
        <p className="text-lg text-slate-500 max-w-2xl mb-10">{t('home.heroSubtitle')}</p>

        {/* Quick-action buttons — show relevant actions based on role */}
        {user ? (
          <div className="flex flex-wrap gap-3 justify-center">
            {(user.role === 'student') && (
              <Button size="lg" onClick={() => navigate('/app/student')}>
                <GraduationCap size={18} />
                {t('nav.student')}
              </Button>
            )}
            {(user.role === 'teacher' || user.role === 'admin') && (
              <>
                <Button size="lg" onClick={() => navigate('/app/teacher')}>
                  <BookOpen size={18} />
                  {t('nav.teacher')}
                </Button>
                <Button size="lg" variant="secondary" onClick={() => navigate('/app/teacher/library')}>
                  <FileText size={18} />
                  {t('nav.library')}
                </Button>
              </>
            )}
            <Button size="lg" variant="secondary" onClick={() => navigate('/app/profile')}>
              {t('nav.profile')}
            </Button>
          </div>
        ) : (
          <div className="flex gap-3">
            <Button size="lg" onClick={() => navigate('/auth')}>
              {t('home.getStarted')}
            </Button>
            <Button size="lg" variant="secondary" onClick={() => navigate('/auth')}>
              {t('home.learnMore')}
            </Button>
          </div>
        )}
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 pb-24 grid grid-cols-1 md:grid-cols-2 gap-6">
        {[
          {
            icon: <Brain className="text-amber-500" size={24} />,
            title: t('home.features.neuroSymbolic'),
            desc: t('home.features.neuroSymbolicDesc'),
          },
          {
            icon: <Globe className="text-blue-500" size={24} />,
            title: t('home.features.multilingual'),
            desc: t('home.features.multilingualDesc'),
          },
          {
            icon: <Coins className="text-green-500" size={24} />,
            title: t('home.features.tokenBilling'),
            desc: t('home.features.tokenBillingDesc'),
          },
          {
            icon: <FileText className="text-purple-500" size={24} />,
            title: t('home.features.pdfGeneration'),
            desc: t('home.features.pdfGenerationDesc'),
          },
        ].map((f) => (
          <div
            key={f.title}
            className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="mb-3">{f.icon}</div>
            <h3 className="font-semibold text-slate-800 mb-2">{f.title}</h3>
            <p className="text-sm text-slate-500">{f.desc}</p>
          </div>
        ))}
      </section>
    </div>
  )
}
