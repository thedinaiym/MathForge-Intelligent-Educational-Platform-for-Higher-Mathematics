/**
 * HintDisplay
 *
 * Renders the Arbitrator + Groq response for a student's solution:
 *  - "correct" → green success card
 *  - "error_found" → shows which step is wrong + the Groq-generated hint
 *
 * Design rules (CLAUDE.md):
 *   - Groq produces text only — no LaTeX rendered inside the hint
 *   - The error step index is shown in a visually distinct badge
 */
import { useTranslation } from 'react-i18next'
import { CheckCircle, AlertTriangle, Lightbulb } from 'lucide-react'
import type { AnalysisResult } from '../../store/mathStore'

interface HintDisplayProps {
  result: AnalysisResult
  steps: string[]
}

export default function HintDisplay({ result, steps }: HintDisplayProps) {
  const { t } = useTranslation()

  if (result.status === 'correct') {
    return (
      <div className="flex items-start gap-3 p-4 rounded-xl bg-green-50 border border-green-200">
        <CheckCircle className="text-green-500 flex-shrink-0 mt-0.5" size={20} />
        <div>
          <p className="font-semibold text-green-800">{t('student.result.correct')}</p>
          <p className="text-sm text-green-700 mt-0.5">{t('student.result.correctDetail')}</p>
        </div>
      </div>
    )
  }

  const errorIdx = result.error_index ?? 0
  const stepBefore = steps[errorIdx - 1] ?? ''
  const stepWithError = steps[errorIdx] ?? ''

  return (
    <div className="space-y-3">
      {/* Error location card */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
        <AlertTriangle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
        <div className="min-w-0">
          <p className="font-semibold text-red-800">
            {t('student.result.errorFound', { step: errorIdx + 1 })}
          </p>
          <p className="text-sm text-red-700 mt-0.5">{t('student.result.errorDetail')}</p>

          {/* Show the erroneous transition */}
          <div className="mt-3 space-y-1.5 text-xs">
            {stepBefore && (
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium whitespace-nowrap">
                  {t('student.stepLabel', { n: errorIdx })} ✓
                </span>
                <code className="font-mono text-slate-600 truncate">{stepBefore}</code>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 bg-red-200 text-red-700 rounded font-medium whitespace-nowrap">
                {t('student.stepLabel', { n: errorIdx + 1 })} ✗
              </span>
              <code className="font-mono text-red-700 truncate">{stepWithError}</code>
            </div>
          </div>
        </div>
      </div>

      {/* Groq hint card — text only, no LaTeX */}
      {result.hint && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
          <Lightbulb className="text-amber-500 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">
              {t('student.result.hint')}
            </p>
            <p className="text-sm text-amber-900 leading-relaxed">{result.hint}</p>
          </div>
        </div>
      )}

      {/* When hint failed (no API key / network error) — silent */}
      {!result.hint && (
        <p className="text-xs text-slate-400 text-center">{t('student.result.noHint')}</p>
      )}
    </div>
  )
}
