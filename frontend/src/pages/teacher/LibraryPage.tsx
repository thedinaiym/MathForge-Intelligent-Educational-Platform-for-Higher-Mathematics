/**
 * LibraryPage — Teacher Interface
 *
 * Tab 1 – "Parse Book":  Upload a textbook PDF → RAG extracts templates
 *          Requires teacher or admin role.
 *
 * Tab 2 – "Generate Task": Select topic (category) + difficulty →
 *          POST /api/tasks/generate → display the generated SymPy task
 *          (LaTeX condition + answer rendered with KaTeX)
 */
import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useDropzone } from 'react-dropzone'
import { useMutation } from '@tanstack/react-query'
import { Upload, FileText, FlaskConical, CheckCircle, AlertCircle, Layers, Lock, Zap } from 'lucide-react'
import api from '../../lib/axios'
import { useCategories } from '../../hooks/useCategories'
import { useAuthStore } from '../../store/authStore'
import MathRenderer from '../../components/math/MathRenderer'
import Button from '../../components/ui/Button'

type Tab = 'parse' | 'generate'
type Difficulty = 'easy' | 'medium' | 'hard'

interface ParsedTemplate {
  saved_id: string
  topic: string
  sympy_expr: string
  difficulty: 'easy' | 'medium' | 'hard'
  title: Record<string, string>
  texts: Record<string, string>
}

interface UploadPdfResponse {
  count: number
  category_id: string
  templates: ParsedTemplate[]
}

interface GeneratedTask {
  question_text: string
  condition_latex: string
  answer_latex: string
}

interface GenerateResponse {
  pdf_url: string | null
  tasks: GeneratedTask[]
}

export default function LibraryPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('parse')
  const { user } = useAuthStore()

  const isTeacherOrAdmin = user?.role === 'teacher' || user?.role === 'admin'

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">{t('library.title')}</h1>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-6 w-fit">
        <TabButton active={tab === 'parse'} onClick={() => setTab('parse')}>
          <FileText size={14} /> {t('library.tabParse')}
        </TabButton>
        <TabButton active={tab === 'generate'} onClick={() => setTab('generate')}>
          <FlaskConical size={14} /> {t('library.tabGenerate')}
        </TabButton>
      </div>

      {tab === 'parse'
        ? (isTeacherOrAdmin ? <ParseBookTab /> : <AccessDeniedBanner />)
        : <GenerateTaskTab />
      }
    </div>
  )
}

// ── Access denied banner (shown to students on Parse tab) ─────────────────────

function AccessDeniedBanner() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center gap-3 py-14 px-6 bg-slate-50 border border-slate-200 rounded-2xl text-center">
      <Lock size={32} className="text-slate-300" />
      <p className="text-sm font-semibold text-slate-600">
        {t('library.parseTeacherOnly', 'This feature is for teachers and admins only.')}
      </p>
      <p className="text-xs text-slate-400">
        {t('library.parseTeacherOnlyHint', 'Switch to the "Generate Task" tab to try sample problems.')}
      </p>
    </div>
  )
}

// ── Loading phases for the RAG pipeline ──────────────────────────────────────

const PARSE_PHASES = [
  'library.phaseUploading',
  'library.phaseExtracting',
  'library.phaseAnalyzing',
  'library.phaseSaving',
]

function useParsePhase(isPending: boolean) {
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    if (!isPending) { setPhase(0); return }
    const id = setInterval(() => setPhase((p) => Math.min(p + 1, PARSE_PHASES.length - 1)), 2500)
    return () => clearInterval(id)
  }, [isPending])
  return phase
}

// ── Difficulty badge ──────────────────────────────────────────────────────────

const DIFF_COLOUR: Record<string, string> = {
  easy:   'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  hard:   'bg-red-100 text-red-700',
}

// ── Tab: Parse Book ───────────────────────────────────────────────────────────

