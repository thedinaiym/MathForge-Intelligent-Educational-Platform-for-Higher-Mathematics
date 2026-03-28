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
  X,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { supabase } from '../../lib/supabase'
import i18n from '../../i18n'

const LOCALES = ['ru', 'en', 'kg'] as const

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { t } = useTranslation()
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    onClose()
    try {
      await supabase.auth.signOut()
    } catch {
      // network error — clear local state anyway
    } finally {
      logout()
      navigate('/auth', { replace: true })
    }
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
    <aside
      className={[
        // ── Base layout ──────────────────────────────────────────────────────
        'flex flex-col bg-white border-r border-slate-200 h-screen w-64 flex-shrink-0',
        // ── Mobile: fixed overlay, slide in/out via transform ────────────────
        'fixed inset-y-0 left-0 z-50',
        'transform transition-transform duration-300 ease-in-out',
        isOpen ? 'translate-x-0' : '-translate-x-full',
        // ── Desktop: static in flex flow, always visible ─────────────────────
        'md:relative md:translate-x-0 md:z-auto',
      ].join(' ')}
    >
      {/* ── Logo + close button ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 flex-shrink-0">
        <div>
          <span className="text-xl font-bold text-amber-600">MathForge</span>
          <p className="text-xs text-slate-400 mt-0.5">Neuro-Symbolic Math</p>
        </div>
        {/* X button — mobile only */}
        <button
          onClick={onClose}
          className="md:hidden p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
      </div>

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <NavLink to="/app/dashboard" className={navLinkClass} onClick={onClose}>
          <LayoutDashboard size={18} /> {t('nav.dashboard')}
        </NavLink>

        <NavLink to="/app/profile" className={navLinkClass} onClick={onClose}>
          <User size={18} /> {t('nav.profile')}
        </NavLink>

        <NavLink to="/app/billing" className={navLinkClass} onClick={onClose}>
          <Coins size={18} /> {t('nav.billing')}
        </NavLink>

        <NavLink to="/app/math-library" className={navLinkClass} onClick={onClose}>
          <BookMarked size={18} /> {t('nav.mathLibrary')}
        </NavLink>

        {user?.role === 'student' && (
          <NavLink to="/app/student" className={navLinkClass} onClick={onClose}>
            <GraduationCap size={18} /> {t('nav.student')}
          </NavLink>
        )}

        {(user?.role === 'teacher' || user?.role === 'admin') && (
          <>
            <NavLink to="/app/teacher" className={navLinkClass} onClick={onClose}>
              <BookOpen size={18} /> {t('nav.teacher')}
            </NavLink>
            <NavLink to="/app/teacher/library" className={navLinkClass} onClick={onClose}>
              <Library size={18} /> {t('nav.library')}
            </NavLink>
          </>
        )}

        {(user?.role === 'admin' || user?.role === 'teacher') && (
          <NavLink to="/app/admin" className={navLinkClass} onClick={onClose}>
            <Database size={18} /> {t('nav.admin')}
          </NavLink>
        )}
      </nav>

      {/* ── Language switcher ─────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-t border-slate-100 flex-shrink-0">
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

      {/* ── Logout ────────────────────────────────────────────────────────── */}
      <div className="px-3 pb-4 flex-shrink-0">
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
