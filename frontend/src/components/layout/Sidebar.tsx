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
import { useUIStore } from '../../store/uiStore'
import { supabase } from '../../lib/supabase'
import i18n from '../../i18n'

const LOCALES = ['ru', 'en', 'kg'] as const

export default function Sidebar() {
  const { t } = useTranslation()
  const { user, logout } = useAuthStore()
  const { sidebarOpen, closeSidebar } = useUIStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    closeSidebar()
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

  const sidebarContent = (
    <aside className="w-64 bg-white flex flex-col h-full">
      {/* Logo + close button */}
      <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
        <div>
          <span className="text-xl font-bold text-amber-600">MathForge</span>
          <p className="text-xs text-slate-400 mt-0.5">Neuro-Symbolic Math</p>
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={closeSidebar}
          className="md:hidden p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <NavLink to="/app/dashboard" className={navLinkClass} onClick={closeSidebar}>
          <LayoutDashboard size={18} /> {t('nav.dashboard')}
        </NavLink>

        <NavLink to="/app/profile" className={navLinkClass} onClick={closeSidebar}>
          <User size={18} /> {t('nav.profile')}
        </NavLink>

        <NavLink to="/app/billing" className={navLinkClass} onClick={closeSidebar}>
          <Coins size={18} /> {t('nav.billing')}
        </NavLink>

        <NavLink to="/app/math-library" className={navLinkClass} onClick={closeSidebar}>
          <BookMarked size={18} /> {t('nav.mathLibrary')}
        </NavLink>

        {user?.role === 'student' && (
          <NavLink to="/app/student" className={navLinkClass} onClick={closeSidebar}>
            <GraduationCap size={18} /> {t('nav.student')}
          </NavLink>
        )}

        {(user?.role === 'teacher' || user?.role === 'admin') && (
          <>
            <NavLink to="/app/teacher" className={navLinkClass} onClick={closeSidebar}>
              <BookOpen size={18} /> {t('nav.teacher')}
            </NavLink>
            <NavLink to="/app/teacher/library" className={navLinkClass} onClick={closeSidebar}>
              <Library size={18} /> {t('nav.library')}
            </NavLink>
          </>
        )}

        {(user?.role === 'admin' || user?.role === 'teacher') && (
          <NavLink to="/app/admin" className={navLinkClass} onClick={closeSidebar}>
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

  return (
    <>
      {/* Desktop sidebar — always visible */}
      <div className="hidden md:flex h-screen sticky top-0 border-r border-slate-200">
        {sidebarContent}
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/40"
            onClick={closeSidebar}
          />
          {/* Drawer */}
          <div className="md:hidden fixed inset-y-0 left-0 z-50 shadow-xl">
            {sidebarContent}
          </div>
        </>
      )}
    </>
  )
}
