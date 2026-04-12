/**
 * HomeworkChecker — Phase 19 overhaul
 *
 * Input:
 *   1. Textarea — Problem Condition (Условие задачи). Gives the AI context.
 *   2. Multi-image dropzone — upload one or more photos of the student's
 *      handwritten solution steps.
 *
 * AI pipeline (backend /study/check-homework):
 *   Vision OCR  → extract steps from every photo (merged in order)
 *   Tutor LLM   → identify exact error step, explain the concept
 *   TaskGenerator → 3 SymPy practice problems on the weak topic
 *
 * Momentum Bridge:
 *   If a mistake is found, a prominent CTA button redirects the student to
 *   /app/student/analyze?topic=<weak_topic> so they immediately practice
 *   the specific concept they got wrong.
 *
 * Cost: 1 token per check.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useDropzone } from 'react-dropzone'
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  RotateCcw,
  Target,
  UploadCloud,
  X,
  Zap,
} from 'lucide-react'
import api from '../../lib/axios'
import { useUIStore } from '../../store/uiStore'
import MathRenderer from '../../components/math/MathRenderer'
import { MathText } from '../../components/math/MathRenderer'
import Button from '../../components/ui/Button'

// ── Types ────────────────────────────────────────────────────────────────────

interface PracticeTask {
  question_text: string
  condition_latex: string
  answer_latex: string
  topic: string
}

interface HomeworkCheckResponse {
  is_correct: boolean
  error_step_index: number | null
  feedback: string
  weak_topic: string | null
  extracted_steps: string[]
  practice_tasks: PracticeTask[]
}

// ── Phase-cycling hook ───────────────────────────────────────────────────────

function usePhaseLabel(isActive: boolean, phases: string[]): string {
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    if (!isActive) { setPhase(0); return }
    const id = setInterval(() => setPhase((p) => (p + 1) % phases.length), 2_200)
    return () => clearInterval(id)
  }, [isActive, phases.length])
  return phases[phase]
}

// ── Thumbnail strip ──────────────────────────────────────────────────────────

interface ImageEntry {
  file: File
  preview: string
}

function ThumbnailStrip({
  entries,
  onRemove,
}: {
  entries: ImageEntry[]
  onRemove: (idx: number) => void
}) {
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {entries.map((entry, idx) => (
        <div
          key={idx}
          className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 flex-shrink-0"
        >
          <img
            src={entry.preview}
            alt={`solution page ${idx + 1}`}
            className="w-full h-full object-cover"
          />
          <button
            type="button"
            onClick={() => onRemove(idx)}
            className="absolute top-0.5 right-0.5 bg-white/90 hover:bg-white rounded-full p-0.5 shadow text-slate-500 hover:text-red-500 transition-colors"
          >
            <X size={11} />
          </button>
          <span className="absolute bottom-0 left-0 right-0 text-center text-[10px] font-bold text-white bg-black/40 py-0.5">
            {idx + 1}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function HomeworkChecker() {
  const { t } = useTranslation()
  const { tokenBalance } = useUIStore()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [problemText, setProblemText] = useState('')
  const [imageEntries, setImageEntries] = useState<ImageEntry[]>([])

  // Revoke object URLs on unmount to prevent memory leaks
  const entriesRef = useRef(imageEntries)
  entriesRef.current = imageEntries
  useEffect(() => {
    return () => entriesRef.current.forEach((e) => URL.revokeObjectURL(e.preview))
  }, [])

  const phases = [
    t('homework.phases.scanning'),
    t('homework.phases.analyzing'),
    t('homework.phases.finding'),
  ]

  // ── Dropzone (multiple) ──────────────────────────────────────────────────
  const onDrop = useCallback((accepted: File[]) => {
    const newEntries: ImageEntry[] = accepted.map((f) => ({
      file: f,
      preview: URL.createObjectURL(f),
    }))
    setImageEntries((prev) => [...prev, ...newEntries])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': [], 'image/png': [], 'image/webp': [] },
    maxSize: 10 * 1024 * 1024,
    multiple: true,
  })

  const removeImage = (idx: number) => {
    setImageEntries((prev) => {
      URL.revokeObjectURL(prev[idx].preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  // ── Mutation ─────────────────────────────────────────────────────────────
  const mutation = useMutation<HomeworkCheckResponse, Error>({
    mutationFn: async () => {
      if (imageEntries.length === 0) throw new Error('No images selected')
      const form = new FormData()
      form.append('problem_text', problemText.trim())
      imageEntries.forEach((entry) => form.append('files', entry.file))
      const { data } = await api.post<HomeworkCheckResponse>(
        '/study/check-homework',
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'balance'] })
    },
  })

  const phaseLabel = usePhaseLabel(mutation.isPending, phases)

  const handleReset = () => {
    imageEntries.forEach((e) => URL.revokeObjectURL(e.preview))
    setImageEntries([])
    setProblemText('')
    mutation.reset()
  }

  const errorMsg = (() => {
    if (!mutation.error) return ''
    const detail = (mutation.error as any)?.response?.data?.detail
    return typeof detail === 'string' ? detail : t('common.error')
  })()

  const noTokens = tokenBalance < 1
  const canSubmit = imageEntries.length > 0 && !noTokens && !mutation.isPending

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-slate-800">{t('homework.title')}</h1>
        {mutation.isSuccess && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            <RotateCcw size={14} /> {t('homework.reset')}
          </button>
        )}
      </div>
      <p className="text-sm text-slate-500 mb-4">{t('homework.subtitle')}</p>

      {/* Token guard */}
      {noTokens ? (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {t('homework.noTokens')}
        </div>
      ) : (
        <p className="text-xs text-slate-400 mb-4">
          <Zap size={11} className="inline mr-1 text-amber-400" />
          {t('homework.tokenCost')}
        </p>
      )}

      {/* Input area — hidden once result is ready */}
      {!mutation.isSuccess && (
        <div className="space-y-4">

          {/* ── Part A: Problem Condition textarea ── */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              {t('homework.conditionLabel')}
              <span className="ml-1.5 text-xs font-normal text-slate-400">
                ({t('homework.conditionHint')})
              </span>
            </label>
            <textarea
              value={problemText}
              onChange={(e) => setProblemText(e.target.value)}
              rows={3}
              placeholder={t('homework.conditionPlaceholder')}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-700
                         placeholder:text-slate-300 resize-none
                         focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400
                         transition-colors"
            />
          </div>

          {/* ── Part B: Solution photos dropzone ── */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              {t('homework.solutionPhotosLabel')}
            </label>

            <div
              {...getRootProps()}
              className={`rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? 'border-amber-400 bg-amber-50'
                  : 'border-slate-200 bg-slate-50 hover:border-amber-300 hover:bg-amber-50/40'
              }`}
            >
              <input {...getInputProps()} />
              <UploadCloud
                size={34}
                className={`mx-auto mb-2 ${isDragActive ? 'text-amber-500' : 'text-slate-300'}`}
              />
              <p className="text-sm font-medium text-slate-600 mb-0.5">
                {t('homework.upload')}
              </p>
              <p className="text-xs text-slate-400">{t('homework.uploadHint')}</p>
              {imageEntries.length > 0 && (
                <p className="mt-2 text-xs text-amber-600 font-medium">
                  {t('homework.imagesAdded', { count: imageEntries.length })}
                </p>
              )}
            </div>

            {/* Thumbnail strip */}
            {imageEntries.length > 0 && (
              <ThumbnailStrip entries={imageEntries} onRemove={removeImage} />
            )}

            {/* Page-order hint */}
            {imageEntries.length > 1 && (
              <p className="mt-2 text-xs text-slate-400 flex items-center gap-1">
                <ImageIcon size={11} />
                {t('homework.multiPageHint')}
              </p>
            )}
          </div>

          {/* Error banner */}
          {mutation.isError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{errorMsg}</p>
            </div>
          )}

          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!canSubmit}
            className="w-full justify-center"
          >
            {mutation.isPending ? phaseLabel : t('homework.analyze')}
          </Button>
        </div>
      )}

      {/* Results */}
      {mutation.isSuccess && mutation.data && (
        <ResultPanel
          data={mutation.data}
          onNavigateToAnalyzer={(topic) =>
            navigate(`/app/student/analyze?topic=${encodeURIComponent(topic)}`)
          }
        />
      )}
    </div>
  )
}

