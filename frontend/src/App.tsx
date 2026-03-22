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
import TeacherGenerator from './pages/teacher/TeacherGenerator'
import LibraryPage from './pages/teacher/LibraryPage'
import AdminDataset from './pages/admin/AdminDataset'

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
  // Wait for session check to finish before deciding to redirect
  if (!isInitialized) {
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

    async function syncUser(displayName: string) {
      try {
        const { data } = await api.get<AuthUser>('/auth/me')
        setUser(data)
      } catch (err: any) {
        const status = err?.response?.status
        if (status === 404) {
          // First login — register with defaults
          try {
            const { data } = await api.post<AuthUser>('/auth/register', {
              name: displayName || 'Student',
              role: 'student',
              locale: 'ru',
            })
            setUser(data)
          } catch {
            // registration failed — keep any persisted user
          }
        } else if (status === 401) {
          // Token invalid — clear stale persisted user so they must re-login
          logout()
        }
        // For network errors (backend down): keep existing persisted user from localStorage
      }
    }

    // Subscribe first so we don't miss the SIGNED_IN event from code exchange
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const displayName = session?.user.user_metadata?.full_name
          ?? session?.user.email
          ?? ''

        if (event === 'INITIAL_SESSION') {
          // Always fires first — unblock ProtectedRoute immediately
          initialized = true
          setInitialized()
          // Sync user in background (don't block the page)
          if (session) syncUser(displayName)
          return
        }

        if (event === 'SIGNED_IN' && session) {
          if (!initialized) {
            // SIGNED_IN fired before INITIAL_SESSION (rare) — unblock immediately
            initialized = true
            setInitialized()
            syncUser(displayName)   // non-blocking: page shows with persisted user
          } else {
            // Fresh OAuth callback — sync then navigate
            await syncUser(displayName)
            navigate('/app/profile', { replace: true })
          }
        }

        if (event === 'SIGNED_OUT') {
          logout()
          if (!initialized) { initialized = true; setInitialized() }
        }
      },
    )

    return () => subscription.unsubscribe()
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
              <ProtectedRoute roles={['student']}>
                <StudentAnalyzer />
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
