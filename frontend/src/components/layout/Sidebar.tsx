import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  User,
  Coins,
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  Library,
  Database,
  LogOut,
  Globe,
  BookMarked,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { supabase } from '../../lib/supabase'
import i18n from '../../i18n'

const LOCALES = ['ru', 'en', 'kg'] as const

export default function Sidebar() {
  const { t } = useTranslation()
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    logout()
    navigate('/')
  }

  const handleLocaleChange = (locale: string) => {
    i18n.changeLanguage(locale)
    localStorage.setItem('mathforge_lang', locale)
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-amber-500 text-white'
        : 'text-slate-600 hover:bg-amber-50 hover:text-amber-700'
    }`

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-100">
        <span className="text-xl font-bold text-amber-600">MathForge</span>
        <p className="text-xs text-slate-400 mt-0.5">Neuro-Symbolic Math</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <NavLink to="/app/dashboard" className={navLinkClass}>
          <LayoutDashboard size={18} /> {t('nav.dashboard')}
        </NavLink>

        <NavLink to="/app/profile" className={navLinkClass}>
          <User size={18} /> {t('nav.profile')}
        </NavLink>

        <NavLink to="/app/billing" className={navLinkClass}>
          <Coins size={18} /> {t('nav.billing')}
        </NavLink>

        <NavLink to="/app/math-library" className={navLinkClass}>
          <BookMarked size={18} /> {t('nav.mathLibrary')}
        </NavLink>

        {user?.role === 'student' && (
          <NavLink to="/app/student" className={navLinkClass}>
            <GraduationCap size={18} /> {t('nav.student')}
          </NavLink>
        )}

        {(user?.role === 'teacher' || user?.role === 'admin') && (
          <>
            <NavLink to="/app/teacher" className={navLinkClass}>
              <BookOpen size={18} /> {t('nav.teacher')}
            </NavLink>
            <NavLink to="/app/teacher/library" className={navLinkClass}>
              <Library size={18} /> {t('nav.library')}
            </NavLink>
          </>
        )}

        {(user?.role === 'admin' || user?.role === 'teacher') && (
          <NavLink to="/app/admin" className={navLinkClass}>
            <Database size={18} /> {t('nav.admin')}
          </NavLink>
        )}
      </nav>

      {/* Language switcher */}
      <div className="px-4 py-3 border-t border-slate-100">
        <div className="flex items-center gap-1 mb-3">
          <Globe size={14} className="text-slate-400" />
          <span className="text-xs text-slate-400 uppercase tracking-wider">Language</span>
        </div>
        <div className="flex gap-1">
          {LOCALES.map((loc) => (
            <button
              key={loc}
              onClick={() => handleLocaleChange(loc)}
              className={`flex-1 py-1 text-xs rounded font-medium transition-colors ${
                i18n.language === loc
                  ? 'bg-amber-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-amber-100'
              }`}
            >
              {loc.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Logout */}
      <div className="px-3 pb-4">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
        >
          <LogOut size={18} /> {t('nav.logout')}
        </button>
      </div>
    </aside>
  )
}
