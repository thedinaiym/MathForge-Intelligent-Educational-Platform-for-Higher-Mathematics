import { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from './store/authStore'
import { supabase } from './lib/supabase'
import api from './lib/axios'
import type { AuthUser } from './store/authStore'

import DashboardLayout from './components/layout/DashboardLayout'
import HomePage from './pages/HomePage'
import AuthPage from './pages/auth/AuthPage'
import ProfilePage from './pages/shared/ProfilePage'
import BillingPage from './pages/shared/BillingPage'
import StudentAnalyzer from './pages/student/StudentAnalyzer'
import StudentDashboard from './pages/student/StudentDashboard'
import HomeworkChecker from './pages/student/HomeworkChecker'
import PracticePage from './pages/student/PracticePage'
import TeacherGenerator from './pages/teacher/TeacherGenerator'
import LibraryPage from './pages/teacher/LibraryPage'
import AdminDataset from './pages/admin/AdminDataset'
import MathLibraryPage from './pages/shared/MathLibraryPage'
import Dashboard from './pages/shared/Dashboard'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

function ProtectedRoute({
  children,
  roles,
}: {
  children: React.ReactNode
  roles?: string[]
}) {
  const { user, isInitialized } = useAuthStore()

  // Show spinner ONLY when we have no user data at all — i.e. a completely
  // fresh session where we don't yet know if the visitor is authenticated.
  // If `user` is already in the persisted store, render immediately and let
  // AuthSync validate the token in the background (it will logout() on 401).
  if (!isInitialized && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (!user) return <Navigate to="/auth" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/app/profile" replace />
  return <>{children}</>
}

/** Listens to Supabase auth events and syncs with our backend DB */
function AuthSync() {
  const { setUser, logout, setInitialized } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    let initialized = false
    let signedInFallback: ReturnType<typeof setTimeout> | null = null

    // ── Helpers ────────────────────────────────────────────────────────────

    function markInitialized() {
      if (!initialized) {
        initialized = true
        setInitialized()
      }
    }

    /** Strip #access_token=… (and any other hash params) from the address bar. */
    function cleanHash() {
      if (window.location.hash) {
        window.history.replaceState(
          null,
          '',
          window.location.pathname + window.location.search,
        )
      }
    }

    /**
     * Fetch or create the backend user profile.
     * Handles ALL failure modes so the caller never hangs:
     *   - 404 → first login, register with defaults
     *   - 401 → token invalid, logout
     *   - Network error / 5xx → log and logout (cold-start or infra issue)
     */
    async function syncUser(displayName: string) {
      try {
        const { data } = await api.get<AuthUser>('/auth/me')
        setUser(data)
      } catch (err: any) {
        const status: number | undefined = err?.response?.status

        if (status === 404) {
          try {
            const { data } = await api.post<AuthUser>('/auth/register', {
              name: displayName || 'Student',
              role: 'student',
              locale: 'ru',
            })
            setUser(data)
          } catch {
            // Registration also failed (network / 5xx) — app still initializes;
            // user will be prompted to retry on next page load.
          }
        } else if (status === 401) {
          logout()
        } else {
          // No response at all (Network Error) or 5xx (Railway cold-start, crash).
          // Do NOT hang. Log, logout, let ProtectedRoute redirect to /auth.
          console.error(
            '[AuthSync] syncUser failed — status:', status ?? 'network error',
            err?.message,
          )
          logout()
        }
      }
    }

    // ── Safety timeout: force-initialize after 15 s ────────────────────────
    // Catches any path (SIGNED_IN never fires, syncUser hangs, etc.) that
    // would otherwise leave the spinner on screen indefinitely.
    const safetyTimer = setTimeout(() => {
      if (!initialized) {
        console.warn('[AuthSync] 15 s safety timeout — forcing initialization')
        logout()
        markInitialized()
        navigate('/auth?error=timeout', { replace: true })
      }
    }, 15_000)

    // ── Supabase auth state listener ───────────────────────────────────────
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const displayName =
          session?.user.user_metadata?.full_name ??
          session?.user.email ??
          ''

        // ── INITIAL_SESSION ──────────────────────────────────────────────
        if (event === 'INITIAL_SESSION') {
          if (session) {
            // Normal page load with a live session.
            await syncUser(displayName)
            cleanHash()
            clearTimeout(safetyTimer)
            markInitialized()
            return
          }

          if (window.location.hash.includes('access_token')) {
            // OAuth redirect: Supabase JS is still exchanging the hash token.
            // SIGNED_IN should fire within milliseconds on desktop. On some
            // mobile browsers it can be delayed or silently dropped entirely.
            // We wait up to 3 s; if SIGNED_IN never fires, force-process the
            // session ourselves via getSession().
            signedInFallback = setTimeout(async () => {
              console.warn('[AuthSync] SIGNED_IN did not fire within 3 s — calling getSession()')
              try {
                const { data: { session: recovered } } = await supabase.auth.getSession()
                if (recovered) {
                  const name =
                    recovered.user.user_metadata?.full_name ??
                    recovered.user.email ??
                    ''
                  await syncUser(name)
                } else {
                  logout()
                }
              } catch {
                logout()
              }
              cleanHash()
              clearTimeout(safetyTimer)
              markInitialized()
            }, 3_000)

            return // defer initialization — SIGNED_IN or the fallback above will finalize
          }

          // No session, no hash → logged-out page load.
          clearTimeout(safetyTimer)
          markInitialized()
          return
        }

        // ── SIGNED_IN ────────────────────────────────────────────────────
        if (event === 'SIGNED_IN' && session) {
          // Cancel the 3 s fallback if it's still pending.
          if (signedInFallback !== null) {
            clearTimeout(signedInFallback)
            signedInFallback = null
          }

          await syncUser(displayName)
          cleanHash()
          clearTimeout(safetyTimer)

          if (!initialized) {
            markInitialized()
          } else {
            navigate('/app/dashboard', { replace: true })
          }
        }

        // ── SIGNED_OUT ───────────────────────────────────────────────────
        if (event === 'SIGNED_OUT') {
          logout()
          clearTimeout(safetyTimer)
          markInitialized()
        }
      },
    )

    return () => {
      subscription.unsubscribe()
      clearTimeout(safetyTimer)
      if (signedInFallback !== null) clearTimeout(signedInFallback)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthSync />
      <Routes>
        {/* Public */}
        <Route path="/" element={<HomePage />} />
        <Route path="/auth" element={<AuthPage />} />

        {/* Protected dashboard shell */}
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="profile" replace />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="billing" element={<BillingPage />} />

          {/* Student */}
          <Route
            path="student"
            element={
              <ProtectedRoute roles={['student', 'teacher', 'admin']}>
                <StudentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="student/analyze"
            element={
              <ProtectedRoute roles={['student', 'teacher', 'admin']}>
                <StudentAnalyzer />
              </ProtectedRoute>
            }
          />
          <Route
            path="student/homework"
            element={
              <ProtectedRoute roles={['student', 'teacher', 'admin']}>
                <HomeworkChecker />
              </ProtectedRoute>
            }
          />
          <Route
            path="student/practice"
            element={
              <ProtectedRoute roles={['student', 'teacher', 'admin']}>
                <PracticePage />
              </ProtectedRoute>
            }
          />

          {/* Teacher */}
          <Route
            path="teacher"
            element={
              <ProtectedRoute roles={['teacher', 'admin']}>
                <TeacherGenerator />
              </ProtectedRoute>
            }
          />
          <Route
            path="teacher/library"
            element={
              <ProtectedRoute roles={['teacher', 'admin']}>
                <LibraryPage />
              </ProtectedRoute>
            }
          />

          {/* Dashboard — accessible to all authenticated users */}
          <Route path="dashboard" element={<Dashboard />} />

          {/* Math Library — accessible to all authenticated users */}
          <Route path="math-library" element={<MathLibraryPage />} />

          {/* Admin */}
          <Route
            path="admin"
            element={
              <ProtectedRoute roles={['admin', 'teacher']}>
                <AdminDataset />
              </ProtectedRoute>
            }
          />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </QueryClientProvider>
  )
}
