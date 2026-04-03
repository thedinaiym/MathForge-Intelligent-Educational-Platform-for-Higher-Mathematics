import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { useMutation } from '@tanstack/react-query'
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

const schema = yup.object({
  name: yup.string().min(2).required(),
  role: yup.mixed<UserRole>().oneOf(['student', 'teacher', 'admin']).required(),
  locale: yup.mixed<UserLocale>().oneOf(['en', 'ru', 'kg']).required(),
})

export default function ProfilePage() {
  const { t } = useTranslation()
  const { user, setUser } = useAuthStore()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfileFormData>({
    resolver: yupResolver(schema),
    defaultValues: { 
      name: user?.name ?? '', 
      role: user?.role ?? 'student', 
      locale: user?.locale ?? 'ru' 
    },
  })

  // ИСПРАВЛЕНИЕ: Добавлены `??` для защиты от null значений из базы
  useEffect(() => {
    if (user) {
      reset({ 
        name: user.name ?? '', 
        role: user.role ?? 'student', 
        locale: user.locale ?? 'ru' 
      })
    }
  }, [user, reset])

  const mutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const resp = await api.patch('/auth/me', data)
      return resp.data
    },
    onSuccess: (data) => {
      setUser({ id: data.id, name: data.name, role: data.role, locale: data.locale })
      // Sync UI language immediately — no reload needed
      i18n.changeLanguage(data.locale)
      localStorage.setItem('mathforge_lang', data.locale)
    },
  })

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">{t('profile.title')}</h1>

      <form
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
        className="bg-white rounded-xl p-6 border border-slate-100 space-y-4"
      >
        <Input
          {...register('name')}
          label={t('profile.name')}
          error={errors.name?.message}
        />

        {/* Role select */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">{t('profile.role')}</label>
          <select
            {...register('role')}
            className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 ${
              errors.role ? 'border-red-500' : 'border-slate-300'
            }`}
          >
            <option value="student">{t('profile.role_student')}</option>
            <option value="teacher">{t('profile.role_teacher')}</option>
            <option value="admin">Admin</option>
          </select>
          {/* ИСПРАВЛЕНИЕ: Отображение ошибки под селектом */}
          {errors.role && <p className="text-sm text-red-500">{errors.role.message}</p>}
        </div>

        {/* Locale select */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">{t('profile.locale')}</label>
          <select
            {...register('locale')}
            className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 ${
              errors.locale ? 'border-red-500' : 'border-slate-300'
            }`}
          >
            <option value="ru">Русский</option>
            <option value="en">English</option>
            <option value="kg">Кыргызча</option>
          </select>
          {/* ИСПРАВЛЕНИЕ: Отображение ошибки под селектом */}
          {errors.locale && <p className="text-sm text-red-500">{errors.locale.message}</p>}
        </div>

        <Button type="submit" loading={mutation.isPending} disabled={mutation.isPending}>
          {mutation.isSuccess ? t('profile.saved') : t('profile.save')}
        </Button>

        {mutation.isError && (
          <p className="text-sm text-red-500">{t('common.error')}</p>
        )}
      </form>
    </div>
  )
}