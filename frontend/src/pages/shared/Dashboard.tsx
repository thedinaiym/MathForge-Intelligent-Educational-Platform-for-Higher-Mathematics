import { useState } from 'react'
import CalendarHeatmap from 'react-calendar-heatmap'
import 'react-calendar-heatmap/dist/styles.css'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Activity, Brain, ChevronRight, Flame, Target, Trophy, Zap } from 'lucide-react'
import api from '../../lib/axios'
import { useAuthStore } from '../../store/authStore'

// ── Types ──────────────────────────────────────────────────────────────────────

interface HeatmapEntry {
  date: string
  count: number
}

interface MasteryEntry {
  category_id: string
  category_name: string
  mastery_percentage: number
}

interface StatsResponse {
  heatmap_data: HeatmapEntry[]
  mastery_data: MasteryEntry[]
  total_analyses: number
}

interface GeneratedTask {
  question_text: string
  condition_latex: string
  answer_latex: string
}

interface AdaptiveResponse {
  tasks: GeneratedTask[]
}

// ── Heatmap colour scale (amber theme) ────────────────────────────────────────

const HEATMAP_CSS = `
  .react-calendar-heatmap .color-empty { fill: #1e293b; }
  .react-calendar-heatmap .color-scale-1 { fill: #78350f; }
  .react-calendar-heatmap .color-scale-2 { fill: #92400e; }
  .react-calendar-heatmap .color-scale-3 { fill: #b45309; }
  .react-calendar-heatmap .color-scale-4 { fill: #d97706; }
  .react-calendar-heatmap .color-scale-5 { fill: #fbbf24; }
  .react-calendar-heatmap rect { rx: 2; }
`

function heatmapClass(value: { count: number } | null | undefined): string {
  if (!value || value.count === 0) return 'color-empty'
  if (value.count === 1) return 'color-scale-1'
  if (value.count === 2) return 'color-scale-2'
  if (value.count <= 4) return 'color-scale-3'
  if (value.count <= 7) return 'color-scale-4'
  return 'color-scale-5'
}

// ── Mastery bar ────────────────────────────────────────────────────────────────

