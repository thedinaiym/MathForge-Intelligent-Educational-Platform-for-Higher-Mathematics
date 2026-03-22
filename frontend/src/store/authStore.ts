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
      isInitialized: false,
      setInitialized: () => set({ isInitialized: true }),
    }),
    {
      name: 'mathforge-auth',
      // don't persist isInitialized — always start false on page load
      partialize: (state) => ({ user: state.user }),
    },
  ),
)
