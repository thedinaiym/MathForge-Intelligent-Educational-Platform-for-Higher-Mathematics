import { useTranslation } from 'react-i18next'
import { Coins, Menu } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useUIStore } from '../../store/uiStore'

export default function Header() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const { tokenBalance, toggleSidebar } = useUIStore()

  return (
    <header className="bg-white border-b border-slate-200 px-4 py-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {/* Hamburger — mobile only */}
        <button
          onClick={toggleSidebar}
          className="md:hidden flex-shrink-0 p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
          aria-label="Toggle menu"
        >
          <Menu size={22} />
        </button>

        <div className="text-sm text-slate-500 truncate">
          {user?.name && (
            <span>
              {user.name}
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700 font-medium capitalize">
                {user.role}
              </span>
            </span>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 flex items-center gap-2 text-sm font-medium text-amber-700 bg-amber-50 px-3 py-1.5 rounded-full">
        <Coins size={15} />
        <span>{tokenBalance}</span>
        <span className="text-amber-500 font-normal">{t('billing.tokens')}</span>
      </div>
    </header>
  )
}
