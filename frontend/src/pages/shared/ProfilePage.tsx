import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Users } from 'lucide-react'
import api from '../../lib/axios'
import { useAuthStore, type UserLocale, type UserRole } from '../../store/authStore'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import i18n from '../../i18n'

interface ProfileFormData {
  name: string
  role: UserRole
  locale: UserLocale
}

// 'admin' is kept in the backend but hidden from the UI.
const schema = yup.object({
  name: yup.string().min(2).required(),
  role: yup.mixed<UserRole>().oneOf(['student', 'teacher']).required(),
  locale: yup.mixed<UserLocale>().oneOf(['en', 'ru', 'kg']).required(),
})

// ── Student: join a class ──────────────────────────────────────────────────────

function JoinClassPanel() {
  const { t } = useTranslation()
  const [teacherId, setTeacherId] = useState('')
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleJoin = async () => {
    if (!teacherId.trim()) return
    setLoading(true)
    setSuccess(null)
    setError(null)
    try {
      const { data } = await api.post('/teachers/join-class', { teacher_id: teacherId.trim() })
      setSuccess(t('profile.joinClassSuccess', { name: data.teacher_name }))
      setTeacherId('')
    } catch {
      setError(t('profile.joinClassError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl p-6 border border-slate-100 space-y-3">
      <h2 className="text-base font-semibold text-slate-700">{t('profile.joinClass')}</h2>
      <p className="text-xs text-slate-400">{t('profile.joinClassHint')}</p>
      <div className="flex gap-2">
        <input
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
          placeholder={t('profile.joinClassPlaceholder')}
          className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <button
          onClick={handleJoin}
          disabled={loading || !teacherId.trim()}
          className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
        >
          {loading ? '…' : t('profile.joinClassBtn')}
        </button>
      </div>
      {success && <p className="text-sm text-emerald-600 font-medium">{success}</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}

// ── Teacher: share ID + view students ─────────────────────────────────────────

interface StudentSummary {
  student_id: string
  student_name: string
  mastery: { category_name: string; mastery_level: number; last_error_type: string | null }[]
}

function TeacherPanel({ userId }: { userId: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const { data: students = [], isLoading } = useQuery<StudentSummary[]>({
    queryKey: ['teacher', 'students'],
    queryFn: async () => {
      const { data } = await api.get('/teachers/my-students')
      return data
    },
    staleTime: 30_000,
  })

  const handleCopy = () => {
    navigator.clipboard.writeText(userId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      {/* Share ID */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
        <p className="text-xs font-semibold text-amber-700">{t('profile.yourTeacherId')}</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-white border border-amber-200 rounded-lg px-3 py-2 text-slate-700 font-mono break-all">
            {userId}
          </code>
          <button
            onClick={handleCopy}
            className="flex-shrink-0 p-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors"
            title="Copy"
          >
            <Copy size={14} />
          </button>
        </div>
        {copied && <p className="text-xs text-emerald-600">Copied!</p>}
      </div>

      {/* Student roster */}
      <div className="bg-white rounded-xl border border-slate-100 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users size={16} className="text-amber-500" />
          <h2 className="text-base font-semibold text-slate-700">{t('profile.myStudents')}</h2>
          {students.length > 0 && (
            <span className="ml-auto text-xs text-slate-400">{students.length} students</span>
          )}
        </div>

        {isLoading && (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && students.length === 0 && (
          <p className="text-sm text-slate-400">{t('profile.noStudents')}</p>
        )}

        {!isLoading && students.length > 0 && (
          <div className="space-y-3">
            {students.map((s) => (
              <div key={s.student_id} className="border border-slate-100 rounded-xl p-4">
                <p className="font-semibold text-slate-800 text-sm mb-2">{s.student_name}</p>
                {s.mastery.length === 0 ? (
                  <p className="text-xs text-slate-400">No activity yet</p>
                ) : (
                  <div className="space-y-1.5">
                    {s.mastery.map((m) => {
                      const pct = Math.min(m.mastery_level, 100)
                      const colour =
                        pct >= 75 ? 'bg-emerald-500' :
                        pct >= 50 ? 'bg-amber-500' :
                        pct >= 25 ? 'bg-orange-500' : 'bg-red-500'
                      return (
                        <div key={m.category_name}>
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-slate-600">{m.category_name}</span>
                            <span className="text-slate-400 font-mono">{pct.toFixed(0)}%</span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${colour}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Skeleton shown while user record loads ────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div className="max-w-lg space-y-6 animate-pulse">
      <div className="h-8 w-40 bg-slate-200 rounded-lg" />
      <div className="bg-white rounded-xl p-6 border border-slate-100 space-y-4">
        <div className="space-y-2">
          <div className="h-4 w-24 bg-slate-200 rounded" />
          <div className="h-10 bg-slate-100 rounded-lg" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-16 bg-slate-200 rounded" />
          <div className="h-10 bg-slate-100 rounded-lg" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-28 bg-slate-200 rounded" />
          <div className="h-10 bg-slate-100 rounded-lg" />
        </div>
        <div className="h-10 w-36 bg-amber-100 rounded-lg" />
      </div>
      <div className="bg-white rounded-xl p-6 border border-slate-100 space-y-3">
        <div className="h-5 w-32 bg-slate-200 rounded" />
        <div className="h-4 w-64 bg-slate-100 rounded" />
        <div className="h-10 bg-slate-100 rounded-lg" />
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { t } = useTranslation()
  const { user, setUser } = useAuthStore()

  // Bug 1 fix: locale must reflect the ACTIVE i18n language, not the DB value.
  // The DB locale and the sidebar language picker can diverge (e.g., user switched
  // language in the sidebar but hasn't saved the profile yet).
  const activeLocale = (i18n.resolvedLanguage ?? i18n.language ?? user?.locale ?? 'ru') as UserLocale

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfileFormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      name:   user?.name   ?? '',
      role:   (user?.role === 'admin' ? 'teacher' : user?.role) ?? 'student',
      locale: activeLocale,
    },
  })

  // Re-sync the form whenever the user record or the active i18n language changes
  useEffect(() => {
    if (user) {
      const lang = (i18n.resolvedLanguage ?? i18n.language ?? user.locale ?? 'ru') as UserLocale
      reset({
        name:   user.name ?? '',
        role:   (user.role === 'admin' ? 'teacher' : user.role) ?? 'student',
        locale: lang,
      })
    }
  }, [user, i18n.language, i18n.resolvedLanguage, reset])

  const mutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const resp = await api.patch('/auth/me', data)
      return resp.data
    },
    onMutate: (data) => {
      // Snapshot BEFORE update so onError can properly revert
      const snapshot = user ? { ...user } : null
      if (user) setUser({ ...user, name: data.name, role: data.role, locale: data.locale })
      i18n.changeLanguage(data.locale)
      localStorage.setItem('mathforge_lang', data.locale)
      return snapshot
    },
    onSuccess: (data) => {
      setUser({ id: data.id, name: data.name, role: data.role, locale: data.locale })
    },
    onError: (_err, _vars, snapshot) => {
      // Revert store and form to the snapshotted state (before optimistic update)
      if (snapshot) {
        setUser(snapshot)
        const revertLocale = ((snapshot as any).locale ?? 'ru') as UserLocale
        reset({
          name:   (snapshot as any).name   ?? '',
          role:   ((snapshot as any).role === 'admin' ? 'teacher' : (snapshot as any).role) ?? 'student',
          locale: revertLocale,
        })
        i18n.changeLanguage(revertLocale)
        localStorage.setItem('mathforge_lang', revertLocale)
      }
    },
  })

  const isTeacher = user?.role === 'teacher' || user?.role === 'admin'  // admin keeps teacher panel
  const isStudent = user?.role === 'student'

  if (!user) return <ProfileSkeleton />

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">{t('profile.title')}</h1>

      {/* Profile form */}
      <form
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
        className="bg-white rounded-xl p-6 border border-slate-100 space-y-4"
      >
        <Input
          {...register('name')}
          label={t('profile.name')}
          error={errors.name?.message}
          disabled={mutation.isPending}
        />

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">{t('profile.role')}</label>
          <select
            {...register('role')}
            disabled={mutation.isPending}
            className={`w-full pl-3 pr-8 py-2 rounded-lg border text-sm cursor-pointer
              focus:outline-none focus:ring-2 focus:ring-amber-400
              disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed ${
              errors.role ? 'border-red-500' : 'border-slate-300'
            }`}
          >
            <option value="student">{t('profile.role_student')}</option>
            <option value="teacher">{t('profile.role_teacher')}</option>
          </select>
          {errors.role && <p className="text-sm text-red-500">{errors.role.message}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">{t('profile.locale')}</label>
          <select
            {...register('locale')}
            disabled={mutation.isPending}
            className={`w-full pl-3 pr-8 py-2 rounded-lg border text-sm cursor-pointer
              focus:outline-none focus:ring-2 focus:ring-amber-400
              disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed ${
              errors.locale ? 'border-red-500' : 'border-slate-300'
            }`}
          >
            <option value="ru">Русский</option>
            <option value="en">English</option>
            <option value="kg">Кыргызча</option>
          </select>
          {errors.locale && <p className="text-sm text-red-500">{errors.locale.message}</p>}
        </div>

        <Button type="submit" loading={mutation.isPending} disabled={mutation.isPending}>
          {mutation.isSuccess ? '✓ ' + t('profile.saved') : t('profile.save')}
        </Button>

        {mutation.isError && (
          <p className="text-sm text-red-500">
            {String((mutation.error as any)?.response?.data?.detail ?? t('profile.saveError', 'Ошибка сохранения — попробуйте ещё раз'))}
          </p>
        )}
      </form>

      {/* Student: join a class */}
      {isStudent && <JoinClassPanel />}

      {/* Teacher/admin: share ID + view students */}
      {isTeacher && user?.id && <TeacherPanel userId={user.id} />}
    </div>
  )
}
