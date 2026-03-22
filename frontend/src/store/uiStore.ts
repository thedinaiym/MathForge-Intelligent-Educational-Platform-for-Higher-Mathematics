import { create } from 'zustand'

interface UIState {
  tokenBalance: number
  setTokenBalance: (balance: number) => void
  /** Deduct `amount` tokens (default 1). Used by StudentAnalyzer (0.5) and TeacherGenerator (5). */
  decrementToken: (amount?: number) => void
}

export const useUIStore = create<UIState>((set) => ({
  tokenBalance: 0,
  setTokenBalance: (balance) => set({ tokenBalance: balance }),
  decrementToken: (amount = 1) =>
    set((state) => ({
      tokenBalance: Math.max(0, Math.round((state.tokenBalance - amount) * 100) / 100),
    })),
}))
