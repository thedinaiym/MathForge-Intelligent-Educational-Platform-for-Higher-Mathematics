import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Play, Clock, Eye, BookOpen } from 'lucide-react'

// ── Mock data ─────────────────────────────────────────────────────────────────

const VIDEOS = [
  {
    id: 1,
    titleKey: 'videos.v1Title',
    duration: '15:24',
    views: '12.4K',
    category: 'videos.catCalculus',
    level: 'videos.levelBeginner',
    gradient: 'from-blue-600 via-blue-700 to-indigo-800',
    icon: '∫',
    iconColor: 'text-blue-200',
  },
  {
    id: 2,
    titleKey: 'videos.v2Title',
    duration: '22:10',
    views: '9.8K',
    category: 'videos.catLinearAlgebra',
    level: 'videos.levelBeginner',
    gradient: 'from-violet-600 via-purple-700 to-violet-900',
    icon: '⊡',
    iconColor: 'text-violet-200',
  },
  {
    id: 3,
    titleKey: 'videos.v3Title',
    duration: '18:45',
    views: '7.2K',
    category: 'videos.catLinearAlgebra',
    level: 'videos.levelIntermediate',
    gradient: 'from-amber-600 via-orange-700 to-red-800',
    icon: 'λ',
    iconColor: 'text-amber-200',
  },
  {
    id: 4,
    titleKey: 'videos.v4Title',
    duration: '25:30',
    views: '15.1K',
    category: 'videos.catCalculus',
    level: 'videos.levelBeginner',
    gradient: 'from-emerald-600 via-teal-700 to-cyan-800',
    icon: 'lim',
    iconColor: 'text-emerald-200',
  },
  {
    id: 5,
    titleKey: 'videos.v5Title',
    duration: '20:15',
    views: '6.5K',
    category: 'videos.catLinearAlgebra',
    level: 'videos.levelIntermediate',
    gradient: 'from-pink-600 via-rose-700 to-red-800',
    icon: 'Ax',
    iconColor: 'text-pink-200',
  },
  {
    id: 6,
    titleKey: 'videos.v6Title',
    duration: '17:55',
    views: '18.3K',
    category: 'videos.catCalculus',
    level: 'videos.levelBeginner',
    gradient: 'from-slate-600 via-slate-700 to-slate-800',
    icon: "f'",
    iconColor: 'text-slate-300',
  },
]

const LEVEL_COLORS: Record<string, string> = {
  'videos.levelBeginner':     'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'videos.levelIntermediate': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'videos.levelAdvanced':     'bg-red-500/20 text-red-400 border-red-500/30',
}

// ── Video card ────────────────────────────────────────────────────────────────

function VideoCard({ video }: { video: (typeof VIDEOS)[number] }) {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="group bg-slate-900/60 backdrop-blur-sm border border-slate-700/50 rounded-2xl overflow-hidden hover:border-slate-600 hover:shadow-2xl hover:shadow-black/50 transition-all duration-300 hover:-translate-y-1 flex flex-col"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Thumbnail */}
      <div className={`relative h-44 bg-gradient-to-br ${video.gradient} flex items-center justify-center overflow-hidden`}>
        {/* Math symbol watermark */}
        <span className={`absolute right-4 bottom-2 text-6xl font-bold opacity-20 ${video.iconColor} select-none`}>
          {video.icon}
        </span>

        {/* Play button overlay */}
        <div
          className={`w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center transition-all duration-300 ${
            hovered ? 'scale-110 bg-white/30' : 'scale-100'
          }`}
        >
          <Play size={22} className="text-white fill-white ml-1" />
        </div>

        {/* Duration badge */}
        <div className="absolute bottom-3 left-3 flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white text-xs font-medium px-2 py-0.5 rounded-md">
          <Clock size={10} />
          {video.duration}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1">
        {/* Category + Level */}
        <div className="flex items-center gap-2 mb-2.5 flex-wrap">
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <BookOpen size={11} />
            {t(video.category)}
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full border font-medium ${LEVEL_COLORS[video.level] ?? ''}`}
          >
            {t(video.level)}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-white font-semibold text-sm leading-snug mb-3 flex-1">
          {t(video.titleKey)}
        </h3>

        {/* Footer row */}
        <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-700/50">
          <span className="flex items-center gap-1 text-slate-500 text-xs">
            <Eye size={11} />
            {video.views} {t('videos.views')}
          </span>
          <button className="text-amber-400 hover:text-amber-300 text-xs font-semibold transition-colors">
            {t('videos.watchNow')} →
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

export default function VideoLessonsSection() {
  const { t } = useTranslation()

  return (
    <section id="videos" className="bg-slate-900 px-6 py-24 scroll-mt-16 relative overflow-hidden">
      {/* Ambient glows */}
      <div className="absolute top-1/2 left-0 w-72 h-72 bg-blue-500/5 rounded-full blur-3xl pointer-events-none -translate-y-1/2" />
      <div className="absolute top-1/2 right-0 w-72 h-72 bg-violet-500/5 rounded-full blur-3xl pointer-events-none -translate-y-1/2" />

      <div className="max-w-6xl mx-auto relative">
        {/* Header */}
        <p className="text-amber-400 text-sm font-semibold uppercase tracking-widest text-center mb-3">
          {t('videos.label')}
        </p>
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-3">
          {t('videos.title')}
        </h2>
        <p className="text-slate-400 text-center text-base max-w-xl mx-auto mb-14">
          {t('videos.subtitle')}
        </p>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {VIDEOS.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>

        {/* CTA strip */}
        <div className="mt-12 text-center">
          <p className="text-slate-500 text-sm mb-4">{t('videos.comingSoonHint')}</p>
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-700 text-slate-400 text-sm">
            {t('videos.notifyMe')}
          </div>
        </div>
      </div>
    </section>
  )
}
