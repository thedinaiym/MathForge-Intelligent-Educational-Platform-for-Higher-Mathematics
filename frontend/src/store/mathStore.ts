/**
 * Zustand store for the student step-by-step analysis flow.
 *
 * Holds:
 *  - steps[]        — the ordered list of solution step strings (manual mode)
 *  - inputMode      — 'manual' | 'image' tab selection
 *  - imageFile      — selected File for Vision OCR upload
 *  - imagePreview   — object URL for local image preview
 *  - analysisResult — the Arbitrator + Groq response from the backend
 */
import { create } from 'zustand'

export interface AnalysisResult {
  status: 'correct' | 'error_found'
  error_index: number | null
  hint: string | null
}

interface MathState {
  // ── Input mode ────────────────────────────────────────────────────────
  inputMode: 'manual' | 'image'
  setInputMode: (mode: 'manual' | 'image') => void

  // ── Image upload (Vision OCR) ──────────────────────────────────────────
  imageFile: File | null
  imagePreview: string | null
  setImageFile: (file: File | null) => void
  clearImage: () => void

  // ── Step input ─────────────────────────────────────────────────────────
  steps: string[]
  addStep: () => void
  updateStep: (index: number, value: string) => void
  removeStep: (index: number) => void
  clearSteps: () => void

  // ── Analysis result ────────────────────────────────────────────────────
  analysisResult: AnalysisResult | null
  setAnalysisResult: (result: AnalysisResult | null) => void
  clearAnalysis: () => void
}

export const useMathStore = create<MathState>((set, get) => ({
  inputMode: 'manual',
  setInputMode: (mode) => set({ inputMode: mode, analysisResult: null }),

  imageFile: null,
  imagePreview: null,
  setImageFile: (file) => {
    // Revoke previous preview URL to avoid memory leaks
    const prev = get().imagePreview
    if (prev) URL.revokeObjectURL(prev)
    set({
      imageFile: file,
      imagePreview: file ? URL.createObjectURL(file) : null,
      analysisResult: null,
    })
  },
  clearImage: () => {
    const prev = get().imagePreview
    if (prev) URL.revokeObjectURL(prev)
    set({ imageFile: null, imagePreview: null, analysisResult: null })
  },

  steps: ['', ''],

  addStep: () =>
    set((state) => ({ steps: [...state.steps, ''], analysisResult: null })),

  updateStep: (index, value) =>
    set((state) => {
      const steps = [...state.steps]
      steps[index] = value
      return { steps, analysisResult: null }
    }),

  removeStep: (index) =>
    set((state) => ({
      steps: state.steps.length > 2 ? state.steps.filter((_, i) => i !== index) : state.steps,
      analysisResult: null,
    })),

  clearSteps: () => set({ steps: ['', ''], analysisResult: null }),

  analysisResult: null,
  setAnalysisResult: (result) => set({ analysisResult: result }),
  clearAnalysis: () => set({ analysisResult: null }),
}))
