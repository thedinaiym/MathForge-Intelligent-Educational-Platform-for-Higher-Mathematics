/**
 * StepByStepInput
 *
 * Renders a numbered list of text inputs for entering solution steps.
 * Each input shows a live KaTeX preview of the expression typed.
 *
 * Accepts Python-style notation (2*x + 4 = 10) or plain LaTeX (2x + 4 = 10).
 * A light preprocessing layer converts common Python operators to LaTeX
 * so the preview looks clean regardless of which notation the student uses.
 */
import { useTranslation } from 'react-i18next'
import { Plus, X } from 'lucide-react'
import { InlineMath } from 'react-katex'
import 'katex/dist/katex.min.css'

interface StepByStepInputProps {
  steps: string[]
  errorIndex?: number | null   // highlight the erroneous step
  onAdd: () => void
  onUpdate: (index: number, value: string) => void
  onRemove: (index: number) => void
}

/** Convert Python-style math notation to something KaTeX can render. */
function toKatex(expr: string): string {
  return expr
    .replace(/\*\*/g, '^')          // x**2  → x^2
    .replace(/\*/g, '\\cdot ')      // 2*x   → 2 \cdot x
    .replace(/sqrt\((.+?)\)/g, '\\sqrt{$1}')
    .replace(/\bpi\b/g, '\\pi')
    .replace(/\binfty\b/g, '\\infty')
}

export default function StepByStepInput({
  steps,
  errorIndex,
  onAdd,
  onUpdate,
  onRemove,
}: StepByStepInputProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-3">
      {steps.map((step, i) => {
        const isError = errorIndex != null && i === errorIndex
        const isValid = errorIndex != null && i < errorIndex

        return (
          <div key={i} className="flex gap-3 items-start">
            {/* Step number badge */}
            <div
              className={`flex-shrink-0 w-7 h-7 mt-2 rounded-full flex items-center justify-center text-xs font-bold
                ${isError ? 'bg-red-500 text-white'
                  : isValid ? 'bg-green-500 text-white'
                  : 'bg-slate-200 text-slate-600'}`}
            >
              {i + 1}
            </div>

            {/* Input + preview column */}
            <div className="flex-1 min-w-0">
              <div className="relative">
                <input
                  type="text"
                  value={step}
                  onChange={(e) => onUpdate(i, e.target.value)}
                  placeholder={t('student.stepPlaceholder')}
                  className={`w-full px-3 py-2 rounded-lg border text-sm font-mono
                    focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400
                    transition-colors
                    ${isError
                      ? 'border-red-400 bg-red-50 focus:ring-red-400'
                      : 'border-slate-300 bg-white hover:border-slate-400'
                    }`}
                />
              </div>

              {/* Live KaTeX preview */}
              {step.trim() && (
                <div className={`mt-1 px-3 py-1.5 rounded-md text-sm min-h-[2rem]
                  ${isError ? 'bg-red-50 border border-red-100'
                    : 'bg-slate-50 border border-slate-100'}`}>
                  <KatexPreview expr={step} />
                </div>
              )}
            </div>

            {/* Remove button (only when > 2 steps) */}
            {steps.length > 2 && (
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="flex-shrink-0 mt-2 p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                aria-label={t('student.removeStep')}
              >
                <X size={14} />
              </button>
            )}
          </div>
        )
      })}

      {/* Add step button */}
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-2 text-sm text-amber-600 hover:text-amber-700 font-medium py-1 px-2 rounded-lg hover:bg-amber-50 transition-colors"
      >
        <Plus size={15} /> {t('student.addStep')}
      </button>
    </div>
  )
}

/** Isolated KaTeX renderer with error boundary — never crashes the parent. */
function KatexPreview({ expr }: { expr: string }) {
  try {
    return (
      <span className="text-slate-700">
        <InlineMath math={toKatex(expr)} />
      </span>
    )
  } catch {
    // If KaTeX can't parse, show the raw expression — still useful feedback
    return <span className="font-mono text-slate-500 text-xs">{expr}</span>
  }
}