function MasteryBar({ entry }: { entry: MasteryEntry }) {
  const pct = Math.min(entry.mastery_percentage, 100)

  const colour =
    pct >= 75 ? 'bg-emerald-500' :
    pct >= 50 ? 'bg-amber-500' :
    pct >= 25 ? 'bg-orange-500' :
    'bg-red-500'

  const label =
    pct >= 75 ? '🟢' :
    pct >= 50 ? '🟡' :
    pct >= 25 ? '🟠' : '🔴'

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-700 font-medium">{label} {entry.category_name}</span>
        <span className="text-slate-500 font-mono text-xs">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${colour}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ── Adaptive task card ─────────────────────────────────────────────────────────

function TaskCard({ task, index }: { task: GeneratedTask; index: number }) {
  const [showAnswer, setShowAnswer] = useState(false)

  return (
    <div className="border border-slate-200 rounded-xl p-4 space-y-2 bg-white">
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center">
          {index + 1}
        </span>
        <p className="text-slate-700 text-sm flex-1">{task.question_text}</p>
      </div>
      {task.condition_latex && (
        <code className="block text-xs bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-slate-600 font-mono overflow-x-auto">
          {task.condition_latex}
        </code>
      )}
      <button
        onClick={() => setShowAnswer((v) => !v)}
        className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 font-medium transition-colors"
      >
        {showAnswer ? 'Hide answer' : 'Show answer'}
        <ChevronRight size={12} className={`transition-transform ${showAnswer ? 'rotate-90' : ''}`} />
      </button>
      {showAnswer && (
        <code className="block text-xs bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 text-emerald-700 font-mono overflow-x-auto">
          {task.answer_latex}
        </code>
      )}
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const isStudent = user?.role === 'student'

  const today = new Date()
  const yearAgo = new Date(today)
  yearAgo.setFullYear(yearAgo.getFullYear() - 1)

  // ── Stats query ────────────────────────────────────────────────────────────
  const { data: stats, isLoading } = useQuery<StatsResponse>({
    queryKey: ['dashboard', 'stats'],
    queryFn: async () => {
      const { data } = await api.get<StatsResponse>('/study/stats')
      return data
    },
  })

  // ── Adaptive practice mutation ─────────────────────────────────────────────
  const [adaptiveTasks, setAdaptiveTasks] = useState<GeneratedTask[]>([])

  const adaptive = useMutation<AdaptiveResponse, Error, void>({
    mutationFn: async () => {
      const { data } = await api.post<AdaptiveResponse>('/tasks/generate/adaptive', {
        difficulty: 'easy',
        count: 5,
      })
      return data
    },
    onSuccess: (data) => {
      setAdaptiveTasks(data.tasks)
      queryClient.invalidateQueries({ queryKey: ['billing', 'balance'] })
    },
  })

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-8 space-y-6 animate-pulse">
        <div className="h-8 w-56 bg-slate-200 rounded-lg" />
        <div className="h-40 bg-slate-100 rounded-2xl" />
        <div className="h-48 bg-slate-100 rounded-2xl" />
      </div>
    )
  }

  const heatmap = stats?.heatmap_data ?? []
  const mastery = stats?.mastery_data ?? []
  const totalAnalyses = stats?.total_analyses ?? 0
  const streak = heatmap.filter((d) => d.count > 0).length   // unique active days

  return (
    <>
      {/* Amber heatmap colours injected as a global style */}
      <style>{HEATMAP_CSS}</style>

      <div className="p-6 md:p-8 space-y-8 max-w-4xl mx-auto">

        {/* ── Hero header ───────────────────────────────────────────────────── */}
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {t('dashboard.hello', { name: user?.name?.split(' ')[0] ?? '' })}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {t('dashboard.subtitle')}
          </p>
        </div>

        {/* ── Stat cards ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <Flame size={20} className="text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{totalAnalyses}</p>
              <p className="text-xs text-slate-500">{t('dashboard.totalAnalyses')}</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Activity size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{streak}</p>
              <p className="text-xs text-slate-500">{t('dashboard.activeDays')}</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Trophy size={20} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{mastery.length}</p>
              <p className="text-xs text-slate-500">{t('dashboard.topicsTracked')}</p>
            </div>
          </div>
        </div>

        {/* ── Activity heatmap ──────────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <Activity size={18} className="text-amber-500" />
            <h2 className="text-base font-semibold text-slate-700">
              {t('dashboard.activityTitle')}
            </h2>
          </div>

          <div className="overflow-x-auto">
            <CalendarHeatmap
              startDate={yearAgo}
              endDate={today}
              values={heatmap}
              classForValue={heatmapClass}
              titleForValue={(value) =>
                value && value.count > 0
                  ? `${value.date}: ${value.count} ${t('dashboard.analyses')}`
                  : t('dashboard.noActivity')
              }
              showWeekdayLabels
            />
          </div>

          {/* Legend */}
          <div className="flex items-center justify-end gap-2 mt-3 text-xs text-slate-400">
            <span>{t('dashboard.less')}</span>
            {['color-empty', 'color-scale-1', 'color-scale-3', 'color-scale-5'].map((c) => (
              <svg key={c} width="12" height="12">
                <rect width="12" height="12" rx="2" className={c} />
              </svg>
            ))}
            <span>{t('dashboard.more')}</span>
          </div>
        </div>

        {/* ── Mastery progress (students only) ─────────────────────────────── */}
        {isStudent && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-5">
              <Target size={18} className="text-amber-500" />
              <h2 className="text-base font-semibold text-slate-700">
                {t('dashboard.masteryTitle')}
              </h2>
            </div>

            {mastery.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                <Brain size={32} className="mx-auto mb-2 opacity-30" />
                {t('dashboard.masteryEmpty')}
              </div>
            ) : (
              <div className="space-y-4">
                {mastery.map((entry) => (
                  <MasteryBar key={entry.category_id} entry={entry} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Adaptive practice (students only) ────────────────────────────── */}
        {isStudent && (
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Zap size={18} className="text-amber-600" />
                  <h2 className="text-base font-semibold text-slate-700">
                    {t('dashboard.adaptiveTitle')}
                  </h2>
                </div>
                <p className="text-sm text-slate-500">
                  {t('dashboard.adaptiveSubtitle')}
                </p>
              </div>

              <button
                onClick={() => adaptive.mutate()}
                disabled={adaptive.isPending}
                className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors"
              >
                <Zap size={16} />
                {adaptive.isPending
                  ? t('dashboard.generating')
                  : t('dashboard.generateBtn')}
              </button>
            </div>

            {/* Error state */}
            {adaptive.isError && (
              <p className="mt-4 text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-2">
                {(adaptive.error as Error).message}
              </p>
            )}

            {/* Generated tasks */}
            {adaptiveTasks.length > 0 && (
              <div className="mt-5 space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {t('dashboard.practiceProblems')}
                </p>
                {adaptiveTasks.map((task, i) => (
                  <TaskCard key={i} task={task} index={i} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Teacher view: mastery note ────────────────────────────────────── */}
        {!isStudent && mastery.length === 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center text-slate-500 text-sm">
            <Brain size={32} className="mx-auto mb-2 text-slate-300" />
            {t('dashboard.teacherNote')}
          </div>
        )}

      </div>
    </>
  )
}
