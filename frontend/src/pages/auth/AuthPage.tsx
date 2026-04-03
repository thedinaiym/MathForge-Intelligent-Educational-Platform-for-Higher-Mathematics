import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Brain, ArrowLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'signin' | 'signup'

// ── SVG icons (avoid deprecated lucide-react Github export) ──────────────────

const GithubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
  </svg>
)

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
    <path d="M17.64 9.205C17.64 8.566 17.583 7.953 17.476 7.364H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908C16.658 14.253 17.64 11.945 17.64 9.205z" fill="#4285F4" />
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853" />
    <path d="M3.964 10.71C3.784 10.17 3.682 9.593 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957C.348 6.173 0 7.548 0 9s.348 2.827.957 4.042L3.964 10.71z" fill="#FBBC05" />
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
  </svg>
)

// ── OAuth buttons ─────────────────────────────────────────────────────────────

function OAuthButtons({
  loading,
  onGithub,
  onGoogle,
}: {
  loading: boolean
  onGithub: () => void
  onGoogle: () => void
}) {
  const { t } = useTranslation()

  const base =
    'w-full flex items-center justify-center gap-3 px-5 py-3 rounded-xl font-medium text-sm transition-all disabled:opacity-50 border'

  return (
    <div className="space-y-3">
      <button
        onClick={onGithub}
        disabled={loading}
        className={`${base} bg-slate-900 border-slate-700 text-white hover:bg-slate-800`}
      >
        <GithubIcon />
        {t('auth.loginWithGithub')}
      </button>
      <button
        onClick={onGoogle}
        disabled={loading}
        className={`${base} bg-white border-slate-200 text-slate-800 hover:bg-slate-50 shadow-sm`}
      >
        <GoogleIcon />
        {t('auth.loginWithGoogle')}
      </button>
    </div>
  )
}

// ── Input field ───────────────────────────────────────────────────────────────

function Field({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
}: {
  label: string
  type?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-slate-600 text-xs font-semibold mb-1.5 uppercase tracking-wide">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200
                   text-slate-800 placeholder-slate-400 text-sm
                   focus:outline-none focus:ring-2 focus:ring-amber-400/60 focus:border-amber-400
                   transition-all"
      />
    </div>
  )
}

// ── Divider ───────────────────────────────────────────────────────────────────

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-5">
      <div className="flex-1 h-px bg-slate-100" />
      <span className="text-slate-400 text-xs font-medium">{label}</span>
      <div className="flex-1 h-px bg-slate-100" />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AuthPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [tab, setTab] = useState<Tab>('signin')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user) navigate('/app/profile', { replace: true })
  }, [user, navigate])

  const handleGithub = async () => {
    setLoading(true)
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}/app/profile` },
    })
  }

  const handleGoogle = async () => {
    setLoading(true)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/app/profile` },
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-amber-50/30 to-slate-100 flex flex-col">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm transition-colors"
        >
          <ArrowLeft size={14} />
          {t('auth.backToHome')}
        </Link>

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center">
            <Brain size={14} className="text-amber-600" />
          </div>
          <span className="font-bold text-slate-800 text-sm tracking-tight">MathForge</span>
        </div>
      </div>

      {/* ── Card ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">

          {/* Tab switcher — pill style */}
          <div className="flex gap-1 p-1 bg-slate-200/60 rounded-2xl mb-6">
            {(['signin', 'signup'] as Tab[]).map((id) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all ${
                  tab === id
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t(`auth.tabs.${id === 'signin' ? 'signIn' : 'signUp'}`)}
              </button>
            ))}
          </div>

          {/* Card body */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-200/50 p-7">

            {/* ── Sign In ─────────────────────────────────────────────────── */}
            {tab === 'signin' && (
              <div>
                <h1 className="text-xl font-bold text-slate-800 mb-1">
                  {t('auth.signInTitle')}
                </h1>
                <p className="text-slate-500 text-sm mb-6">
                  {t('auth.signInSubtitle')}
                </p>

                <OAuthButtons
                  loading={loading}
                  onGithub={handleGithub}
                  onGoogle={handleGoogle}
                />

                <p className="text-center text-slate-400 text-xs mt-5">
                  {t('auth.alreadyHaveAccount')}
                </p>
              </div>
            )}

            {/* ── Sign Up ─────────────────────────────────────────────────── */}
            {tab === 'signup' && (
              <div>
                <h1 className="text-xl font-bold text-slate-800 mb-1">
                  {t('auth.signUpTitle')}
                </h1>
                <p className="text-slate-500 text-sm mb-6">
                  {t('auth.signUpSubtitle')}
                </p>

                <OAuthButtons
                  loading={loading}
                  onGithub={handleGithub}
                  onGoogle={handleGoogle}
                />

                <p className="text-center text-slate-400 text-xs mt-5">
                  {t('auth.alreadyHaveAccount')}
                </p>
              </div>
            )}

          </div>

          <p className="text-center text-slate-400 text-xs mt-5">
            © 2026 MathForge · Kyrgyz Republic
          </p>
        </div>
      </div>
    </div>
  )
}
