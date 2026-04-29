/**
 * StudentAnalyzer — upgraded with "Generate Topic Task" section
 *
 * Layout (top → bottom):
 *  1. TopicTaskGenerator — pick category + difficulty → generate a task,
 *     rendered in KaTeX; auto-fills step 1; "Next Task" on success.
 *  2. Tab switcher: Manual entry | Upload photo
 *  3. StepByStepInput / Dropzone
 *  4. Analysis result + hint
 */
import 'katex/dist/katex.min.css'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDropzone } from 'react-dropzone'
import { BlockMath, InlineMath } from 'react-katex'
import {
  Camera, ChevronRight, FileText, Loader2,
  RotateCcw, Sparkles, UploadCloud, X, Zap,
} from 'lucide-react'
import api from '../../lib/axios'
import { useMathStore, type AnalysisResult } from '../../store/mathStore'
import { useUIStore } from '../../store/uiStore'
import StepByStepInput from '../../components/math/StepByStepInput'
import HintDisplay from '../../components/math/HintDisplay'
import Button from '../../components/ui/Button'

// ── Types ────────────────────────────────────────────────────────────────────

interface Category { id: string; name: string }
interface GeneratedTask { question_text: string; condition_latex: string; answer_latex: string }
type Difficulty = 'easy' | 'medium' | 'hard'

// ── Phase-cycling hook ────────────────────────────────────────────────────────

const PHASE_INTERVAL_MS = 2200
function usePhaseLabel(isActive: boolean, phases: string[]): string {
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    if (!isActive) { setPhase(0); return }
    const id = setInterval(() => setPhase(p => (p + 1) % phases.length), PHASE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [isActive, phases.length])
  return phases[phase]
}

// ── Render LaTeX string from backend (handles $...$ and $$...$$) ─────────────
// The generator produces strings like "Solve: $2x^2 + 3x - 5 = 0$"
// We split on $$ first (block), then $ (inline) and render each segment.
function LatexText({ src }: { src: string }) {
  if (!src) return null

  // Split by $$...$$ (block math) first
  const blockParts = src.split(/(\\$\\$[\s\S]*?\\$\\$|\$\$[\s\S]*?\$\$)/g)

  const nodes: React.ReactNode[] = []
  blockParts.forEach((part, bi) => {
    const blockMatch = part.match(/^\$\$([\s\S]*?)\$\$$/)
    if (blockMatch) {
      try { nodes.push(<BlockMath key={`b${bi}`} math={blockMatch[1].trim()} />) }
      catch { nodes.push(<span key={`b${bi}`} className="font-mono text-xs">{part}</span>) }
      return
    }
    // Split remaining text by $...$ (inline math)
    const inlineParts = part.split(/(\$[^$]+?\$)/g)
    inlineParts.forEach((seg, si) => {
      const inlineMatch = seg.match(/^\$([^$]+?)\$$/)
      if (inlineMatch) {
        try { nodes.push(<InlineMath key={`${bi}-i${si}`} math={inlineMatch[1]} />) }
        catch { nodes.push(<code key={`${bi}-i${si}`} className="font-mono text-xs">{seg}</code>) }
      } else if (seg) {
        nodes.push(<span key={`${bi}-t${si}`}>{seg}</span>)
      }
    })
  })
  return <>{nodes}</>
}

// ── TopicTaskGenerator ────────────────────────────────────────────────────────

interface TopicTaskGeneratorProps {
  onTaskGenerated: (task: GeneratedTask) => void
  justSolved: boolean
  activeCategoryId: string | null
  onNextTask: () => void
}

