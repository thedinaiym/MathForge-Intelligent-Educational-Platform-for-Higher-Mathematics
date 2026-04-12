/**
 * PracticePage — topic-based practice session
 *
 * Flow:
 *   Setup   → select category + difficulty + count
 *   Session → show tasks, per-task photo OCR, timer, anti-cheat overlay
 *   Complete → score summary + mastery updated badge
 *
 * Anti-cheat: document.visibilitychange listener records every tab switch.
 * An amber overlay covers the screen and the infraction count is logged.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  Flame,
  RotateCcw,
  Target,
  Trophy,
  XCircle,
  Zap,
  Calculator,
  X,
} from 'lucide-react'
import api from '../../lib/axios'
import { useCategories, type Category } from '../../hooks/useCategories'
import GeoGebraWidget, { type GeoGebraApp } from '../../components/geogebra/GeoGebraWidget'
import i18n from '../../i18n'

// ── Types ─────────────────────────────────────────────────────────────────────

type Difficulty = 'easy' | 'medium' | 'hard'
type Phase = 'setup' | 'session' | 'complete'

interface GeneratedTask {
  question_text: string
  condition_latex: string
  answer_latex: string
}

interface TaskResult {
  status: 'pending' | 'checking' | 'correct' | 'wrong'
  hint?: string | null
  errorIndex?: number | null
}

interface MasteryEntry {
  category_id: string
  category_name: string
  mastery_percentage: number
}

interface StatsResponse {
  heatmap_data: { date: string; count: number }[]
  mastery_data: MasteryEntry[]
  total_analyses: number
}

// ── Timer hook ────────────────────────────────────────────────────────────────

function useTimer(active: boolean) {
  const [seconds, setSeconds] = useState(0)
  const ref = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (active) {
      ref.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    } else {
      if (ref.current) clearInterval(ref.current)
    }
    return () => { if (ref.current) clearInterval(ref.current) }
  }, [active])

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

// ── Mastery ring ──────────────────────────────────────────────────────────────

function MasteryRing({ pct }: { pct: number }) {
  const r = 28
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  const colour = pct >= 75 ? '#10b981' : pct >= 50 ? '#f59e0b' : pct >= 25 ? '#f97316' : '#ef4444'

  return (
    <svg width="72" height="72" className="flex-shrink-0">
      <circle cx="36" cy="36" r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
      <circle
        cx="36" cy="36" r={r} fill="none" stroke={colour} strokeWidth="6"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 36 36)"
        style={{ transition: 'stroke-dashoffset 0.7s ease' }}
      />
      <text x="36" y="40" textAnchor="middle" fontSize="13" fontWeight="700" fill={colour}>
        {Math.round(pct)}%
      </text>
    </svg>
  )
}

// ── GeoGebra locale map ───────────────────────────────────────────────────────

const GGB_LOCALE_MAP: Record<string, string> = {
  ru: 'ru',
  en: 'en',
  kg: 'ky',  // Kyrgyz BCP-47 code GeoGebra understands
}

// ── App selector tab ──────────────────────────────────────────────────────────

const GGB_APPS: { id: GeoGebraApp; label: string; emoji: string }[] = [
  { id: 'graphing',  label: 'Graphing',  emoji: '📈' },
  { id: 'geometry',  label: 'Geometry',  emoji: '📐' },
  { id: '3d',        label: '3D',        emoji: '🧊' },
  { id: 'cas',       label: 'CAS',       emoji: '🔣' },
  { id: 'suite',     label: 'Suite',     emoji: '🎛️' },
]

// ── Math Tools floating button + modal ────────────────────────────────────────

function MathToolsButton() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [selectedApp, setSelectedApp] = useState<GeoGebraApp>('graphing')
  // Re-mount GeoGebra when switching apps by changing a key
  const [mountKey, setMountKey] = useState(0)

  const locale = GGB_LOCALE_MAP[i18n.resolvedLanguage ?? i18n.language ?? 'en'] ?? 'en'

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const handleSelectApp = (app: GeoGebraApp) => {
    setSelectedApp(app)
    setMountKey((k) => k + 1)  // force remount → fresh applet
  }

  return (
    <>
      {/* ── Floating trigger button (bottom-left, avoids avatar on bottom-right) */}
      <button
        onClick={() => setOpen(true)}
        title={t('geogebra.openTool')}
        className="fixed bottom-5 left-5 z-40 flex items-center gap-2 px-4 py-2.5
          rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg
          text-sm font-semibold transition-all hover:-translate-y-0.5 active:translate-y-0"
      >
        <Calculator size={16} />
        <span className="hidden sm:inline">{t('geogebra.mathTools')}</span>
      </button>

      {/* ── Modal ──────────────────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/50"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ width: '100%', maxWidth: 860, height: 'min(90vh, 640px)' }}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Calculator size={16} className="text-indigo-600" />
                <span className="font-semibold text-slate-800 text-sm">{t('geogebra.title')}</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* App tabs */}
            <div className="flex gap-1 px-3 py-2 border-b border-slate-100 flex-shrink-0 overflow-x-auto">
              {GGB_APPS.map((app) => (
                <button
                  key={app.id}
                  onClick={() => handleSelectApp(app.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                    whitespace-nowrap transition-colors ${
                    selectedApp === app.id
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>{app.emoji}</span>
                  {app.label}
                </button>
              ))}

              <div className="ml-auto flex-shrink-0 flex items-center">
                <span className="text-[10px] text-slate-300 italic pr-1">
                  {t('geogebra.poweredBy')}
                </span>
              </div>
            </div>

            {/* GeoGebra canvas — flex-1 fills remaining height */}
            <div className="flex-1 min-h-0 relative">
              <GeoGebraWidget
                key={`${selectedApp}-${mountKey}`}
                appName={selectedApp}
                height={0}  // 0 = let parent flex-1 control height
                showAlgebraInput={selectedApp === 'graphing' || selectedApp === 'cas' || selectedApp === 'suite'}
                showToolBar={true}
                showMenuBar={false}
                showFullscreenButton={true}
                language={locale}
              />
            </div>

            {/* Tip bar */}
            <div className="px-4 py-2 border-t border-slate-50 bg-slate-50/70 flex-shrink-0">
              <p className="text-[11px] text-slate-400">
                {t('geogebra.tip')}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PracticePage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // ── State ──────────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('setup')
  const [selectedCat, setSelectedCat] = useState<Category | null>(null)
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [count, setCount] = useState(5)
  const [tasks, setTasks] = useState<GeneratedTask[]>([])
  const [results, setResults] = useState<TaskResult[]>([])
  const [switchCount, setSwitchCount] = useState(0)
  const [showOverlay, setShowOverlay] = useState(false)
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([])

  // ── Stats (mastery) ────────────────────────────────────────────────────────
  const { data: stats } = useQuery<StatsResponse>({
    queryKey: ['dashboard', 'stats'],
    queryFn: async () => {
      const { data } = await api.get<StatsResponse>('/study/stats')
      return data
    },
    staleTime: 30_000,
  })

  const masteryForCat = (catId: string) =>
    stats?.mastery_data.find((m) => m.category_id === catId)?.mastery_percentage ?? 0

  // ── Categories ─────────────────────────────────────────────────────────────
  const { data: categories = [], isLoading: loadingCats } = useCategories()
  const nonOrtCats = categories.filter(
    (c) => !c.name.toLowerCase().includes('ort') && !c.name.toLowerCase().includes('орт'),
  )

  // ── Timer ──────────────────────────────────────────────────────────────────
  const timerDisplay = useTimer(phase === 'session')

  // ── Anti-cheat: visibilitychange ──────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'session') return
    const handler = () => {
      if (document.hidden) {
        setSwitchCount((n) => n + 1)
        setShowOverlay(true)
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [phase])

  // ── Generate tasks ─────────────────────────────────────────────────────────
  const generateMutation = useMutation<{ tasks: GeneratedTask[] }, Error, void>({
    mutationFn: async () => {
      const { data } = await api.post('/tasks/generate/practice', {
        category_id: selectedCat!.id,
        difficulty,
        count,
      })
      return data
    },
    onSuccess: (data) => {
      setTasks(data.tasks)
      setResults(data.tasks.map(() => ({ status: 'pending' })))
      setPhase('session')
      setSwitchCount(0)
      queryClient.invalidateQueries({ queryKey: ['billing', 'balance'] })
    },
  })

  // ── Check single task via OCR ──────────────────────────────────────────────
  const checkTask = useCallback(async (index: number, file: File) => {
    if (!selectedCat) return
    setResults((prev) => {
      const next = [...prev]
      next[index] = { status: 'checking' }
      return next
    })

    try {
      const form = new FormData()
      form.append('image', file)
      const { data } = await api.post(
        `/study/analyze-image?category_id=${selectedCat.id}`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      setResults((prev) => {
        const next = [...prev]
        next[index] = {
          status: data.status === 'correct' ? 'correct' : 'wrong',
          hint: data.hint,
          errorIndex: data.error_index,
        }
        return next
      })
      queryClient.invalidateQueries({ queryKey: ['billing', 'balance'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] })
    } catch {
      setResults((prev) => {
        const next = [...prev]
        next[index] = { status: 'wrong', hint: t('practice.checkFailed') }
        return next
      })
    }
  }, [selectedCat, queryClient, t])

  const allChecked = results.length > 0 && results.every((r) => r.status === 'correct' || r.status === 'wrong')
  const correctCount = results.filter((r) => r.status === 'correct').length

  // ── Render: setup ──────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="max-w-xl">
        <MathToolsButton />
        <h1 className="text-2xl font-bold text-slate-800 mb-1">{t('practice.title')}</h1>
        <p className="text-sm text-slate-500 mb-6">{t('practice.subtitle')}</p>

        {/* Category picker */}
        <div className="mb-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            {t('practice.selectCategory')}
          </p>
          {loadingCats ? (
            <div className="h-12 bg-slate-100 rounded-xl animate-pulse" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {nonOrtCats.map((cat) => {
                const pct = masteryForCat(cat.id)
                const isSelected = selectedCat?.id === cat.id
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCat(cat)}
                    className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                      isSelected
                        ? 'border-amber-400 bg-amber-50'
                        : 'border-slate-200 bg-white hover:border-amber-300'
                    }`}
                  >
                    <span className="text-sm font-medium text-slate-700">{cat.name}</span>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span>{Math.round(pct)}%</span>
                    </div>
                  </button>
                )
              })}
              {nonOrtCats.length === 0 && (
                <p className="col-span-2 text-sm text-slate-400 text-center py-4">
                  {t('practice.noCategories')}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Difficulty */}
        <div className="mb-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            {t('practice.selectDifficulty')}
          </p>
          <div className="flex gap-2">
            {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                  difficulty === d
                    ? d === 'easy' ? 'border-green-400 bg-green-50 text-green-700'
                      : d === 'medium' ? 'border-amber-400 bg-amber-50 text-amber-700'
                      : 'border-red-400 bg-red-50 text-red-700'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                }`}
              >
                {t(`student.difficulty.${d}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Count */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            {t('practice.questionCount')}
          </p>
          <div className="flex gap-2">
            {[5, 10].map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={`px-5 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                  count === n
                    ? 'border-amber-400 bg-amber-50 text-amber-700'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Selected category mastery preview */}
        {selectedCat && (
          <div className="flex items-center gap-4 p-4 bg-white border border-slate-100 rounded-2xl mb-5 shadow-sm">
            <MasteryRing pct={masteryForCat(selectedCat.id)} />
            <div>
              <p className="text-xs text-slate-400">{t('practice.currentMastery')}</p>
              <p className="font-bold text-slate-800">{selectedCat.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{t('practice.costNote')}</p>
            </div>
          </div>
        )}

        {/* Generate */}
        {generateMutation.isError && (
          <p className="text-sm text-red-500 mb-3">
            {(generateMutation.error as any)?.response?.data?.detail ??
              t('practice.generateError')}
          </p>
        )}
        <button
          disabled={!selectedCat || generateMutation.isPending}
          onClick={() => generateMutation.mutate()}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                     bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed
                     text-white text-sm font-semibold transition-colors shadow-sm"
        >
          <Zap size={16} />
          {generateMutation.isPending ? t('practice.generating') : t('practice.startSession')}
        </button>
      </div>
    )
  }

  // ── Render: session ────────────────────────────────────────────────────────
  if (phase === 'session') {
    const pct = masteryForCat(selectedCat!.id)
    const streak = stats?.heatmap_data.filter((d) => d.count > 0).length ?? 0

    return (
      <div className="max-w-xl">
        <MathToolsButton />
        {/* Anti-cheat overlay */}
        {showOverlay && (
          <div className="fixed inset-0 z-50 bg-amber-500/95 flex flex-col items-center justify-center gap-5 text-white">
            <AlertTriangle size={52} />
            <div className="text-center">
              <p className="text-2xl font-bold">{t('practice.anticheat')}</p>
              <p className="text-sm text-amber-100 mt-1">{t('practice.anticheatDetail')}</p>
              <p className="text-xs text-amber-200 mt-2">
                {t('practice.anticheatCount', { count: switchCount })}
              </p>
            </div>
            <button
              onClick={() => setShowOverlay(false)}
              className="mt-2 px-6 py-2.5 bg-white text-amber-600 font-bold rounded-xl
                         hover:bg-amber-50 transition-colors"
            >
              {t('practice.returnToTask')}
            </button>
          </div>
        )}

        {/* Session header */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">{selectedCat?.name}</h1>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <Clock size={11} /> {timerDisplay}
              </span>
              {switchCount > 0 && (
                <span className="flex items-center gap-1 text-amber-600">
                  <Eye size={11} /> {t('practice.anticheatCount', { count: switchCount })}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Score */}
            <div className="text-center">
              <p className="text-lg font-bold text-slate-800">
                {correctCount}/{results.filter((r) => r.status !== 'pending' && r.status !== 'checking').length}
              </p>
              <p className="text-[10px] text-slate-400">{t('practice.scoreLabel')}</p>
            </div>
            {/* Mastery ring */}
            <MasteryRing pct={pct} />
            {/* Streak */}
            <div className="text-center">
              <div className="flex items-center gap-0.5 justify-center">
                <Flame size={14} className="text-amber-500" />
                <p className="text-lg font-bold text-slate-800">{streak}</p>
              </div>
              <p className="text-[10px] text-slate-400">{t('dashboard.activeDays')}</p>
            </div>
          </div>
        </div>

        {/* Tasks */}
        <div className="space-y-4">
          {tasks.map((task, i) => {
            const result = results[i]
            const isChecking = result.status === 'checking'
            const isDone = result.status === 'correct' || result.status === 'wrong'

            return (
              <div
                key={i}
                className={`bg-white border-2 rounded-2xl p-4 shadow-sm transition-colors ${
                  result.status === 'correct' ? 'border-green-300' :
                  result.status === 'wrong' ? 'border-red-300' :
                  'border-slate-100'
                }`}
              >
                {/* Task header */}
                <div className="flex items-start gap-3 mb-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm text-slate-700">{task.question_text}</p>
                    {task.condition_latex && (
                      <code className="mt-1 block text-xs bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 font-mono text-slate-600 overflow-x-auto">
                        {task.condition_latex}
                      </code>
                    )}
                  </div>
                  {result.status === 'correct' && <CheckCircle2 size={20} className="text-green-500 flex-shrink-0" />}
                  {result.status === 'wrong' && <XCircle size={20} className="text-red-400 flex-shrink-0" />}
                </div>

                {/* Result feedback */}
                {isDone && (
                  <div className={`mb-3 px-3 py-2 rounded-xl text-xs leading-relaxed ${
                    result.status === 'correct'
                      ? 'bg-green-50 text-green-700'
                      : 'bg-red-50 text-red-700'
                  }`}>
                    {result.status === 'correct'
                      ? t('practice.correct')
                      : result.hint ?? t('practice.wrongGeneric')}
                  </div>
                )}

                {/* Upload button */}
                {!isDone && (
                  <>
                    <input
                      ref={(el) => { fileInputRefs.current[i] = el }}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) checkTask(i, file)
                      }}
                    />
                    <button
                      disabled={isChecking}
                      onClick={() => fileInputRefs.current[i]?.click()}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
                                 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white transition-colors"
                    >
                      <Camera size={14} />
                      {isChecking ? t('practice.checking') : t('practice.uploadSolution')}
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* Finish session */}
        {allChecked && (
          <button
            onClick={() => setPhase('complete')}
            className="mt-5 w-full flex items-center justify-center gap-2 py-3 rounded-xl
                       bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors"
          >
            <Trophy size={16} /> {t('practice.finishSession')}
          </button>
        )}
      </div>
    )
  }

  // ── Render: complete ───────────────────────────────────────────────────────
  const finalPct = masteryForCat(selectedCat!.id)

  return (
    <div className="max-w-md mx-auto text-center py-10">
      <MathToolsButton />
      <div className="w-20 h-20 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-5">
        <Trophy size={36} className="text-amber-500" />
      </div>

      <h1 className="text-2xl font-bold text-slate-800 mb-1">{t('practice.sessionComplete')}</h1>
      <p className="text-slate-500 text-sm mb-6">
        {t('practice.finalScore', { correct: correctCount, total: tasks.length })}
      </p>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <CheckCircle2 size={20} className="text-green-500 mx-auto mb-1" />
          <p className="text-xl font-bold text-slate-800">{correctCount}</p>
          <p className="text-xs text-slate-400">{t('practice.correct')}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <Target size={20} className="text-amber-500 mx-auto mb-1" />
          <p className="text-xl font-bold text-slate-800">{Math.round(finalPct)}%</p>
          <p className="text-xs text-slate-400">{t('practice.mastery')}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <Activity size={20} className="text-blue-500 mx-auto mb-1" />
          <p className="text-xl font-bold text-slate-800">{timerDisplay}</p>
          <p className="text-xs text-slate-400">{t('practice.time')}</p>
        </div>
      </div>

      {switchCount > 0 && (
        <div className="flex items-center gap-2 justify-center px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm mb-5">
          <AlertTriangle size={14} />
          {t('practice.anticheatCount', { count: switchCount })}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => {
            setPhase('setup')
            setTasks([])
            setResults([])
            setSwitchCount(0)
          }}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                     border-2 border-slate-200 text-slate-700 text-sm font-semibold
                     hover:border-amber-300 hover:bg-amber-50 transition-all"
        >
          <RotateCcw size={15} /> {t('practice.newSession')}
        </button>
        <button
          onClick={() => {
            setPhase('session')
            setResults(tasks.map(() => ({ status: 'pending' })))
            setSwitchCount(0)
          }}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                     bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors"
        >
          <ChevronRight size={15} /> {t('practice.retry')}
        </button>
      </div>
    </div>
  )
}
