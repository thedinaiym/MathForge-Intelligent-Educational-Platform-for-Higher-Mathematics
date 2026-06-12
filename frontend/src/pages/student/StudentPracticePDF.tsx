/**
 * StudentPracticePDF — Self-Practice Study Guide Generator
 *
 * The student picks a subject, difficulty, and optionally specific topics,
 * then chooses how many problems they want.  The backend compiles a PDF where:
 *   • Pages 1+: Problems only (blank work space below each equation)
 *   • Last page: Answer key
 *
 * Cost: 3 tokens per PDF.
 * Route: /app/student/practice-pdf
 */
import 'katex/dist/katex.min.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, ExternalLink, FileDown, RefreshCw, Search } from 'lucide-react'
import api from '../../lib/axios'
import { useCategories, isOrtCategory } from '../../hooks/useCategories'
import { useBalance } from '../../hooks/useBalance'
import { useUIStore } from '../../store/uiStore'
import Button from '../../components/ui/Button'
import { downloadPdfUrl, openPdfUrl } from '../../lib/pdfActions'

// ── Types ─────────────────────────────────────────────────────────────────────

type Difficulty = 'easy' | 'medium' | 'hard'

interface TemplateInfo {
  id:         string
  title:      string
  difficulty: Difficulty
}

interface FormState {
  category_id:  string
  difficulty:   Difficulty
  template_ids: string[]
  count:        number
}

// ── Loading phase animation ───────────────────────────────────────────────────

const PHASE_MS = 2600

function usePhaseLabel(active: boolean, phases: string[]): string {
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    if (!active) { setPhase(0); return }
    const id = setInterval(() => setPhase(p => (p + 1) % phases.length), PHASE_MS)
    return () => clearInterval(id)
  }, [active, phases.length])
  return phases[phase]
}

// ── Difficulty styles ─────────────────────────────────────────────────────────

const DIFF_STYLES: Record<Difficulty, string> = {
  easy:   'border-green-400 bg-green-50  text-green-700',
  medium: 'border-amber-400 bg-amber-50  text-amber-700',
  hard:   'border-red-400   bg-red-50    text-red-700',
}

// ── Problem count presets ─────────────────────────────────────────────────────

const COUNT_PRESETS = [5, 10, 20, 30]

// ── Main component ─────────────────────────────────────────────────────────────

