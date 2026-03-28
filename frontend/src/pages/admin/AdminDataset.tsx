import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, FlaskConical } from 'lucide-react'
import api from '../../lib/axios'
import Button from '../../components/ui/Button'

interface Template {
  id: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  is_active: boolean
  topic: string
}

async function fetchTemplates(): Promise<Template[]> {
  const { data } = await api.get<Template[]>('/tasks/templates/list')
  return data
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
