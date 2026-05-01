import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from './store/authStore'
import { supabase } from './lib/supabase'
import api from './lib/axios'
import type { AuthUser } from './store/authStore'
import RatingModal from './components/ui/RatingModal'

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
import TeacherClassrooms from './pages/teacher/TeacherClassrooms'
import TeacherLessons from './pages/teacher/TeacherLessons'
import StudentLessons from './pages/student/StudentLessons'
import StudentPracticePDF from './pages/student/StudentPracticePDF'
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
     *
     * Strategy:
     *   - 200       → set user from backend
     *   - 404       → first login, register with defaults
     *   - 401       → token invalid, logout (only case we block the user)
     *   - Network / 5xx (Railway cold-start) → let user in immediately with
     *               a minimal profile built from the Supabase session, then
     *               retry the backend sync in the background so role/locale
     *               are correct once Railway wakes up.
     */
    async function syncUser(displayName: string) {
      const MAX_BG_ATTEMPTS = 6
      const BG_RETRY_MS     = 8_000

      async function _tryFetch(): Promise<'ok' | 'not_found' | 'unauthorized' | 'network'> {
        try {
          const { data } = await api.get<AuthUser>('/auth/me')
          setUser(data)
          return 'ok'
        } catch (err: any) {
          const status: number | undefined = err?.response?.status
          if (status === 404) return 'not_found'
          if (status === 401) return 'unauthorized'
          return 'network'
        }
      }

      const result = await _tryFetch()

      if (result === 'ok') return

      if (result === 'not_found') {
        try {
          const { data } = await api.post<AuthUser>('/auth/register', {
            name: displayName || 'Student',
            role: 'student',
            locale: 'ru',
          })
          setUser(data)
        } catch {/* registration failed — background retry will fix it */}
        return
      }

      if (result === 'unauthorized') {
        logout()
        return
      }

      // Network / 5xx — Railway is cold-starting.
      // Let the user in immediately with session data, sync in background.
      console.warn('[AuthSync] Backend unreachable — letting user in with session fallback')
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      if (currentSession?.user) {
        setUser({
          id:     currentSession.user.id,
          name:   displayName || currentSession.user.email || 'Student',
          role:   'student',
          locale: 'ru',
        } as AuthUser)
      }

      // Background sync — retry until Railway wakes up
      ;(async () => {
        for (let i = 1; i <= MAX_BG_ATTEMPTS; i++) {
          await new Promise(r => setTimeout(r, BG_RETRY_MS * i))
          const bg = await _tryFetch()
          if (bg === 'ok' || bg === 'unauthorized') break
          if (bg === 'not_found') {
            try {
              const { data } = await api.post<AuthUser>('/auth/register', {
                name: displayName || 'Student',
                role: 'student',
                locale: 'ru',
              })
              setUser(data)
            } catch { /* ignore */ }
            break
          }
        }
      })()
    }

    // ── Safety timeout: force-initialize after 12 s ───────────────────────
    // syncUser now lets the user in immediately on network errors,
    // so 12 s is enough for the Supabase session exchange + one fast API try.
    const safetyTimer = setTimeout(() => {
      if (!initialized) {
        console.warn('[AuthSync] 12 s safety timeout — forcing initialization')
        markInitialized()
        if (window.location.pathname === '/auth') {
          navigate('/app/dashboard', { replace: true })
        }
      }
    }, 12_000)

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
            // Check BEFORE cleanHash() erases it
            const cameFromOAuth = window.location.hash.includes('access_token')
            await syncUser(displayName)
            cleanHash()
            clearTimeout(safetyTimer)
            markInitialized()
            // After OAuth redirect the page is still at /auth — send to dashboard
            if (cameFromOAuth || window.location.pathname === '/auth') {
              navigate('/app/dashboard', { replace: true })
            }
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
              navigate('/app/dashboard', { replace: true })
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
          markInitialized()
          navigate('/app/dashboard', { replace: true })
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
/** Shows the rating modal once per user, 4 s after first login. */
function RatingPrompt() {
  const { user } = useAuthStore()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!user) return
    const key = `mathforge_rated_${user.id}`
    if (localStorage.getItem(key)) return
    const timer = setTimeout(() => setShow(true), 4_000)
    return () => clearTimeout(timer)
  }, [user])

  if (!show || !user) return null

  function close() {
    if (!user) return
    localStorage.setItem(`mathforge_rated_${user.id}`, '1')
    setShow(false)
  }

  return <RatingModal onClose={close} />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthSync />
      <RatingPrompt />
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
          <Route
            path="teacher/classes"
            element={
              <ProtectedRoute roles={['teacher', 'admin']}>
                <TeacherClassrooms />
              </ProtectedRoute>
            }
          />
          <Route
            path="teacher/lessons"
            element={
              <ProtectedRoute roles={['teacher', 'admin']}>
                <TeacherLessons />
              </ProtectedRoute>
            }
          />
          <Route
            path="student/lessons"
            element={
              <ProtectedRoute roles={['student', 'teacher', 'admin']}>
                <StudentLessons />
              </ProtectedRoute>
            }
          />
          <Route
            path="student/practice-pdf"
            element={
              <ProtectedRoute roles={['student', 'teacher', 'admin']}>
                <StudentPracticePDF />
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
