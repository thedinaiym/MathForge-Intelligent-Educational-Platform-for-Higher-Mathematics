/**
 * StudentAnalyzer — Phase 5 implementation
 *
 * Two input modes (tabs):
 *   ✍️  Manual — JSON body  { steps[] }  →  POST /study/analyze
 *   📷  Photo  — FormData  { image }     →  POST /study/analyze-image
 *
 * Photo tab features:
 *  - react-dropzone drag-and-drop with local preview
 *  - Animated multi-phase loading label cycles through:
 *      "Scanning handwriting…" → "Verifying math…" → "Generating hint…"
 */
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { useDropzone } from 'react-dropzone'
import { Camera, FileText, RotateCcw, UploadCloud, X } from 'lucide-react'
import api from '../../lib/axios'
import { useMathStore, type AnalysisResult } from '../../store/mathStore'
import { useUIStore } from '../../store/uiStore'
import StepByStepInput from '../../components/math/StepByStepInput'
import HintDisplay from '../../components/math/HintDisplay'
import Button from '../../components/ui/Button'

// ── Phase-cycling hook ──────────────────────────────────────────────────────

const PHASE_INTERVAL_MS = 2200

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

// ── Main component ──────────────────────────────────────────────────────────

export default function StudentAnalyzer() {
  const { t } = useTranslation()
  const { tokenBalance, decrementToken } = useUIStore()

  const {
    inputMode,
    setInputMode,
    imageFile,
    imagePreview,
    setImageFile,
    clearImage,
    steps,
    addStep,
    updateStep,
    removeStep,
    clearSteps,
    analysisResult,
    setAnalysisResult,
  } = useMathStore()

  // ── Phase label for image loading animation ──────────────────────────────
  const phases = [
    t('student.phases.scanning'),
    t('student.phases.verifying'),
    t('student.phases.hint'),
  ]

  // ── Manual mode mutation ─────────────────────────────────────────────────
  const filledSteps = steps.filter((s) => s.trim().length > 0)
  const canSubmitManual = filledSteps.length >= 2 && tokenBalance >= 0.5

  const manualMutation = useMutation<AnalysisResult, Error>({
    mutationFn: async () => {
      const { data } = await api.post<AnalysisResult>('/study/analyze', {
        steps: filledSteps,
      })
      return data
    },
    onSuccess: (data) => {
      setAnalysisResult(data)
      decrementToken(0.5)
    },
  })

  // ── Image mode mutation ──────────────────────────────────────────────────
  const canSubmitImage = imageFile !== null && tokenBalance >= 0.5

  const imageMutation = useMutation<AnalysisResult, Error>({
    mutationFn: async () => {
      const form = new FormData()
      form.append('image', imageFile as File)
      const { data } = await api.post<AnalysisResult>('/study/analyze-image', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    },
    onSuccess: (data) => {
      setAnalysisResult(data)
      decrementToken(0.5)
    },
  })

  const activePhaseLabel = usePhaseLabel(imageMutation.isPending, phases)

  // ── Dropzone ─────────────────────────────────────────────────────────────
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length > 0) setImageFile(accepted[0])
    },
    [setImageFile],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': [], 'image/png': [], 'image/webp': [] },
    maxSize: 10 * 1024 * 1024, // 10 MB
    multiple: false,
  })

  // ── Shared reset ─────────────────────────────────────────────────────────
  const isSuccess = manualMutation.isSuccess || imageMutation.isSuccess
  const isError = manualMutation.isError || imageMutation.isError
  const isPending = manualMutation.isPending || imageMutation.isPending

  const handleReset = () => {
    clearSteps()
    clearImage()
    manualMutation.reset()
    imageMutation.reset()
  }

  const handleRetry = () => {
    manualMutation.reset()
    imageMutation.reset()
    setAnalysisResult(null)
  }

  // ── Tab switch also resets result ─────────────────────────────────────────
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
          <FileText size={15} />
          {t('student.tabs.manual')}
        </button>
        <button
          onClick={() => switchTab('image')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            inputMode === 'image'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Camera size={15} />
          {t('student.tabs.photo')}
        </button>
      </div>

      {/* ── Manual tab ─────────────────────────────────────────────────── */}
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
          {filledSteps.length < 2 && steps.some((s) => s.trim()) && (
            <p className="mt-3 text-xs text-amber-600">{t('student.minSteps')}</p>
          )}
        </div>
      )}

      {/* ── Photo tab ──────────────────────────────────────────────────── */}
      {inputMode === 'image' && !isSuccess && (
        <div className="mb-5">
          {!imagePreview ? (
            /* Dropzone */
            <div
              {...getRootProps()}
              className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? 'border-amber-400 bg-amber-50'
                  : 'border-slate-200 bg-slate-50 hover:border-amber-300 hover:bg-amber-50/40'
              }`}
            >
              <input {...getInputProps()} />
              <UploadCloud
                size={36}
                className={`mx-auto mb-3 ${isDragActive ? 'text-amber-500' : 'text-slate-400'}`}
              />
              <p className="text-sm font-medium text-slate-700 mb-1">
                {isDragActive ? t('student.uploadPrompt') : t('student.uploadPrompt')}
              </p>
              <p className="text-xs text-slate-400">{t('student.uploadHint')}</p>
            </div>
          ) : (
            /* Image preview */
            <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
              <img
                src={imagePreview}
                alt="solution preview"
                className="w-full max-h-72 object-contain"
              />
              <button
                onClick={(e) => { e.stopPropagation(); clearImage() }}
                className="absolute top-2 right-2 bg-white/90 hover:bg-white rounded-full p-1.5 shadow text-slate-600 hover:text-red-500 transition-colors"
                title="Remove image"
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
              <Button
                variant="secondary"
                onClick={handleReset}
                disabled={isPending}
              >
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
                <Button variant="secondary" onClick={clearImage}>
                  {t('student.clear')}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
