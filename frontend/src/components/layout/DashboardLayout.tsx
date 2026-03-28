import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'
import Header from './Header'
import { useBalance } from '../../hooks/useBalance'

export default function DashboardLayout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // Fetch token balance once for the whole dashboard so every page sees it
  useBalance()

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">

      {/* ── Backdrop (mobile only, sits below sidebar z-50, above content z-40) ── */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ── */}
      <Sidebar
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />

      {/* ── Right column: top bars + scrollable content ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Mobile top bar — visible only below md breakpoint */}
        <div className="flex md:hidden items-center justify-between h-14 px-4
                        bg-white border-b border-slate-200 flex-shrink-0 z-30">
          <div>
            <span className="text-lg font-bold text-amber-600 leading-none">MathForge</span>
            <p className="text-[10px] text-slate-400 leading-none mt-0.5">Neuro-Symbolic Math</p>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
        </div>

        {/* Desktop header — hidden below md */}
        <div className="hidden md:block flex-shrink-0">
          <Header />
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