function ParseBookTab() {
  const { t, i18n } = useTranslation()
  const [file, setFile] = useState<File | null>(null)
  const [templates, setTemplates] = useState<ParsedTemplate[]>([])
  const [categoryId, setCategoryId] = useState('')
  const { data: categories = [], isLoading: catsLoading } = useCategories()

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) { setFile(accepted[0]); setTemplates([]) }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
  })

  const mutation = useMutation<UploadPdfResponse, Error>({
    mutationFn: async () => {
      if (!file) throw new Error('No file selected')
      const form = new FormData()
      form.append('file', file)
      if (categoryId) form.append('category_id', categoryId)
      const { data } = await api.post<UploadPdfResponse>('/teachers/upload-pdf', form)
      return data
    },
    onSuccess: (data) => setTemplates(data.templates ?? []),
  })

  const phase = useParsePhase(mutation.isPending)

  const errorMsg: string = (() => {
    if (!mutation.error) return ''
    const detail = (mutation.error as any)?.response?.data?.detail
    return typeof detail === 'string' ? detail : t('common.error')
  })()

  const lang = i18n.language as string

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-amber-400 bg-amber-50'
            : file
              ? 'border-emerald-300 bg-emerald-50/40'
              : 'border-slate-200 hover:border-amber-300 hover:bg-amber-50/50'
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-2">
          {file
            ? <><CheckCircle size={28} className="text-emerald-500" /><p className="text-sm font-medium text-emerald-700">{file.name}</p><p className="text-xs text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p></>
            : <><FileText size={28} className="text-slate-300" /><p className="text-sm text-slate-400">{t('library.upload')}</p><p className="text-xs text-slate-300">PDF · max 20 MB</p></>
          }
        </div>
      </div>

      {/* Category selector */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-slate-700">{t('teacher.category')}</label>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          disabled={catsLoading}
          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm
            focus:outline-none focus:ring-2 focus:ring-amber-400
            disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
        >
          <option value="">{t('teacher.allTopics')}</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>

      {/* Parse button */}
      <Button
        onClick={() => mutation.mutate()}
        loading={mutation.isPending}
        disabled={!file || mutation.isPending}
        className="w-full justify-center"
      >
        <Upload size={15} />
        {mutation.isPending
          ? t(PARSE_PHASES[phase])
          : t('library.parse')}
      </Button>

      {/* Error */}
      {mutation.isError && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{errorMsg}</p>
        </div>
      )}

      {/* Results */}
      {templates.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Layers size={16} className="text-amber-500" />
            <h2 className="text-base font-semibold text-slate-700">
              {t('library.templates')}
              <span className="ml-2 text-xs font-normal text-slate-400">
                ({templates.length} {t('library.extracted')}) · {t('library.draftNote')}
              </span>
            </h2>
          </div>
          <div className="space-y-3">
            {templates.map((tpl) => (
              <TemplateCard key={tpl.saved_id} tpl={tpl} lang={lang} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Extracted template card with activate button ───────────────────────────

function TemplateCard({ tpl, lang }: { tpl: ParsedTemplate; lang: string }) {
  const { t } = useTranslation()
  const [activated, setActivated] = useState(false)

  const activateMutation = useMutation<void, Error>({
    mutationFn: async () => {
      await api.patch(`/teachers/templates/${tpl.saved_id}/activate`)
    },
    onSuccess: () => setActivated(true),
  })

  const questionText =
    tpl.texts?.[lang] || tpl.texts?.['en'] || tpl.texts?.['ru'] || ''

  const titleText =
    tpl.title?.[lang] || tpl.title?.['en'] || tpl.topic.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  return (
    <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-slate-700 text-sm">{titleText}</p>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${DIFF_COLOUR[tpl.difficulty] ?? 'bg-slate-100 text-slate-600'}`}>
          {tpl.difficulty}
        </span>
      </div>

      {questionText && (
        <div className="p-2 bg-slate-50 rounded-lg border border-slate-100 overflow-x-auto">
          <MathRenderer latex={questionText} block={false} />
        </div>
      )}

      <code className="block text-xs font-mono text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 overflow-x-auto">
        {tpl.sympy_expr}
      </code>

      <div className="flex items-center justify-between pt-1">
        <p className="text-xs text-slate-300 font-mono truncate max-w-[60%]">{tpl.saved_id}</p>
        {activated ? (
          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <CheckCircle size={13} /> {t('library.activated', 'Activated')}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => activateMutation.mutate()}
            disabled={activateMutation.isPending}
            className="flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-lg
              bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            <Zap size={12} />
            {activateMutation.isPending
              ? '…'
              : t('library.activate', 'Activate')}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Tab: Generate Task ────────────────────────────────────────────────────────

function GenerateTaskTab() {
  const { t } = useTranslation()
  const { data: categories = [], isLoading, isError } = useCategories()

  const [categoryId, setCategoryId] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')

  const mutation = useMutation<GenerateResponse>({
    mutationFn: async () => {
      const { data } = await api.post<GenerateResponse>('/tasks/generate', {
        category_id: categoryId,
        difficulty,
        count: 1,
      })
      return data
    },
  })

  const canGenerate = categoryId.length > 0

  // Placeholder text for the subject dropdown
  const subjectPlaceholder = isLoading
    ? t('common.loading')
    : isError
      ? t('common.error')
      : t('teacher.selectCategory')

  return (
    <div>
      {/* Controls */}
      <div className="bg-white rounded-xl border border-slate-100 p-5 mb-5 space-y-4 shadow-sm">
        {/* Category selector */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">{t('teacher.category')}</label>
          <select
            value={categoryId}
            onChange={(e) => { setCategoryId(e.target.value); mutation.reset() }}
            disabled={isLoading || isError}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm
              focus:outline-none focus:ring-2 focus:ring-amber-400
              disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            <option value="">{subjectPlaceholder}</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>

        {/* Difficulty selector */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">{t('teacher.difficulty')}</label>
          <div className="flex gap-2">
            {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => { setDifficulty(d); mutation.reset() }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors
                  ${difficulty === d
                    ? 'bg-amber-500 border-amber-500 text-white'
                    : 'bg-white border-slate-300 text-slate-600 hover:border-amber-400'
                  }`}
              >
                {t(`teacher.difficulty_${d}`)}
              </button>
            ))}
          </div>
        </div>

        <Button
          onClick={() => mutation.mutate()}
          loading={mutation.isPending}
          disabled={!canGenerate}
          className="w-full justify-center"
        >
          <FlaskConical size={15} />
          {mutation.isPending ? t('library.generatingSample') : t('library.generateSample')}
        </Button>
      </div>

      {/* Generated task result */}
      {mutation.isSuccess && (
        <div className="space-y-3">
          {mutation.data?.tasks?.length ? (
            mutation.data.tasks.map((task, i) => (
              <TaskCard key={i} task={task} />
            ))
          ) : (
            <p className="text-sm text-slate-500 text-center py-6">{t('library.noTemplates')}</p>
          )}
        </div>
      )}

      {mutation.isError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm text-red-600">
            {(mutation.error as any)?.response?.data?.detail ?? t('common.error')}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Task card: renders LaTeX condition + answer ───────────────────────────────

function TaskCard({ task }: { task: GeneratedTask }) {
  const { t } = useTranslation()

  return (
    <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm space-y-3">
      {task.question_text && (
        <p className="text-sm text-slate-700">{task.question_text}</p>
      )}

      <div className="space-y-2">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {t('library.condition')}
          </span>
          <div className="mt-1 p-3 bg-slate-50 rounded-lg border border-slate-100 overflow-x-auto">
            <MathRenderer latex={task.condition_latex} block />
          </div>
        </div>

        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {t('library.answer')}
          </span>
          <div className="mt-1 p-3 bg-amber-50 rounded-lg border border-amber-100 overflow-x-auto">
            <MathRenderer latex={task.answer_latex} block />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Helper: tab button ────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors
        ${active
          ? 'bg-white text-amber-700 shadow-sm'
          : 'text-slate-500 hover:text-slate-700'
        }`}
    >
      {children}
    </button>
  )
}