export default function StudentPracticePDF() {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'ru'
  const queryClient = useQueryClient()
  const { tokenBalance } = useUIStore()
  const { isLoading: balanceLoading } = useBalance()

  const [form, setForm] = useState<FormState>({
    category_id:  '',
    difficulty:   'medium',
    template_ids: [],
    count:        10,
  })
  const [topicSearch, setTopicSearch] = useState('')

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm(prev => ({ ...prev, [key]: val }))

  const handleCategoryChange = (id: string) => {
    setTopicSearch('')
    setForm(prev => ({ ...prev, category_id: id, template_ids: [] }))
  }

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: allCategories = [], isLoading: loadingCats } = useCategories()
  const categories = allCategories.filter(c => !isOrtCategory(c))

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

  const topicOptions = templates.filter(
    tmpl =>
      tmpl.difficulty === form.difficulty ||
      templates.every(t2 => t2.difficulty !== form.difficulty),
  )

  // Deduplicate: group template IDs by display title so each unique topic
  // shows exactly once in the list.
  const uniqueTopics = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const tmpl of topicOptions) {
      const ids = map.get(tmpl.title) ?? []
      ids.push(tmpl.id)
      map.set(tmpl.title, ids)
    }
    return Array.from(map.entries()).map(([title, ids]) => ({ title, ids }))
  }, [topicOptions])

  const filteredTopics = topicSearch.trim()
    ? uniqueTopics.filter(t => t.title.toLowerCase().includes(topicSearch.toLowerCase()))
    : uniqueTopics

  // A group is checked when ALL its IDs are in template_ids
  const isGroupChecked = (ids: string[]) =>
    form.template_ids.length > 0 && ids.every(id => form.template_ids.includes(id))

  const toggleGroup = (ids: string[]) =>
    setForm(prev => {
      const allOn = ids.every(id => prev.template_ids.includes(id))
      return {
        ...prev,
        template_ids: allOn
          ? prev.template_ids.filter(id => !ids.includes(id))
          : [...prev.template_ids.filter(id => !ids.includes(id)), ...ids],
      }
    })

  // ── PDF mutation ───────────────────────────────────────────────────────────
  const blobUrlRef = useRef<string | null>(null)
  useEffect(() => () => { if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current) }, [])

  const mutation = useMutation<string, Error>({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        category_id: form.category_id,
        difficulty:  form.difficulty,
        count:       form.count,
      }
      if (form.template_ids.length > 0) payload.template_ids = form.template_ids

      const response = await api.post('/student/generate-pdf', payload, {
        responseType: 'blob',
        timeout:      120_000,
      })

      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
      const blob = new Blob([response.data], { type: 'application/pdf' })
      const url  = URL.createObjectURL(blob)
      blobUrlRef.current = url
      return url
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'balance'] })
    },
  })

  const phases = [
    t('practicePdf.phases.generating'),
    t('practicePdf.phases.typesetting'),
    t('practicePdf.phases.finishing'),
  ]
  const phaseLabel = usePhaseLabel(mutation.isPending, phases)

  const TOKEN_COST = 3
  const canGenerate =
    (balanceLoading || tokenBalance >= TOKEN_COST) &&
    !!form.category_id &&
    !mutation.isPending

  const handleReset = () => {
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null }
    mutation.reset()
    setForm(prev => ({ ...prev, template_ids: [] }))
  }

  const filename = `mathforge_studyguide_${form.difficulty}_${form.count}q.pdf`

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-xl">

      {/* Page header */}
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-2xl bg-violet-100 flex items-center justify-center flex-shrink-0">
          <FileDown size={20} className="text-violet-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{t('practicePdf.title')}</h1>
          <p className="text-sm text-slate-500">{t('practicePdf.subtitle')}</p>
        </div>
      </div>

      {/* Layout explanation banner */}
      <div className="mt-4 mb-5 px-4 py-3 rounded-xl bg-violet-50 border border-violet-100 text-xs text-violet-700 leading-relaxed">
        {t('practicePdf.layoutHint')}
      </div>

      {/* Token warning */}
      {!balanceLoading && tokenBalance < TOKEN_COST && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          {t('practicePdf.noTokens', { cost: TOKEN_COST })}
        </div>
      )}

      {/* ── Form card ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">

        {/* Step 1 — Subject */}
        <div>
          <StepLabel n={1} label={t('practicePdf.stepSubject')} active />
          <label className="text-sm font-semibold text-slate-700 mb-1.5 block">
            {t('practicePdf.subject')}
          </label>
          <select
            value={form.category_id}
            onChange={e => handleCategoryChange(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm
                       focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400
                       disabled:bg-slate-50 disabled:text-slate-400 transition-colors"
          >
            <option value="">
              {loadingCats ? t('common.loading') : t('practicePdf.selectSubject')}
            </option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Step 2 — Difficulty */}
        <div>
          <StepLabel n={2} label={t('practicePdf.stepDifficulty')} active />
          <div className="flex gap-2">
            {(['easy', 'medium', 'hard'] as Difficulty[]).map(d => (
              <button
                key={d}
                type="button"
                onClick={() => { set('difficulty', d); set('template_ids', []) }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors
                  ${form.difficulty === d
                    ? DIFF_STYLES[d]
                    : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
              >
                {t(`analyzer.difficulty.${d}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Step 3 — Topics (multi-select, optional) */}
        <div>
          <StepLabel n={3} label={t('practicePdf.stepTopics')} active={!!form.category_id} />

          {!form.category_id ? (
            <p className="text-sm text-slate-400 px-1">{t('practicePdf.selectSubjectFirst')}</p>
          ) : loadingTemplates ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-9 bg-slate-100 rounded-lg animate-pulse" />)}
            </div>
          ) : uniqueTopics.length === 0 ? (
            <p className="text-sm text-slate-400 px-1">{t('practicePdf.noTopics')}</p>
          ) : (
            <>
              {/* Header row: selection count + select-all/clear */}
              <div className="flex items-center gap-2 mb-2 text-xs text-slate-500">
                <span className="font-medium">
                  {form.template_ids.length === 0
                    ? t('practicePdf.allTopics')
                    : t('practicePdf.selectedTopics', { count: uniqueTopics.filter(g => isGroupChecked(g.ids)).length })}
                </span>
                <div className="flex gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => set('template_ids', topicOptions.map(tmpl => tmpl.id))}
                    className="text-violet-600 hover:text-violet-800 font-medium underline underline-offset-2"
                  >
                    {t('practicePdf.selectAll')}
                  </button>
                  <button
                    type="button"
                    onClick={() => set('template_ids', [])}
                    className="text-slate-400 hover:text-slate-600 underline underline-offset-2"
                  >
                    {t('practicePdf.selectNone')}
                  </button>
                </div>
              </div>

              {/* Search box */}
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={topicSearch}
                  onChange={e => setTopicSearch(e.target.value)}
                  placeholder={t('practicePdf.searchTopics', 'Поиск темы...')}
                  className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-200
                             focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400"
                />
              </div>

              {/* Deduplicated topic list */}
              <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white">
                {filteredTopics.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-slate-400">{t('common.noResults', 'Ничего не найдено')}</p>
                ) : filteredTopics.map(group => {
                  const checked = isGroupChecked(group.ids)
                  return (
                    <label
                      key={group.title}
                      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors hover:bg-violet-50 ${
                        checked ? 'bg-violet-50/60' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleGroup(group.ids)}
                        className="w-4 h-4 rounded accent-violet-500 flex-shrink-0"
                      />
                      <span className="text-sm text-slate-700 leading-snug">{group.title}</span>
                    </label>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Step 4 — Problem count presets */}
        <div>
          <StepLabel n={4} label={t('practicePdf.stepCount')} active />
          <div className="flex gap-2">
            {COUNT_PRESETS.map(n => (
              <button
                key={n}
                type="button"
                onClick={() => set('count', n)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors
                  ${form.count === n
                    ? 'border-violet-500 bg-violet-50 text-violet-700'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-400">{t('practicePdf.countHint')}</p>
        </div>

        {/* Cost row */}
        <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-xl text-xs text-slate-500">
          <span>{t('practicePdf.costLabel')}</span>
          <span className="font-semibold text-slate-700">
            {TOKEN_COST} {t('billing.tokensShort')} · {form.count} {t('practicePdf.problems')}
          </span>
        </div>

        <Button
          type="button"
          onClick={() => mutation.mutate()}
          loading={mutation.isPending}
          disabled={!canGenerate}
          className="w-full justify-center bg-violet-600 hover:bg-violet-700 focus:ring-violet-500"
        >
          {mutation.isPending ? phaseLabel : t('practicePdf.generate')}
        </Button>
      </div>

      {/* ── Loading progress ──────────────────────────────────────────────── */}
      {mutation.isPending && (
        <div className="mt-4 p-4 bg-violet-50 border border-violet-200 rounded-xl space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <p className="text-sm font-medium text-violet-800">{phaseLabel}</p>
          </div>
          <div className="w-full h-1.5 bg-violet-100 rounded-full overflow-hidden">
            <div className="h-full bg-violet-400 rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
          <p className="text-xs text-violet-600">{t('practicePdf.compilingNote')}</p>
        </div>
      )}

      {/* ── Success ───────────────────────────────────────────────────────── */}
      {mutation.isSuccess && mutation.data && (
        <div className="mt-4 p-5 bg-green-50 border border-green-200 rounded-2xl">
          <p className="text-sm font-semibold text-green-800 mb-0.5">
            {t('practicePdf.pdfReady')}
          </p>
          <p className="text-xs text-green-600 mb-4">
            {t('practicePdf.pdfReadyDesc', { count: form.count })}
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
              onClick={() => downloadPdfUrl(mutation.data, filename)}
              className="flex-1 justify-center bg-green-600 hover:bg-green-700"
            >
              <Download size={14} /> {t('teacher.download')}
            </Button>
          </div>

          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-green-700 hover:text-green-900 transition-colors"
          >
            <RefreshCw size={12} /> {t('practicePdf.generateAnother')}
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

// ── Step label helper ─────────────────────────────────────────────────────────

function StepLabel({ n, label, active }: { n: number; label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
        active ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-400'
      }`}>{n}</span>
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
    </div>
  )
}
