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
            // registration failed
          }
        } else if (status === 401) {
          logout()
        }
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const displayName = session?.user.user_metadata?.full_name 
          ?? session?.user.email 
          ?? ''

        if (event === 'INITIAL_SESSION') {
          if (session) {
            // ИСПРАВЛЕНИЕ: Ждем получения профиля ПЕРЕД снятием загрузочного экрана
            await syncUser(displayName) 
          }
          initialized = true
          setInitialized() // Только теперь роутер проверит наличие юзера
          return
        }

        if (event === 'SIGNED_IN' && session) {
          // ИСПРАВЛЕНИЕ: Ждем синхронизации
          await syncUser(displayName)
          
          if (!initialized) {
            initialized = true
            setInitialized()
          } else {
            // Это редирект после успешного логина
            navigate('/app/profile', { replace: true })
          }
        }

        if (event === 'SIGNED_OUT') {
          logout()
          if (!initialized) {
            initialized = true
            setInitialized()
          }
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
