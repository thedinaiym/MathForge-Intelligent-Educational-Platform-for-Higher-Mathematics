/**
 * HomeworkChecker — Phase 18
 *
 * Upload a photo of handwritten homework → AI pipeline:
 *   1. Groq Vision  — extract solution steps from the image
 *   2. Groq Tutor   — identify errors, explain the concept, suggest weak topic
 *   3. TaskGenerator — generate 3 SymPy practice problems for the weak topic
 *
 * Cost: 1 token per check.
 */
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useDropzone } from 'react-dropzone'
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  UploadCloud,
  X,
  Zap,
} from 'lucide-react'
import api from '../../lib/axios'
import { useUIStore } from '../../store/uiStore'
import MathRenderer from '../../components/math/MathRenderer'
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

// ── Main component ───────────────────────────────────────────────────────────

export default function HomeworkChecker() {
  const { t } = useTranslation()
  const { tokenBalance } = useUIStore()
  const queryClient = useQueryClient()

  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const phases = [
    t('homework.phases.scanning'),
    t('homework.phases.analyzing'),
    t('homework.phases.finding'),
  ]

  const onDrop = useCallback((accepted: File[]) => {
    const f = accepted[0]
    if (!f) return
    setImageFile(f)
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(f)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': [], 'image/png': [], 'image/webp': [] },
    maxSize: 10 * 1024 * 1024,
    multiple: false,
  })

  const mutation = useMutation<HomeworkCheckResponse, Error>({
    mutationFn: async () => {
      if (!imageFile) throw new Error('No image selected')
      const form = new FormData()
      form.append('image', imageFile)
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

  const clearImage = () => {
    setImageFile(null)
    setImagePreview(null)
  }

  const handleReset = () => {
    clearImage()
    mutation.reset()
  }

  const errorMsg = (() => {
    if (!mutation.error) return ''
    const detail = (mutation.error as any)?.response?.data?.detail
    return typeof detail === 'string' ? detail : t('common.error')
  })()

  const noTokens = tokenBalance < 1
  const canSubmit = !!imageFile && !noTokens && !mutation.isPending

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

      {/* Upload zone — hidden once result is ready */}
      {!mutation.isSuccess && (
        <>
          {!imagePreview ? (
            <div
              {...getRootProps()}
              className={`rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors mb-4 ${
                isDragActive
                  ? 'border-amber-400 bg-amber-50'
                  : 'border-slate-200 bg-slate-50 hover:border-amber-300 hover:bg-amber-50/40'
              }`}
            >
              <input {...getInputProps()} />
              <UploadCloud
                size={40}
                className={`mx-auto mb-3 ${isDragActive ? 'text-amber-500' : 'text-slate-300'}`}
              />
              <p className="text-sm font-medium text-slate-600 mb-1">
                {t('homework.upload')}
              </p>
              <p className="text-xs text-slate-400">{t('homework.uploadHint')}</p>
            </div>
          ) : (
            <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50 mb-4">
              <img
                src={imagePreview}
                alt="homework preview"
                className="w-full max-h-72 object-contain"
              />
              <button
                onClick={(e) => { e.stopPropagation(); clearImage() }}
                className="absolute top-2 right-2 bg-white/90 hover:bg-white rounded-full p-1.5 shadow text-slate-600 hover:text-red-500 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Error banner */}
          {mutation.isError && (
            <div className="flex items-start gap-2 p-3 mb-4 bg-red-50 border border-red-200 rounded-xl">
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
        </>
      )}

      {/* Results */}
      {mutation.isSuccess && mutation.data && (
        <ResultPanel data={mutation.data} />
      )}
    </div>
  )
}

// ── Result panel ─────────────────────────────────────────────────────────────

function ResultPanel({ data }: { data: HomeworkCheckResponse }) {
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
          <h2 className={`font-semibold text-base ${data.is_correct ? 'text-emerald-800' : 'text-amber-800'}`}>
            {data.is_correct
              ? t('homework.result.correct')
              : t('homework.result.errorFound', {
                  step: data.error_step_index != null ? data.error_step_index + 1 : '?',
                })}
          </h2>
        </div>
        <p className={`text-sm leading-relaxed ${data.is_correct ? 'text-emerald-700' : 'text-amber-800'}`}>
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
                const isWrong =
                  !data.is_correct && data.error_step_index === idx
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
                    <span className="break-all">{step}</span>
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
              {t('homework.result.practiceSubtitle')}
              {' '}
              <span className="font-mono text-amber-600">{data.weak_topic.replace(/_/g, ' ')}</span>
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
          <MathRenderer latex={task.question_text} block={false} />
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
