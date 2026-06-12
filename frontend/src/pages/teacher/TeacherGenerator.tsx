/**
 * TeacherGenerator — Phase 14 implementation.
 *
 * Cascading form:
 *   1. Subject  (category_id   — from /tasks/categories)
 *   2. Topic    (template_id   — from /tasks/templates?category_id=…)
 *   3. Difficulty
 *   4. Questions per variant   (count)
 *   5. Number of variants      (variant_count)
 *
 * Generates POST /tasks/generate/pdf → multi-variant PDF with solutions appendix.
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, ExternalLink, RefreshCw } from 'lucide-react'
import api from '../../lib/axios'
import { useCategories } from '../../hooks/useCategories'
import { useBalance } from '../../hooks/useBalance'
import { useUIStore } from '../../store/uiStore'
import Button from '../../components/ui/Button'
import { downloadPdfUrl, openPdfUrl } from '../../lib/pdfActions'

// ── Types ─────────────────────────────────────────────────────────────────────

type Difficulty = 'easy' | 'medium' | 'hard'

interface TemplateInfo {
  id: string
  title: string
  difficulty: Difficulty
}

interface FormState {
  category_id: string
  template_ids: string[]     // empty = all topics
  difficulty: Difficulty
  count: number
  variant_count: number
}

// ── Loading phase animation ───────────────────────────────────────────────────

const PHASE_MS = 2800

function usePhaseLabel(active: boolean, phases: string[]): string {
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    if (!active) { setPhase(0); return }
    const id = setInterval(() => setPhase((p) => (p + 1) % phases.length), PHASE_MS)
    return () => clearInterval(id)
  }, [active, phases.length])
  return phases[phase]
}

// ── Select helper ─────────────────────────────────────────────────────────────

function SelectField({
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm
                   focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400
                   disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed
                   transition-colors"
      >
        {children}
      </select>
    </div>
  )
}

// ── Number input ──────────────────────────────────────────────────────────────

function NumberField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
}: {
  label: string
  hint?: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Math.max(min, Math.min(max, Number(e.target.value) || min))
          onChange(n)
        }}
        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm
                   focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400
                   transition-colors"
      />
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

// ── Difficulty pill group ─────────────────────────────────────────────────────

const DIFF_STYLES: Record<Difficulty, string> = {
  easy:   'border-green-400 bg-green-50 text-green-700',
  medium: 'border-amber-400 bg-amber-50 text-amber-700',
  hard:   'border-red-400   bg-red-50   text-red-700',
}

function DifficultyPicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: Difficulty
  onChange: (d: Difficulty) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      <div className="flex gap-2">
        {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors
              ${value === d ? DIFF_STYLES[d] : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
          >
            {t(`teacher.difficulty_${d}`)}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function TeacherGenerator() {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'ru'
  const queryClient = useQueryClient()
  const { tokenBalance } = useUIStore()
  const { isLoading: balanceLoading } = useBalance()

  const [form, setForm] = useState<FormState>({
    category_id: '',
    template_ids: [],
    difficulty: 'medium',
    count: 10,
    variant_count: 1,
  })

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  // Reset topics when category changes
  const handleCategoryChange = (id: string) => {
    setForm((prev) => ({ ...prev, category_id: id, template_ids: [] }))
  }

  // Toggle a single template in multi-select
  const toggleTemplate = (id: string) => {
    setForm((prev) => {
      const has = prev.template_ids.includes(id)
      return {
        ...prev,
        template_ids: has
          ? prev.template_ids.filter((t) => t !== id)
          : [...prev.template_ids, id],
      }
    })
  }

  const selectAllTopics = () =>
    setForm((prev) => ({ ...prev, template_ids: topicOptions.map((t) => t.id) }))
  const clearTopics = () =>
    setForm((prev) => ({ ...prev, template_ids: [] }))

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: categories = [], isLoading: loadingCats } = useCategories()

  const { data: templates = [], isLoading: loadingTemplates } = useQuery<TemplateInfo[]>({
    queryKey: ['templates', form.category_id, locale],
    queryFn: async () => {
      const { data } = await api.get<TemplateInfo[]>('/tasks/templates', {
        params: { category_id: form.category_id },
      })
      return data
    },
    enabled: !!form.category_id,
    staleTime: 5 * 60_000,
  })

  // Filter templates to match selected difficulty
  const topicOptions = templates.filter(
    (tmpl) =>
      tmpl.difficulty === form.difficulty ||
      templates.every((t2) => t2.difficulty !== form.difficulty),
  )

  // ── PDF mutation ───────────────────────────────────────────────────────────
  const blobUrlRef = useRef<string | null>(null)
  useEffect(() => () => { if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current) }, [])

  const mutation = useMutation<string, Error>({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        category_id: form.category_id,
        difficulty: form.difficulty,
        count: form.count,
        variant_count: form.variant_count,
      }
      if (form.template_ids.length > 0) payload.template_ids = form.template_ids

      const response = await api.post('/tasks/generate/pdf', payload, {
        responseType: 'blob',
        timeout: 120_000,
      })

      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
      const blob = new Blob([response.data], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      blobUrlRef.current = url
      return url
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'balance'] })
    },
  })

  const phases = [
    t('teacher.phases.solving'),
    t('teacher.phases.typesetting'),
    t('teacher.phases.preparing'),
  ]
  const phaseLabel = usePhaseLabel(mutation.isPending, phases)

  const canGenerate = (balanceLoading || tokenBalance >= 5) && !!form.category_id && !mutation.isPending

  const handleReset = () => {
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null }
    mutation.reset()
    setForm((prev) => ({ ...prev, template_ids: [] }))
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">{t('teacher.title')}</h1>
      <p className="text-sm text-slate-500 mb-6">{t('teacher.subtitle')}</p>

      {!balanceLoading && tokenBalance < 5 && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          {t('teacher.noTokens')}
        </div>
      )}

      {/* ── Form card ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">

        {/* Step 1 — Subject */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center">1</span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('teacher.stepSubject')}</span>
          </div>
          <SelectField
            label={t('teacher.category')}
            value={form.category_id}
            onChange={handleCategoryChange}
          >
            <option value="">{loadingCats ? t('common.loading') : t('teacher.selectCategory')}</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </SelectField>
        </div>

        {/* Step 2 — Difficulty */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center">2</span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('teacher.stepDifficulty')}</span>
          </div>
          <DifficultyPicker
            label={t('teacher.difficulty')}
            value={form.difficulty}
            onChange={(d) => { set('difficulty', d); set('template_ids', []) }}
          />
        </div>

        {/* Step 3 — Topic multi-select (cascades from category) */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
              form.category_id ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'
            }`}>3</span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('teacher.stepTopic')}</span>
          </div>

          {!form.category_id ? (
            <p className="text-sm text-slate-400 px-1">{t('teacher.selectSubjectFirst')}</p>
          ) : loadingTemplates ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-9 bg-slate-100 rounded-lg animate-pulse" />)}
            </div>
          ) : topicOptions.length === 0 ? (
            <p className="text-sm text-slate-400 px-1">{t('teacher.noTopics')}</p>
          ) : (
            <>
              {/* Select all / none */}
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs text-slate-500 font-medium">
                  {form.template_ids.length === 0
                    ? t('teacher.allTopicsSelected')
                    : t('teacher.selectedTopics', { count: form.template_ids.length })}
                </span>
                <div className="flex gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={selectAllTopics}
                    className="text-xs text-amber-600 hover:text-amber-800 font-medium underline underline-offset-2"
                  >
                    {t('teacher.selectAll')}
                  </button>
                  <button
                    type="button"
                    onClick={clearTopics}
                    className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2"
                  >
                    {t('teacher.selectNone')}
                  </button>
                </div>
              </div>

              {/* Checkbox list */}
              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white">
                {topicOptions.map((tmpl) => {
                  const explicitly = form.template_ids.includes(tmpl.id)
                  return (
                    <label
                      key={tmpl.id}
                      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors hover:bg-amber-50 ${
                        explicitly ? 'bg-amber-50/60' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={form.template_ids.length === 0 ? false : explicitly}
                        onChange={() => toggleTemplate(tmpl.id)}
                        className="w-4 h-4 rounded accent-amber-500"
                      />
                      <span className="text-sm text-slate-700 leading-snug">{tmpl.title}</span>
                    </label>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Step 4 — Questions & Variants side by side */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center">4</span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('teacher.stepQuantity')}</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <NumberField
              label={t('teacher.questionCount')}
              hint={t('teacher.questionCountHint')}
              value={form.count}
              onChange={(v) => set('count', v)}
              min={1}
              max={50}
            />
            <NumberField
              label={t('teacher.variantCount')}
              hint={t('teacher.variantCountHint')}
              value={form.variant_count}
              onChange={(v) => set('variant_count', v)}
              min={1}
              max={50}
            />
          </div>
        </div>

        {/* Token cost summary */}
        <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-xl text-xs text-slate-500">
          <span>{t('teacher.costLabel')}</span>
          <span className="font-semibold text-slate-700">5 {t('billing.tokensShort')} · {t('teacher.variantLabel', { count: form.variant_count })}</span>
        </div>

        <Button
          type="button"
          onClick={() => mutation.mutate()}
          loading={mutation.isPending}
          disabled={!canGenerate}
          className="w-full justify-center"
        >
          {mutation.isPending ? phaseLabel : t('teacher.generate')}
        </Button>
      </div>

      {/* ── Loading progress bar ──────────────────────────────────────────── */}
      {mutation.isPending && (
        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <p className="text-sm font-medium text-amber-800">{phaseLabel}</p>
          </div>
          <div className="w-full h-1.5 bg-amber-100 rounded-full overflow-hidden">
            <div className="h-full bg-amber-400 rounded-full animate-pulse" style={{ width: '65%' }} />
          </div>
          <p className="text-xs text-amber-600">
            {form.variant_count > 1
              ? t('teacher.multiVariantNote', { count: form.variant_count })
              : t('teacher.latexNote')}
          </p>
        </div>
      )}

      {/* ── Success ───────────────────────────────────────────────────────── */}
      {mutation.isSuccess && mutation.data && (
        <div className="mt-4 p-5 bg-green-50 border border-green-200 rounded-2xl">
          <p className="text-sm font-semibold text-green-800 mb-0.5">{t('teacher.pdfReady')}</p>
          <p className="text-xs text-green-600 mb-4">
            {t('teacher.pdfReadyDesc', { variants: form.variant_count, questions: form.count })}
          </p>

          <div className="flex gap-2 mb-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => openPdfUrl(mutation.data)}
              className="flex-1 justify-center"
            >
              <ExternalLink size={14} /> {t('teacher.openPdf')}
            </Button>
            <Button
              type="button"
              onClick={() => downloadPdfUrl(mutation.data, `mathforge_${form.variant_count}v_${form.count}q.pdf`)}
              className="flex-1 justify-center"
            >
              <Download size={14} /> {t('teacher.download')}
            </Button>
          </div>

          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-green-700 hover:text-green-900 transition-colors"
          >
            <RefreshCw size={12} /> {t('teacher.generateAnother')}
          </button>
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {mutation.isError && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm font-semibold text-red-700 mb-1">{t('common.error')}</p>
          <p className="text-xs text-red-500 font-mono break-all">
            {(mutation.error as any)?.response?.data?.detail
              ?? (mutation.error as Error)?.message
              ?? 'Unknown error'}
          </p>
          <button onClick={handleReset} className="mt-2 text-xs text-red-600 hover:text-red-800 underline">
            {t('common.back')}
          </button>
        </div>
      )}
    </div>
  )
}
