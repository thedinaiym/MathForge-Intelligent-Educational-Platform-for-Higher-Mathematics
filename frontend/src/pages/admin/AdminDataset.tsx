import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, FlaskConical, Star } from 'lucide-react'
import api from '../../lib/axios'
import Button from '../../components/ui/Button'

interface Template {
  id: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  is_active: boolean
  topic: string
}

interface RatingStats {
  total: number
  average: number
  distribution: Record<string, number>
}

async function fetchTemplates(): Promise<Template[]> {
  const { data } = await api.get<Template[]>('/tasks/templates/list')
  return data
}

async function fetchRatingStats(): Promise<RatingStats> {
  const { data } = await api.get<RatingStats>('/ratings/stats')
  return data
}

function RatingStatsCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'ratings'],
    queryFn: fetchRatingStats,
    staleTime: 60_000,
  })

  if (isLoading) return (
    <div className="h-24 bg-slate-100 rounded-2xl animate-pulse mb-6" />
  )
  if (!data) return null

  const max = Math.max(...Object.values(data.distribution), 1)

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Star size={18} className="text-amber-400 fill-amber-400" />
        <h2 className="font-semibold text-slate-800">Рейтинг платформы</h2>
        <span className="ml-auto text-2xl font-bold text-amber-500">{data.average.toFixed(1)}</span>
        <span className="text-sm text-slate-400">/ 5 · {data.total} отзывов</span>
      </div>

      <div className="space-y-1.5">
        {[5, 4, 3, 2, 1].map(star => {
          const count = data.distribution[String(star)] ?? 0
          const pct   = data.total ? Math.round((count / data.total) * 100) : 0
          return (
            <div key={star} className="flex items-center gap-2 text-xs">
              <span className="w-3 text-slate-500 text-right">{star}</span>
              <Star size={11} className="text-amber-400 fill-amber-400 flex-shrink-0" />
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400 rounded-full transition-all"
                  style={{ width: `${max ? (count / max) * 100 : 0}%` }}
                />
              </div>
              <span className="w-6 text-slate-500 text-right">{count}</span>
              <span className="w-8 text-slate-400 text-right">{pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function AdminDataset() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['admin', 'templates'],
    queryFn: fetchTemplates,
  })

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/admin/approve/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'templates'] }),
  })

  const difficultyBadge = (d: Template['difficulty']) => {
    const colors = { easy: 'bg-green-100 text-green-700', medium: 'bg-amber-100 text-amber-700', hard: 'bg-red-100 text-red-700' }
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[d]}`}>
        {t(`admin.difficulty.${d}`)}
      </span>
    )
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">{t('admin.title')}</h1>

      <RatingStatsCard />

      {isLoading ? (
        <p className="text-slate-400">{t('common.loading')}</p>
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-xl p-8 border border-slate-100 text-center text-slate-400">
          <p>{t('common.noData')}</p>
          <p className="text-xs mt-1">Use the Library page to parse textbooks and generate templates.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="bg-white rounded-xl p-4 border border-slate-100 flex items-center justify-between"
            >
              <div>
                <p className="font-medium text-slate-800">{tpl.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  {difficultyBadge(tpl.difficulty)}
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      tpl.is_active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {tpl.is_active ? t('admin.status.approved') : t('admin.status.draft')}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  title={t('admin.test')}
                >
                  <FlaskConical size={14} />
                </Button>
                {!tpl.is_active && (
                  <Button
                    size="sm"
                    onClick={() => approveMutation.mutate(tpl.id)}
                    loading={approveMutation.isPending}
                  >
                    <CheckCircle size={14} /> {t('admin.approve')}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
