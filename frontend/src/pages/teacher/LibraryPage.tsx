/**
 * LibraryPage — Teacher Interface
 *
 * Tab 1 – "Parse Book":  Upload a textbook PDF → RAG extracts templates
 *          (existing functionality, unchanged)
 *
 * Tab 2 – "Generate Task": Select topic (category) + difficulty →
 *          POST /api/tasks/generate → display the generated SymPy task
 *          (LaTeX condition + answer rendered with KaTeX)
 */
import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useDropzone } from 'react-dropzone'
import { useMutation } from '@tanstack/react-query'
import { Upload, FileText, FlaskConical } from 'lucide-react'
import api from '../../lib/axios'
import { useCategories } from '../../hooks/useCategories'
import MathRenderer from '../../components/math/MathRenderer'
import Button from '../../components/ui/Button'

type Tab = 'parse' | 'generate'
type Difficulty = 'easy' | 'medium' | 'hard'

interface ParsedTemplate {
  topic: string
  sympy_expr: string
  difficulty: string
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

      {tab === 'parse' ? <ParseBookTab /> : <GenerateTaskTab />}
    </div>
  )
}

// ── Tab: Parse Book ───────────────────────────────────────────────────────────

function ParseBookTab() {
  const { t } = useTranslation()
  const [file, setFile] = useState<File | null>(null)
  const [templates, setTemplates] = useState<ParsedTemplate[]>([])

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) setFile(accepted[0])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
  })

  const mutation = useMutation<{ templates: ParsedTemplate[] }>({
    mutationFn: async () => {
      if (!file) throw new Error('No file selected')
      const form = new FormData()
      form.append('file', file)
      const { data } = await api.post('/admin/parse-book', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    },
    onSuccess: (data) => setTemplates(data.templates ?? []),
  })

  return (
    <div>
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors mb-4 ${
          isDragActive
            ? 'border-amber-400 bg-amber-50'
            : 'border-slate-200 hover:border-amber-300 hover:bg-amber-50/50'
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-2 text-slate-400">
          <FileText size={32} />
          <p className="text-sm">{file ? file.name : t('library.upload')}</p>
        </div>
      </div>

      <Button
        onClick={() => mutation.mutate()}
        loading={mutation.isPending}
        disabled={!file}
        className="mb-6"
      >
        <Upload size={15} />
        {mutation.isPending ? t('library.parsing') : t('library.parse')}
      </Button>

      {templates.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-slate-700 mb-3">{t('library.templates')}</h2>
          <div className="space-y-2">
            {templates.map((tpl, i) => (
              <div key={i} className="bg-white rounded-lg p-4 border border-slate-100 text-sm">
                <p className="font-medium text-slate-700">{tpl.topic}</p>
                <p className="text-slate-400 font-mono text-xs mt-1">{tpl.sympy_expr}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {mutation.isError && (
        <p className="text-sm text-red-500">{t('common.error')}</p>
      )}
    </div>
  )
}

// ── Tab: Generate Task ────────────────────────────────────────────────────────

function GenerateTaskTab() {
  const { t } = useTranslation()
  const { data: categories, isLoading } = useCategories()

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
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm
              focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="">{isLoading ? t('common.loading') : t('common.noData')}</option>
            {categories?.map((cat) => (
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
          <p className="text-sm text-red-600">{t('common.error')}</p>
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
