/**
 * Axios instance — the single HTTP contract between frontend and FastAPI.
 *
 * Guarantees on every request:
 *   1. baseURL   → VITE_API_URL (prod) or http://127.0.0.1:8000/api (local)
 *   2. Accept-Language → current i18next language (en | ru | kg)
 *   3. Authorization  → Bearer <supabase_access_token>  (when logged in)
 *
 * Guarantee on every response:
 *   4. 401 → sign out via Supabase, which fires SIGNED_OUT in App.tsx →
 *            AuthSync calls logout() → ProtectedRoute redirects to /auth.
 *            No circular imports; no direct router access needed here.
 */
import axios from 'axios'
import i18n from '../i18n'
import { supabase } from './supabase'

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://127.0.0.1:8000/api',
  headers: { 'Content-Type': 'application/json' },
  // 15 s covers the full OCR pipeline (Vision → Arbitrator → Groq hint).
  // Manual-entry calls are far faster; this timeout only matters for images.
  timeout: 15_000,
})

// ── Request interceptor ───────────────────────────────────────────────────────

api.interceptors.request.use(async (config) => {
  // i18n locale → Accept-Language (backend resolves JSONB translations from this)
  config.headers['Accept-Language'] = i18n.language || 'ru'

  // Supabase session is cached in memory; getSession() is non-blocking after init
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    config.headers['Authorization'] = `Bearer ${session.access_token}`
  }

  return config
})

// ── Response interceptor ──────────────────────────────────────────────────────

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token is expired or invalid. Sign out of Supabase — this fires the
      // SIGNED_OUT auth-state event which AuthSync in App.tsx handles by
      // calling logout() and letting ProtectedRoute redirect to /auth.
      await supabase.auth.signOut()
    }
    return Promise.reject(error)
  },
)

export default api