// ── Result panel ─────────────────────────────────────────────────────────────

function ResultPanel({
  data,
  onNavigateToAnalyzer,
}: {
  data: HomeworkCheckResponse
  onNavigateToAnalyzer: (topic: string) => void
}) {
  const { t } = useTranslation()
  const [showSteps, setShowSteps] = useState(false)

  return (
    <div className="space-y-5">
      {/* ── Feedback card ── */}
      <div
        className={`rounded-xl p-5 border ${
          data.is_correct
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-amber-50 border-amber-200'
        }`}
      >
        <div className="flex items-center gap-2 mb-2">
          {data.is_correct ? (
            <CheckCircle2 size={20} className="text-emerald-600" />
          ) : (
            <AlertCircle size={20} className="text-amber-600" />
          )}
          <h2
            className={`font-semibold text-base ${
              data.is_correct ? 'text-emerald-800' : 'text-amber-800'
            }`}
          >
            {data.is_correct
              ? t('homework.result.correct')
              : t('homework.result.errorFound', {
                  step: data.error_step_index != null ? data.error_step_index + 1 : '?',
                })}
          </h2>
        </div>
        <p
          className={`text-sm leading-relaxed ${
            data.is_correct ? 'text-emerald-700' : 'text-amber-800'
          }`}
        >
          {data.feedback}
        </p>

        {data.weak_topic && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">
              {t('homework.result.weakTopic')}:
            </span>
            <span className="text-xs font-mono bg-white/70 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
              {data.weak_topic.replace(/_/g, ' ')}
            </span>
          </div>
        )}
      </div>

      {/* ── Momentum Bridge CTA ── */}
      {!data.is_correct && data.weak_topic && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-semibold text-indigo-800">
              {t('homework.bridge.title')}
            </p>
            <p className="text-xs text-indigo-600 mt-0.5">
              {t('homework.bridge.subtitle', {
                topic: data.weak_topic.replace(/_/g, ' '),
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateToAnalyzer(data.weak_topic!)}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl
                       bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800
                       text-white text-sm font-semibold shadow-sm transition-colors"
          >
            <Target size={15} />
            {t('homework.bridge.cta')}
          </button>
        </div>
      )}

      {/* ── Extracted steps (collapsible) ── */}
      {data.extracted_steps.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setShowSteps((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <span>{t('homework.result.extractedSteps')}</span>
            {showSteps ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showSteps && (
            <ol className="px-4 pb-4 space-y-2">
              {data.extracted_steps.map((step, idx) => {
                const isWrong = !data.is_correct && data.error_step_index === idx
                return (
                  <li
                    key={idx}
                    className={`flex items-start gap-3 p-2.5 rounded-lg text-sm font-mono ${
                      isWrong
                        ? 'bg-red-50 border border-red-200 text-red-800'
                        : 'bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span
                      className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                        isWrong ? 'bg-red-500 text-white' : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <span className="break-all">
                      <MathText text={step} />
                    </span>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      )}

      {/* ── Practice tasks ── */}
      {data.practice_tasks.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BookOpen size={16} className="text-amber-500" />
            <h3 className="text-base font-semibold text-slate-700">
              {t('homework.result.practiceTitle')}
            </h3>
          </div>
          {data.weak_topic && (
            <p className="text-xs text-slate-400 mb-3">
              {t('homework.result.practiceSubtitle')}{' '}
              <span className="font-mono text-amber-600">
                {data.weak_topic.replace(/_/g, ' ')}
              </span>
            </p>
          )}
          <div className="space-y-3">
            {data.practice_tasks.map((task, i) => (
              <PracticeTaskCard key={i} task={task} index={i} />
            ))}
          </div>
        </div>
      )}

      {!data.is_correct && data.practice_tasks.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-4">
          {t('homework.result.noTasks')}
        </p>
      )}
    </div>
  )
}

// ── Practice task card ────────────────────────────────────────────────────────

function PracticeTaskCard({ task, index }: { task: PracticeTask; index: number }) {
  const { t } = useTranslation()
  const [showAnswer, setShowAnswer] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {t('homework.result.problem')} {index + 1}
        </span>
        <span className="text-xs font-mono text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
          {task.topic.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Question */}
      {task.question_text && (
        <div className="px-4 pb-2 text-sm text-slate-700">
          <MathText text={task.question_text} />
        </div>
      )}

      {/* Condition */}
      <div className="mx-4 mb-3 p-3 bg-slate-50 rounded-lg border border-slate-100 overflow-x-auto">
        <MathRenderer latex={task.condition_latex} block />
      </div>

      {/* Answer toggle */}
      <div className="border-t border-slate-100">
        <button
          type="button"
          onClick={() => setShowAnswer((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
        >
          <span>{t('homework.result.showAnswer')}</span>
          {showAnswer ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {showAnswer && (
          <div className="mx-4 mb-3 p-3 bg-amber-50 rounded-lg border border-amber-100 overflow-x-auto">
            <MathRenderer latex={task.answer_latex} block />
          </div>
        )}
      </div>
    </div>
  )
}
