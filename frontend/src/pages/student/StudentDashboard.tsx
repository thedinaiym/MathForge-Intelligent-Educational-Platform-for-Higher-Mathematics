/**
 * StudentDashboard — Subject selection + ORT practice mode.
 *
 * Flow:
 *   1. Category cards (fetched from /tasks/categories)
 *   2a. ORT Math → Part selector → POST /ort/generate → inline problem display
 *   2b. Calculus / Linear Algebra → topic info → navigate to analyzer
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, BookOpen, Brain, Calculator, ChevronRight, FileQuestion, RotateCcw, GraduationCap } from 'lucide-react'
import api from '../../lib/axios'
import { useCategories, type Category } from '../../hooks/useCategories'
import { useQueryClient } from '@tanstack/react-query'
import { useMathStore } from '../../store/mathStore'
import { InlineMath } from 'react-katex'
import 'katex/dist/katex.min.css'
import JoinClassModal from '../../components/classes/JoinClassModal'

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrtComparisonProblem {
  number: number
  given: string
  col_a_label: string
  col_b_label: string
  answer_label: string
}

interface OrtMcProblem {
  number: number
  question: string
  choices: string[]
  correct_label: string
}

interface OrtResponse {
  part: 1 | 2
  problems: OrtComparisonProblem[] | OrtMcProblem[]
  answer_key: string[]
}

type OrtPart = 1 | 2

// ── Category icon & colour map ────────────────────────────────────────────────

function getCategoryStyle(name: string): {
  icon: React.ReactNode
  gradient: string
  border: string
  badge: string
} {
  const lower = name.toLowerCase()
  if (lower.includes('ort') || lower.includes('орт')) {
    return {
      icon: <FileQuestion size={28} className="text-violet-600" />,
      gradient: 'from-violet-50 to-purple-50',
      border: 'border-violet-200 hover:border-violet-400',
      badge: 'bg-violet-100 text-violet-700',
    }
  }
  if (lower.includes('calculus') || lower.includes('анализ') || lower.includes('анализ')) {
    return {
      icon: <Calculator size={28} className="text-amber-600" />,
      gradient: 'from-amber-50 to-orange-50',
      border: 'border-amber-200 hover:border-amber-400',
      badge: 'bg-amber-100 text-amber-700',
    }
  }
  return {
    icon: <Brain size={28} className="text-sky-600" />,
    gradient: 'from-sky-50 to-blue-50',
    border: 'border-sky-200 hover:border-sky-400',
    badge: 'bg-sky-100 text-sky-700',
  }
}

// ── Loading spinner ───────────────────────────────────────────────────────────

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-slate-500 animate-pulse">{label}</p>
    </div>
  )
}

// ── ORT Part selector ─────────────────────────────────────────────────────────

function OrtPartSelector({
  onSelect,
}: {
  onSelect: (part: OrtPart) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="mt-6">
      <h2 className="text-lg font-bold text-slate-800 mb-1">{t('student.ort.choosePartTitle')}</h2>
      <p className="text-sm text-slate-500 mb-5">{t('student.ort.choosePartSubtitle')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={() => onSelect(1)}
          className="group p-6 rounded-2xl border-2 border-violet-200 hover:border-violet-400
                     bg-gradient-to-br from-violet-50 to-purple-50
                     text-left transition-all hover:shadow-md hover:-translate-y-0.5"
        >
          <div className="text-2xl font-black text-violet-600 mb-2">I</div>
          <div className="font-semibold text-slate-800 text-sm">{t('student.ort.part1Title')}</div>
          <div className="text-xs text-slate-500 mt-1">{t('student.ort.part1Desc')}</div>
          <div className="mt-3 flex items-center gap-1 text-xs text-violet-600 font-medium">
            {t('student.ort.startPractice')} <ChevronRight size={12} />
          </div>
        </button>
        <button
          onClick={() => onSelect(2)}
          className="group p-6 rounded-2xl border-2 border-purple-200 hover:border-purple-400
                     bg-gradient-to-br from-purple-50 to-pink-50
                     text-left transition-all hover:shadow-md hover:-translate-y-0.5"
        >
          <div className="text-2xl font-black text-purple-600 mb-2">II</div>
          <div className="font-semibold text-slate-800 text-sm">{t('student.ort.part2Title')}</div>
          <div className="text-xs text-slate-500 mt-1">{t('student.ort.part2Desc')}</div>
          <div className="mt-3 flex items-center gap-1 text-xs text-purple-600 font-medium">
            {t('student.ort.startPractice')} <ChevronRight size={12} />
          </div>
        </button>
      </div>
    </div>
  )
}

// ── ORT Part 1: comparison problems ──────────────────────────────────────────

function OrtPart1Display({
  problems,
  answers,
  revealed,
  userAnswers,
  onAnswer,
  onReveal,
  onAnalyze,
}: {
  problems: OrtComparisonProblem[]
  answers: string[]
  revealed: boolean
  userAnswers: Record<number, string>
  onAnswer: (num: number, ans: string) => void
  onReveal: () => void
  onAnalyze: (problemText: string) => void
}) {
  const { t } = useTranslation()
  const choices = ['А', 'Б', 'В', 'Г']

  return (
    <div className="space-y-4 mt-4">
      <div className="p-3 bg-violet-50 border border-violet-100 rounded-xl text-xs text-violet-700">
        <strong>{t('student.ort.instruction1Header')}: </strong>
        {t('student.ort.instruction1Body')}
      </div>

      {problems.map((p) => {
        const selected = userAnswers[p.number]
        const correct = answers[p.number - 1]
        return (
          <div key={p.number} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <div className="flex items-start gap-3 mb-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center">
                {p.number}
              </span>
              {p.given && (
                <span className="text-sm text-slate-600">{p.given}</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center">
                <div className="text-xs font-semibold text-slate-500 mb-1">{t('student.ort.colA')}</div>
                <div className="text-sm font-medium">
                  <RenderLatex text={p.col_a_label} />
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center">
                <div className="text-xs font-semibold text-slate-500 mb-1">{t('student.ort.colB')}</div>
                <div className="text-sm font-medium">
                  <RenderLatex text={p.col_b_label} />
                </div>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {choices.map((ch) => {
                let cls = 'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all '
                if (revealed) {
                  if (ch === correct) cls += 'bg-green-100 border-green-400 text-green-700'
                  else if (ch === selected && ch !== correct) cls += 'bg-red-100 border-red-300 text-red-600'
                  else cls += 'bg-slate-50 border-slate-200 text-slate-400'
                } else if (ch === selected) {
                  cls += 'bg-violet-100 border-violet-400 text-violet-700'
                } else {
                  cls += 'bg-slate-50 border-slate-200 text-slate-600 hover:border-violet-300 hover:bg-violet-50 cursor-pointer'
                }
                return (
                  <button
                    key={ch}
                    className={cls}
                    onClick={() => !revealed && onAnswer(p.number, ch)}
                    disabled={revealed}
                  >
                    {ch}
                  </button>
                )
              })}
            </div>
            {revealed && selected && selected !== correct && (
              <button
                onClick={() => onAnalyze(`Сравните: ${p.col_a_label} и ${p.col_b_label}`)}
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-800 font-medium underline underline-offset-2"
              >
                <Brain size={11} /> {t('student.ort.analyzeStep')}
              </button>
            )}
          </div>
        )
      })}

      {!revealed && (
        <button
          onClick={onReveal}
          className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors"
        >
          {t('student.ort.showAnswers')}
        </button>
      )}
      {revealed && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800 text-center font-medium">
          {t('student.ort.answersRevealed')}
        </div>
      )}
    </div>
  )
}

// ── ORT Part 2: multiple choice problems ──────────────────────────────────────

function OrtPart2Display({
  problems,
  answers,
  revealed,
  userAnswers,
  onAnswer,
  onReveal,
  onAnalyze,
}: {
  problems: OrtMcProblem[]
  answers: string[]
  revealed: boolean
  userAnswers: Record<number, string>
  onAnswer: (num: number, ans: string) => void
  onReveal: () => void
  onAnalyze: (problemText: string) => void
}) {
  const { t } = useTranslation()
  const labels = ['А', 'Б', 'В', 'Г', 'Д']

  return (
    <div className="space-y-4 mt-4">
      <div className="p-3 bg-purple-50 border border-purple-100 rounded-xl text-xs text-purple-700">
        <strong>{t('student.ort.instruction2Header')}: </strong>
        {t('student.ort.instruction2Body')}
      </div>

      {problems.map((p) => {
        const selected = userAnswers[p.number]
        const correct = answers[p.number - 1]
        return (
          <div key={p.number} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <div className="flex items-start gap-3 mb-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center">
                {p.number}
              </span>
              <div className="text-sm text-slate-700">
                <RenderLatex text={p.question} />
              </div>
            </div>
            <div className="space-y-2">
              {p.choices.map((choice, idx) => {
                const lbl = labels[idx]
                let cls = 'w-full flex items-center gap-3 px-3 py-2 rounded-xl border text-sm transition-all text-left '
                if (revealed) {
                  if (lbl === correct) cls += 'bg-green-100 border-green-400 text-green-700'
                  else if (lbl === selected && lbl !== correct) cls += 'bg-red-100 border-red-300 text-red-600'
                  else cls += 'bg-slate-50 border-slate-200 text-slate-400'
                } else if (lbl === selected) {
                  cls += 'bg-purple-100 border-purple-400 text-purple-700'
                } else {
                  cls += 'bg-slate-50 border-slate-200 text-slate-700 hover:border-purple-300 hover:bg-purple-50 cursor-pointer'
                }
                return (
                  <button
                    key={lbl}
                    className={cls}
                    onClick={() => !revealed && onAnswer(p.number, lbl)}
                    disabled={revealed}
                  >
                    <span className="font-bold w-6 flex-shrink-0">{lbl})</span>
                    <RenderLatex text={choice} />
                  </button>
                )
              })}
            </div>
            {revealed && selected && selected !== correct && (
              <button
                onClick={() => onAnalyze(p.question)}
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-800 font-medium underline underline-offset-2"
              >
                <Brain size={11} /> {t('student.ort.analyzeStep')}
              </button>
            )}
          </div>
        )
      })}

      {!revealed && (
        <button
          onClick={onReveal}
          className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors"
        >
          {t('student.ort.showAnswers')}
        </button>
      )}
      {revealed && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800 text-center font-medium">
          {t('student.ort.answersRevealed')}
        </div>
      )}
    </div>
  )
}

// ── LaTeX inline renderer (strips $...$ delimiters from backend strings) ──────

function RenderLatex({ text }: { text: string }) {
  if (!text) return null
  // Split on $...$ blocks and render math inline
  const parts = text.split(/(\$[^$]+\$)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('$') && part.endsWith('$')) {
          const math = part.slice(1, -1)
          return (
            <span key={i} className="inline-block">
              <InlineMath math={math} />
            </span>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

// ── Non-ORT category detail panel ─────────────────────────────────────────────

function CategoryDetailPanel({
  category,
  onAnalyze,
}: {
  category: Category
  onAnalyze: () => void
}) {
  const { t } = useTranslation()
  const style = getCategoryStyle(category.name)

  return (
    <div className="mt-6">
      <div className={`p-6 rounded-2xl bg-gradient-to-br ${style.gradient} border-2 ${style.border.split(' ')[0]} mb-5`}>
        <div className="flex items-center gap-3 mb-3">
          {style.icon}
          <h2 className="text-lg font-bold text-slate-800">{category.name}</h2>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          {t('student.category.description')}
        </p>
        <button
          onClick={onAnalyze}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-slate-200
                     text-sm font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition-all"
        >
          <BookOpen size={15} />
          {t('student.category.goToAnalyzer')}
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(['easy', 'medium', 'hard'] as const).map((diff) => (
          <button
            key={diff}
            onClick={onAnalyze}
            className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm text-left hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
          >
            <div className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold mb-2 ${
              diff === 'easy' ? 'bg-green-100 text-green-700' :
              diff === 'medium' ? 'bg-amber-100 text-amber-700' :
              'bg-red-100 text-red-700'
            }`}>
              {t(`student.difficulty.${diff}`)}
            </div>
            <p className="text-xs text-slate-500">{t(`student.difficulty.${diff}Desc`)}</p>
            <p className="text-xs text-slate-400 mt-2 font-medium">→ {t('student.category.goToAnalyzer')}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function StudentDashboard() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: categories = [], isLoading: loadingCats, isError: catsError } = useCategories()
  const { clearSteps, updateStep, setInputMode } = useMathStore()

  const [selected, setSelected] = useState<Category | null>(null)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [ortPart, setOrtPart] = useState<OrtPart | null>(null)
  const [ortData, setOrtData] = useState<OrtResponse | null>(null)
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({})
  const [revealed, setRevealed] = useState(false)

  const ortMutation = useMutation<OrtResponse, unknown, OrtPart>({
    mutationFn: async (part) => {
      const { data } = await api.post<OrtResponse>('/ort/generate', {
        part,
        count: 10,
      })
      return data
    },
    onSuccess: (data) => {
      setOrtData(data)
      setUserAnswers({})
      setRevealed(false)
      queryClient.invalidateQueries({ queryKey: ['billing', 'balance'] })
    },
  })

  const handleSelectPart = (part: OrtPart) => {
    setOrtPart(part)
    ortMutation.mutate(part)
  }

  const handleReset = () => {
    setOrtPart(null)
    setOrtData(null)
    setUserAnswers({})
    setRevealed(false)
    ortMutation.reset()
  }

  // Re-generate a fresh set for the same part (keeps the part selector hidden)
  const handleNewSet = () => {
    if (ortPart) {
      setUserAnswers({})
      setRevealed(false)
      ortMutation.mutate(ortPart)
    }
  }

  const handleBack = () => {
    if (ortData || ortPart) {
      handleReset()
    } else {
      setSelected(null)
    }
  }

  // Pre-fill Analyzer with ORT problem text so user can explore why they got it wrong
  const handleAnalyze = (problemText: string) => {
    clearSteps()
    updateStep(0, problemText)
    setInputMode('manual')
    navigate('/app/student/analyze')
  }

  const isOrt = selected && (
    selected.name.toLowerCase().includes('ort') ||
    selected.name.toLowerCase().includes('орт')
  )

  const loadingPhases = [
    t('student.ort.compiling1'),
    t('student.ort.compiling2'),
    t('student.ort.compiling3'),
  ]

  return (
    <div className="max-w-2xl">

      {/* Join Class modal */}
      {showJoinModal && <JoinClassModal onClose={() => setShowJoinModal(false)} />}

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-6">
        {selected && (
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-slate-400 hover:text-slate-700 transition-colors text-sm"
          >
            <ArrowLeft size={16} />
          </button>
        )}
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-800">
            {selected ? selected.name : t('student.dashboard.title')}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {selected
              ? isOrt
                ? t('student.dashboard.ortSubtitle')
                : t('student.dashboard.categorySubtitle')
              : t('student.dashboard.subtitle')}
          </p>
        </div>
        {/* Join class button — only on initial screen */}
        {!selected && (
          <button
            onClick={() => setShowJoinModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-200
              bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-colors flex-shrink-0"
          >
            <GraduationCap size={14} />
            {t('classes.joinButton')}
          </button>
        )}
      </div>

      {/* ── Category grid (initial screen) ──────────────────────────────────── */}
      {!selected && (
        <>
          {loadingCats && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-36 rounded-2xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          )}

          {catsError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              {t('student.dashboard.loadError')}
            </div>
          )}

          {!loadingCats && !catsError && categories.length === 0 && (
            <div className="p-8 bg-slate-50 border border-slate-200 rounded-2xl text-center text-slate-500 text-sm">
              <Brain size={32} className="mx-auto mb-2 opacity-30" />
              {t('student.dashboard.noSubjects')}
            </div>
          )}

          {!loadingCats && !catsError && categories.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {categories.map((cat) => {
                const style = getCategoryStyle(cat.name)
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelected(cat)}
                    className={`group p-5 rounded-2xl bg-gradient-to-br ${style.gradient}
                               border-2 ${style.border} text-left transition-all
                               hover:shadow-lg hover:-translate-y-1 duration-200`}
                  >
                    <div className="mb-3">{style.icon}</div>
                    <div className="font-bold text-slate-800 text-sm leading-snug mb-2">
                      {cat.name}
                    </div>
                    <div className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${style.badge}`}>
                      {t('student.dashboard.explore')}
                    </div>
                    <div className="mt-3 flex items-center gap-1 text-xs text-slate-400 group-hover:text-slate-600 transition-colors">
                      {t('student.dashboard.select')} <ChevronRight size={11} />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── Selected: ORT Math ──────────────────────────────────────────────── */}
      {selected && isOrt && !ortPart && (
        <OrtPartSelector onSelect={handleSelectPart} />
      )}

      {/* Loading ORT problems */}
      {ortMutation.isPending && (
        <Spinner label={loadingPhases[Math.floor(Date.now() / 2200) % loadingPhases.length]} />
      )}

      {/* ORT error */}
      {ortMutation.isError && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm text-red-600 mb-1 font-medium">{t('student.ort.generateError')}</p>
          <p className="text-xs text-red-500 mb-3">
            {(ortMutation.error as any)?.response?.data?.detail
              ?? (ortMutation.error as any)?.message
              ?? t('student.ort.generateError')}
          </p>
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-800 font-medium"
          >
            <RotateCcw size={13} /> {t('student.tryAgain')}
          </button>
        </div>
      )}

      {/* ORT Part 1 problems */}
      {ortData && ortData.part === 1 && !ortMutation.isPending && (
        <>
          <div className="flex items-center justify-between mt-4 mb-2">
            <span className="text-xs text-slate-500">
              {t('student.ort.problemCount', { count: ortData.problems.length })}
            </span>
            <button
              onClick={handleNewSet}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              <RotateCcw size={11} /> {t('student.ort.newSet')}
            </button>
          </div>
          <OrtPart1Display
            problems={ortData.problems as OrtComparisonProblem[]}
            answers={ortData.answer_key}
            revealed={revealed}
            userAnswers={userAnswers}
            onAnswer={(num, ans) => setUserAnswers((prev) => ({ ...prev, [num]: ans }))}
            onReveal={() => setRevealed(true)}
            onAnalyze={handleAnalyze}
          />
        </>
      )}

      {/* ORT Part 2 problems */}
      {ortData && ortData.part === 2 && !ortMutation.isPending && (
        <>
          <div className="flex items-center justify-between mt-4 mb-2">
            <span className="text-xs text-slate-500">
              {t('student.ort.problemCount', { count: ortData.problems.length })}
            </span>
            <button
              onClick={handleNewSet}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              <RotateCcw size={11} /> {t('student.ort.newSet')}
            </button>
          </div>
          <OrtPart2Display
            problems={ortData.problems as OrtMcProblem[]}
            answers={ortData.answer_key}
            revealed={revealed}
            userAnswers={userAnswers}
            onAnswer={(num, ans) => setUserAnswers((prev) => ({ ...prev, [num]: ans }))}
            onReveal={() => setRevealed(true)}
            onAnalyze={handleAnalyze}
          />
        </>
      )}

      {/* ── Selected: non-ORT category ──────────────────────────────────────── */}
      {selected && !isOrt && (
        <CategoryDetailPanel
          category={selected}
          onAnalyze={() => navigate('/app/student/analyze')}
        />
      )}
    </div>
  )
}