function TopicTaskGenerator({
  onTaskGenerated,
  justSolved,
  activeCategoryId,
  onNextTask,
}: TopicTaskGeneratorProps) {
  const { t, i18n } = useTranslation()
  const { tokenBalance } = useUIStore()
  const queryClient = useQueryClient()

  const [categoryId,  setCategoryId]  = useState<string>('')
  const [difficulty,  setDifficulty]  = useState<Difficulty>('easy')
  const [activeTask,  setActiveTask]  = useState<GeneratedTask | null>(null)

  // Keep category in sync when parent signals next-task on same category
  useEffect(() => {
    if (activeCategoryId && !categoryId) setCategoryId(activeCategoryId)
  }, [activeCategoryId, categoryId])

  const { data: categories = [], isLoading: catsLoading } = useQuery<Category[]>({
    queryKey: ['categories', i18n.language],
    queryFn: async () => {
      const { data } = await api.get<Category[]>('/tasks/categories')
      return data
    },
  })

  const generateMutation = useMutation<GeneratedTask | null, Error, { catId: string; diff: Difficulty }>({
    mutationFn: async ({ catId, diff }) => {
      const { data } = await api.post<{ tasks: GeneratedTask[] }>('/tasks/generate/practice', {
        category_id: catId,
        difficulty: diff,
        count: 1,
      })
      return data.tasks?.[0] ?? null
    },
    onSuccess: (task) => {
      if (!task) {
        console.error('[StudentAnalyzer] generate/practice returned 0 tasks')
        return
      }
      setActiveTask(task)
      onTaskGenerated(task)
      queryClient.invalidateQueries({ queryKey: ['billing', 'balance'] })
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      console.error('[StudentAnalyzer] generate/practice failed:', detail ?? err)
    },
  })

  const handleGenerate = () => {
    if (!categoryId || tokenBalance < 1) return
    setActiveTask(null)
    generateMutation.mutate({ catId: categoryId, diff: difficulty })
  }

  const handleNextTask = () => {
    setActiveTask(null)
    onNextTask()
    generateMutation.mutate({ catId: categoryId, diff: difficulty })
  }

  const difficultyOptions: { value: Difficulty; label: string; color: string }[] = [
    { value: 'easy',   label: t('analyzer.difficulty.easy'),   color: 'bg-green-100 text-green-700 border-green-300' },
    { value: 'medium', label: t('analyzer.difficulty.medium'), color: 'bg-amber-100 text-amber-700 border-amber-300' },
    { value: 'hard',   label: t('analyzer.difficulty.hard'),   color: 'bg-red-100   text-red-700   border-red-300'   },
  ]

  return (
    <div className="mb-6 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white shadow-sm overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-3 bg-indigo-600">
        <Sparkles size={16} className="text-indigo-200" />
        <span className="text-white font-semibold text-sm">{t('analyzer.generator.title')}</span>
        <span className="ml-auto text-indigo-200 text-xs">{t('analyzer.generator.cost')}</span>
      </div>

      {/* Controls */}
      <div className="px-5 pt-4 pb-3 flex flex-wrap gap-3 items-end">

        {/* Category dropdown */}
        <div className="flex-1 min-w-[160px]">
          <label className="text-xs font-medium text-slate-500 mb-1 block">
            {t('analyzer.generator.topic')}
          </label>
          <select
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            disabled={catsLoading}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white
                       focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
          >
            <option value="">{catsLoading ? '…' : t('analyzer.generator.selectTopic')}</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Difficulty pills */}
        <div>
          <label className="text-xs font-medium text-slate-500 mb-1 block">
            {t('analyzer.generator.difficulty')}
          </label>
          <div className="flex gap-1">
            {difficultyOptions.map(d => (
              <button
                key={d.value}
                onClick={() => setDifficulty(d.value)}
                className={`
                  px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                  ${difficulty === d.value ? d.color + ' shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}
                `}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={!categoryId || generateMutation.isPending || tokenBalance < 1}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700
                     disabled:opacity-40 text-white text-sm font-medium rounded-lg
                     transition-colors shadow-sm"
        >
          {generateMutation.isPending
            ? <Loader2 size={15} className="animate-spin" />
            : <Zap size={15} />
          }
          {t('analyzer.generator.generate')}
        </button>
      </div>

      {/* Error */}
      {generateMutation.isError && (
        <p className="px-5 pb-3 text-xs text-red-500">
          {t('analyzer.generator.error')}
        </p>
      )}

      {/* Task display */}
      {activeTask && (
        <div className="mx-5 mb-4 rounded-xl border border-indigo-200 bg-white p-4">
          <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mb-2">
            {t('analyzer.generator.taskLabel')}
          </p>
          <div className="text-sm text-slate-800 leading-relaxed">
            {activeTask.question_text && (
              <p className="mb-2 text-slate-600">{activeTask.question_text}</p>
            )}
            <div className="py-1 text-base">
              {/* Wrap in $...$ so LatexText renders it as inline math */}
              <LatexText src={`$${activeTask.condition_latex}$`} />
            </div>
          </div>

          {/* Next Task (shown after student solves it) */}
          {justSolved && (
            <button
              onClick={handleNextTask}
              disabled={generateMutation.isPending}
              className="mt-3 flex items-center gap-2 px-3 py-1.5 text-xs font-semibold
                         bg-green-500 hover:bg-green-600 text-white rounded-lg
                         transition-colors disabled:opacity-50"
            >
              {generateMutation.isPending
                ? <Loader2 size={13} className="animate-spin" />
                : <ChevronRight size={13} />
              }
              {t('analyzer.generator.nextTask')}
            </button>
          )}

          {/* Auto-fill hint */}
          {!justSolved && (
            <p className="mt-2 text-[11px] text-indigo-400">
              {t('analyzer.generator.autoFillHint')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StudentAnalyzer() {
  const { t } = useTranslation()
  const { tokenBalance } = useUIStore()
  const queryClient = useQueryClient()

  const {
    inputMode, setInputMode,
    imageFile, imagePreview, setImageFile, clearImage,
    steps, addStep, updateStep, removeStep, clearSteps,
    analysisResult, setAnalysisResult,
  } = useMathStore()

  // Track whether the current task was just solved correctly
  const [justSolved,       setJustSolved]       = useState(false)
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)

  // ── Phase label for image loading animation ────────────────────────────────
  const phases = [
    t('student.phases.scanning'),
    t('student.phases.verifying'),
    t('student.phases.hint'),
  ]

  // ── Manual mode mutation ───────────────────────────────────────────────────
  const filledSteps = steps.filter(s => s.trim().length > 0)
  const canSubmitManual = filledSteps.length >= 2 && tokenBalance >= 1

  const manualMutation = useMutation<AnalysisResult, Error>({
    mutationFn: async () => {
      const { data } = await api.post<AnalysisResult>('/study/analyze', { steps: filledSteps })
      return data
    },
    onSuccess: (data) => {
      setAnalysisResult(data)
      if (data.status === 'correct') setJustSolved(true)
      queryClient.invalidateQueries({ queryKey: ['billing', 'balance'] })
    },
  })

  // ── Image mode mutation ────────────────────────────────────────────────────
  const canSubmitImage = imageFile !== null && tokenBalance >= 1

  const imageMutation = useMutation<AnalysisResult, Error>({
    mutationFn: async () => {
      const form = new FormData()
      form.append('image', imageFile as File)
      const { data } = await api.post<AnalysisResult>('/study/analyze-image', form)
      return data
    },
    onSuccess: (data) => {
      setAnalysisResult(data)
      if (data.status === 'correct') setJustSolved(true)
      queryClient.invalidateQueries({ queryKey: ['billing', 'balance'] })
    },
  })

  const activePhaseLabel = usePhaseLabel(imageMutation.isPending, phases)

  // ── Dropzone ───────────────────────────────────────────────────────────────
  const onDrop = useCallback(
    (accepted: File[]) => { if (accepted.length > 0) setImageFile(accepted[0]) },
    [setImageFile],
  )
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': [], 'image/png': [], 'image/webp': [] },
    maxSize: 10 * 1024 * 1024,
    multiple: false,
  })

  // ── Task generator callbacks ───────────────────────────────────────────────
  const handleTaskGenerated = (task: GeneratedTask) => {
    // Auto-fill step 1 with the initial equation extracted from condition_latex
    // Strip outer $...$ delimiters to get the bare LaTeX for the input field
    const raw = task.condition_latex
      .replace(/^\$\$([\s\S]*?)\$\$$/, '$1')
      .replace(/^\$(.*)\$$/, '$1')
      .trim()

    clearSteps()
    setJustSolved(false)
    manualMutation.reset()
    imageMutation.reset()
    setAnalysisResult(null)

    // Pre-fill first step only — student completes the rest
    if (raw) {
      updateStep(0, raw)
    }
    setInputMode('manual')
  }

  const handleNextTask = () => {
    setJustSolved(false)
    clearSteps()
    manualMutation.reset()
    imageMutation.reset()
    setAnalysisResult(null)
  }

  // ── Shared reset ───────────────────────────────────────────────────────────
  const isSuccess = manualMutation.isSuccess || imageMutation.isSuccess
  const isError   = manualMutation.isError   || imageMutation.isError
  const isPending = manualMutation.isPending  || imageMutation.isPending

  const handleReset = () => {
    clearSteps(); clearImage()
    manualMutation.reset(); imageMutation.reset()
    setJustSolved(false)
  }

  const handleRetry = () => {
    manualMutation.reset(); imageMutation.reset()
    setAnalysisResult(null)
    setJustSolved(false)
  }

  const switchTab = (mode: 'manual' | 'image') => {
    handleRetry()
    setInputMode(mode)
  }

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-slate-800">{t('student.title')}</h1>
        {(isSuccess || isError) && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            <RotateCcw size={14} /> {t('student.reset')}
          </button>
        )}
      </div>

      <p className="text-sm text-slate-500 mb-4">{t('student.stepsSubtitle')}</p>

      {/* Token status */}
      {tokenBalance <= 0 ? (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {t('student.noTokens')}
        </div>
      ) : (
        <p className="text-xs text-slate-400 mb-4">
          {t('student.tokenWarning', { count: tokenBalance })}
        </p>
      )}

      {/* ── Topic Task Generator ──────────────────────────────────────────── */}
      <TopicTaskGenerator
        onTaskGenerated={handleTaskGenerated}
        justSolved={justSolved && isSuccess}
        activeCategoryId={activeCategoryId}
        onNextTask={handleNextTask}
      />

      {/* Tab switcher */}
      <div className="flex gap-1 mb-5 bg-slate-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => switchTab('manual')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            inputMode === 'manual'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <FileText size={15} /> {t('student.tabs.manual')}
        </button>
        <button
          onClick={() => switchTab('image')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            inputMode === 'image'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Camera size={15} /> {t('student.tabs.photo')}
        </button>
      </div>

      {/* ── Manual tab ───────────────────────────────────────────────────── */}
      {inputMode === 'manual' && !isSuccess && (
        <div className="bg-white rounded-xl border border-slate-100 p-5 mb-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-700 mb-4">{t('student.stepsTitle')}</p>
          <StepByStepInput
            steps={steps}
            errorIndex={analysisResult?.error_index ?? null}
            onAdd={addStep}
            onUpdate={updateStep}
            onRemove={removeStep}
          />
          {filledSteps.length < 2 && steps.some(s => s.trim()) && (
            <p className="mt-3 text-xs text-amber-600">{t('student.minSteps')}</p>
          )}
        </div>
      )}

      {/* ── Photo tab ────────────────────────────────────────────────────── */}
      {inputMode === 'image' && !isSuccess && (
        <div className="mb-5">
          {!imagePreview ? (
            <div
              {...getRootProps()}
              className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? 'border-amber-400 bg-amber-50'
                  : 'border-slate-200 bg-slate-50 hover:border-amber-300 hover:bg-amber-50/40'
              }`}
            >
              <input {...getInputProps()} />
              <UploadCloud size={36} className={`mx-auto mb-3 ${isDragActive ? 'text-amber-500' : 'text-slate-400'}`} />
              <p className="text-sm font-medium text-slate-700 mb-1">{t('student.uploadPrompt')}</p>
              <p className="text-xs text-slate-400">{t('student.uploadHint')}</p>
            </div>
          ) : (
            <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
              <img src={imagePreview} alt="solution preview" className="w-full max-h-72 object-contain" />
              <button
                onClick={e => { e.stopPropagation(); clearImage() }}
                className="absolute top-2 right-2 bg-white/90 hover:bg-white rounded-full p-1.5 shadow text-slate-600 hover:text-red-500 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          )}
          {imageMutation.isError && (
            <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200">
              <p className="text-sm text-red-600">{t('student.ocrFailed')}</p>
            </div>
          )}
        </div>
      )}

      {/* Analysis result */}
      {isSuccess && analysisResult && (
        <div className="mb-5">
          <HintDisplay result={analysisResult} steps={filledSteps} />
          {analysisResult.status === 'error_found' && (
            <button
              onClick={handleRetry}
              className="mt-3 text-sm text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1.5"
            >
              <RotateCcw size={13} /> {t('student.tryAgain')}
            </button>
          )}
        </div>
      )}

      {manualMutation.isError && !imageMutation.isError && (
        <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200">
          <p className="text-sm text-red-600">{t('common.error')}</p>
        </div>
      )}

      {/* Action buttons */}
      {!isSuccess && (
        <div className="flex gap-3">
          {inputMode === 'manual' ? (
            <>
              <Button
                onClick={() => manualMutation.mutate()}
                loading={manualMutation.isPending}
                disabled={!canSubmitManual}
              >
                {manualMutation.isPending ? t('student.analyzing') : t('student.analyze')}
              </Button>
              <Button variant="secondary" onClick={handleReset} disabled={isPending}>
                {t('student.clear')}
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={() => imageMutation.mutate()}
                loading={imageMutation.isPending}
                disabled={!canSubmitImage}
              >
                {imageMutation.isPending ? activePhaseLabel : t('student.analyze')}
              </Button>
              {imagePreview && !imageMutation.isPending && (
                <Button variant="secondary" onClick={clearImage}>{t('student.clear')}</Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
