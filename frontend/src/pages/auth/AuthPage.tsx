import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Brain, Github } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import Button from '../../components/ui/Button'

export default function AuthPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  // Redirect if already authenticated
  useEffect(() => {
    if (user) navigate('/app/profile', { replace: true })
  }, [user, navigate])

  const handleGithubLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}/app/profile` },
    })
  }

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/app/profile` },
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-slate-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">
        {/* Logo */}
        <div className="flex items-center gap-2 justify-center mb-2">
          <Brain className="text-amber-500" size={32} />
          <span className="text-2xl font-bold text-slate-800">MathForge</span>
        </div>

        <h1 className="text-center text-lg font-semibold text-slate-700 mb-1">
          {t('auth.title')}
        </h1>
        <p className="text-center text-sm text-slate-400 mb-8">{t('auth.subtitle')}</p>

        <div className="space-y-3">
          <Button
            onClick={handleGithubLogin}
            variant="secondary"
            className="w-full justify-center"
            size="lg"
          >
            <Github size={18} />
            {t('auth.loginWithGithub')}
          </Button>

          <Button
            onClick={handleGoogleLogin}
            variant="secondary"
            className="w-full justify-center"
            size="lg"
          >
            {/* Google icon as SVG */}
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M17.64 9.20454C17.64 8.56636 17.5827 7.95272 17.4763 7.36363H9V10.845H13.8436C13.635 11.97 13.0009 12.9231 12.0477 13.5613V15.8195H14.9563C16.6581 14.2527 17.64 11.9454 17.64 9.20454Z"
                fill="#4285F4"
              />
              <path
                d="M9 18C11.43 18 13.4672 17.1941 14.9563 15.8195L12.0477 13.5613C11.2418 14.1013 10.2109 14.4204 9 14.4204C6.65591 14.4204 4.67182 12.8372 3.96409 10.71H0.957275V13.0418C2.43818 15.9831 5.48182 18 9 18Z"
                fill="#34A853"
              />
              <path
                d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40682 3.78409 7.83 3.96409 7.29V4.95818H0.957275C0.347727 6.17318 0 7.54772 0 9C0 10.4523 0.347727 11.8268 0.957275 13.0418L3.96409 10.71Z"
                fill="#FBBC05"
              />
              <path
                d="M9 3.57954C10.3213 3.57954 11.5077 4.03363 12.4405 4.92545L15.0218 2.34409C13.4631 0.891818 11.4259 0 9 0C5.48182 0 2.43818 2.01681 0.957275 4.95818L3.96409 7.29C4.67182 5.16272 6.65591 3.57954 9 3.57954Z"
                fill="#EA4335"
              />
            </svg>
            {t('auth.loginWithGoogle')}
          </Button>
        </div>
      </div>
    </div>
  )
}
