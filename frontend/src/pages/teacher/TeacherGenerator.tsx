import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { useMutation } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import api from '../../lib/axios'
import { useCategories } from '../../hooks/useCategories'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'

interface GenerateFormData {
  category_id: string
  difficulty: 'easy' | 'medium' | 'hard'
  count: number
}

const schema = yup.object({
  category_id: yup.string().required(),
  difficulty: yup.mixed<'easy' | 'medium' | 'hard'>().oneOf(['easy', 'medium', 'hard']).required(),
  count: yup.number().min(1).max(50).required(),
})

export default function TeacherGenerator() {
  const { t } = useTranslation()
  const { data: categories, isLoading: categoriesLoading } = useCategories()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<GenerateFormData>({
    resolver: yupResolver(schema),
    defaultValues: { difficulty: 'medium', count: 10 },
  })

  const mutation = useMutation<{ pdf_url: string | null }, Error, GenerateFormData>({
    mutationFn: async (data) => {
      const { data: resp } = await api.post('/tasks/generate', data)
      return resp
    },
  })

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">{t('teacher.title')}</h1>

      <form
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
        className="bg-white rounded-xl p-6 border border-slate-100 space-y-4"
      >
        {/* Category */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">{t('teacher.category')}</label>
          <select
            {...register('category_id')}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="">{categoriesLoading ? t('common.loading') : t('common.noData')}</option>
            {categories?.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          {errors.category_id && (
            <p className="text-xs text-red-500">{errors.category_id.message}</p>
          )}
        </div>

        {/* Difficulty */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">{t('teacher.difficulty')}</label>
          <select
            {...register('difficulty')}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="easy">{t('teacher.difficulty_easy')}</option>
            <option value="medium">{t('teacher.difficulty_medium')}</option>
            <option value="hard">{t('teacher.difficulty_hard')}</option>
          </select>
        </div>

        {/* Count */}
        <Input
          {...register('count', { valueAsNumber: true })}
          type="number"
          label={t('teacher.questionCount')}
          hint={t('teacher.questionCountHint')}
          min={1}
          max={50}
          error={errors.count?.message}
        />

        <Button type="submit" loading={mutation.isPending} className="w-full justify-center">
          {mutation.isPending ? t('teacher.generating') : t('teacher.generate')}
        </Button>
      </form>

      {/* Download result */}
      {mutation.isSuccess && mutation.data?.pdf_url && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center justify-between">
          <span className="text-sm text-green-700">PDF ready!</span>
          <a href={mutation.data.pdf_url} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="primary">
              <Download size={14} /> {t('teacher.download')}
            </Button>
          </a>
        </div>
      )}

      {mutation.isError && (
        <p className="mt-4 text-sm text-red-500">{t('common.error')}</p>
      )}
    </div>
  )
}
