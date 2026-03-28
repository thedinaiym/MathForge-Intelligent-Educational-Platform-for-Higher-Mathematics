import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, ExternalLink, RefreshCw } from 'lucide-react'
import api from '../../lib/axios'
import { useCategories } from '../../hooks/useCategories'
import { useUIStore } from '../../store/uiStore'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'

// ── Loading phase animation ───────────────────────────────────────────────────

const PHASE_INTERVAL_MS = 2800

function usePhaseLabel(isActive: boolean, phases: string[]): string {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    if (!isActive) {
      setPhase(0)
      return
    }
    const id = setInterval(
      () => setPhase((p) => (p + 1) % phases.length),
      PHASE_INTERVAL_MS,
    )
    return () => clearInterval(id)
  }, [isActive, phases.length])

  return phases[phase]
}

// ── Form types ────────────────────────────────────────────────────────────────

type Difficulty = 'easy' | 'medium' | 'hard'

interface GenerateFormData {
  category_id: string
  difficulty: Difficulty
  count: number
}

const schema = yup.object({
  category_id: yup.string().required(),
  difficulty: yup.mixed<Difficulty>().oneOf(['easy', 'medium', 'hard']).required(),
  count: yup.number().min(1).max(50).required(),
})

// ── Component ─────────────────────────────────────────────────────────────────

export default function TeacherGenerator() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { tokenBalance } = useUIStore()
  const { data: categories, isLoading: categoriesLoading } = useCategories()

  // Controlled difficulty picker state — kept in sync with react-hook-form via setValue
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>('medium')

  // Blob URL of the last generated PDF — revoked on new generation or unmount
  const blobUrlRef = useRef<string | null>(null)
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    }
  }, [])

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<GenerateFormData>({
    resolver: yupResolver(schema),
    defaultValues: { difficulty: 'medium', count: 10 },
  })

  const handleDifficultyChange = (d: Difficulty) => {
    setSelectedDifficulty(d)
    setValue('difficulty', d)
  }

  // ── Mutation: POST /tasks/generate/pdf → Blob → object URL ───────────────
  const mutation = useMutation<string, Error, GenerateFormData>({
    mutationFn: async (data) => {
      const response = await api.post('/tasks/generate/pdf', data, {
        responseType: 'blob',
        timeout: 90_000, // pdflatex can be slow on first MiKTeX run
      })

      // Revoke previous URL before creating a new one
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)

      const blob = new Blob([response.data], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      blobUrlRef.current = url
      return url
    },
    onSuccess: () => {
      // Backend deducted 5 tokens — fetch the real balance from the server
      queryClient.invalidateQueries({ queryKey: ['billing', 'balance'] })
    },
  })

  // ── Loading phase labels ──────────────────────────────────────────────────
  const phases = [
    t('teacher.phases.solving'),
    t('teacher.phases.typesetting'),
    t('teacher.phases.preparing'),
  ]
  const activePhaseLabel = usePhaseLabel(mutation.isPending, phases)

  const canGenerate = tokenBalance >= 5

  const handleReset = () => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    mutation.reset()
  }

  const difficultyColors: Record<Difficulty, string> = {
    easy:   'border-green-400 bg-green-50 text-green-700',
    medium: 'border-amber-400 bg-amber-50 text-amber-700',
    hard:   'border-red-400   bg-red-50   text-red-700',
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">{t('teacher.title')}</h1>

      {/* Token warning */}
      {!canGenerate && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {t('teacher.noTokens')}
        </div>
      )}

      {/* Form */}
      <form
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
        className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm space-y-4"
      >
        {/* Category */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">{t('teacher.category')}</label>
          <select
            {...register('category_id')}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm
              focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="">
              {categoriesLoading ? t('common.loading') : t('common.noData')}
            </option>
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

        {/* Difficulty — visual button group, value synced to react-hook-form */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">{t('teacher.difficulty')}</label>
          <div className="flex gap-2">
            {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => handleDifficultyChange(d)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors
                  ${selectedDifficulty === d
                    ? difficultyColors[d]
                    : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
              >
                {t(`teacher.difficulty_${d}`)}
              </button>
            ))}
          </div>
          {/* Hidden input registers the value with react-hook-form */}
          <input type="hidden" {...register('difficulty')} value={selectedDifficulty} />
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

        <Button
          type="submit"
          loading={mutation.isPending}
          disabled={!canGenerate || mutation.isPending}
          className="w-full justify-center"
        >
          {mutation.isPending ? activePhaseLabel : t('teacher.generate')}
        </Button>
      </form>

      {/* ── Loading state (animated bar + phase label) ──────────────────── */}
      {mutation.isPending && (
        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <p className="text-sm font-medium text-amber-800">{activePhaseLabel}</p>
          </div>
          <div className="w-full h-1.5 bg-amber-100 rounded-full overflow-hidden">
            <div className="h-full bg-amber-400 rounded-full animate-pulse" style={{ width: '70%' }} />
          </div>
          <p className="text-xs text-amber-600">
            LaTeX compilation takes 10–30 s on the first run.
          </p>
        </div>
      )}

      {/* ── Success: download / open PDF ────────────────────────────────── */}
      {mutation.isSuccess && mutation.data && (
        <div className="mt-4 p-5 bg-green-50 border border-green-200 rounded-xl">
          <p className="text-sm font-semibold text-green-800 mb-1">{t('teacher.pdfReady')}</p>
          <p className="text-xs text-green-600 mb-4">5 tokens deducted from your balance.</p>

          <div className="flex gap-2">
            <a
              href={mutation.data}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1"
            >
              <Button variant="secondary" className="w-full justify-center">
                <ExternalLink size={14} />
                {t('teacher.openPdf')}
              </Button>
            </a>
            <a
              href={mutation.data}
              download="mathforge_worksheet.pdf"
              className="flex-1"
            >
              <Button className="w-full justify-center">
                <Download size={14} />
                {t('teacher.download')}
              </Button>
            </a>
          </div>

          <button
            onClick={handleReset}
            className="mt-3 flex items-center gap-1.5 text-xs text-green-700 hover:text-green-900 transition-colors"
          >
            <RefreshCw size={12} />
            Generate another worksheet
          </button>
        </div>
      )}

      {/* ── Error state ────────────────────────────────────────────────── */}
      {mutation.isError && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm font-semibold text-red-700 mb-1">{t('common.error')}</p>
          <p className="text-xs text-red-500 font-mono break-all">
            {(mutation.error as Error)?.message ?? 'Unknown error'}
          </p>
          <button
            onClick={handleReset}
            className="mt-2 text-xs text-red-600 hover:text-red-800 underline"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
