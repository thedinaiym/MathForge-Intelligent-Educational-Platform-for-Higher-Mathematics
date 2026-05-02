import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type UserRole = 'admin' | 'teacher' | 'student'
export type UserLocale = 'en' | 'ru' | 'kg'

export interface AuthUser {
  id: string
  name: string
  role: UserRole
  locale: UserLocale
}

interface AuthState {
  user: AuthUser | null
  setUser: (user: AuthUser | null) => void
  logout: () => void
  /** Set before signOut() fires — prevents SIGNED_IN race re-logging the user in */
  isLoggingOut: boolean
  startLogout: () => void
  finishLogout: () => void
  /** true once the initial Supabase session check is complete */
  isInitialized: boolean
  setInitialized: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      logout: () => set({ user: null }),
      isLoggingOut: false,
      startLogout: () => set({ user: null, isLoggingOut: true }),
      finishLogout: () => set({ isLoggingOut: false }),
      isInitialized: false,
      setInitialized: () => set({ isInitialized: true }),
    }),
    {
      name: 'mathforge-auth',
      // don't persist transient flags — always start false on page load
      partialize: (state) => ({ user: state.user }),
    },
  ),
)
