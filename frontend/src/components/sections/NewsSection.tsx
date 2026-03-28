import { useTranslation } from 'react-i18next'
import { Calendar, ArrowUpRight, Megaphone, Zap, Trophy } from 'lucide-react'

// ── Types & data ──────────────────────────────────────────────────────────────

type NewsCategory = 'event' | 'release' | 'announcement'

interface NewsItem {
  id: number
  titleKey: string
  descKey: string
  date: string
  category: NewsCategory
  featured?: boolean
  location?: string
}

const NEWS: NewsItem[] = [
  {
    id: 1,
    titleKey: 'news.n1Title',
    descKey: 'news.n1Desc',
    date: 'April 15, 2026',
    category: 'event',
    featured: true,
    location: 'Ala-Too International University, Bishkek',
  },
  {
    id: 2,
    titleKey: 'news.n2Title',
    descKey: 'news.n2Desc',
    date: 'May 3, 2026',
    category: 'event',
    location: 'KRSU Innovation Hub',
  },
  {
    id: 3,
    titleKey: 'news.n3Title',
    descKey: 'news.n3Desc',
    date: 'March 28, 2026',
    category: 'release',
  },
  {
    id: 4,
    titleKey: 'news.n4Title',
    descKey: 'news.n4Desc',
    date: 'March 20, 2026',
    category: 'announcement',
  },
  {
    id: 5,
    titleKey: 'news.n5Title',
    descKey: 'news.n5Desc',
    date: 'April 28, 2026',
    category: 'event',
    location: 'KNU, Bishkek',
  },
]

// ── Category config ───────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<
  NewsCategory,
  { labelKey: string; icon: React.ReactNode; badge: string; accent: string }
> = {
  event: {
    labelKey: 'news.catEvent',
    icon: <Trophy size={13} />,
    badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    accent: 'border-blue-500/40',
  },
  release: {
    labelKey: 'news.catRelease',
    icon: <Zap size={13} />,
    badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    accent: 'border-amber-500/40',
  },
  announcement: {
    labelKey: 'news.catAnnouncement',
    icon: <Megaphone size={13} />,
    badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    accent: 'border-emerald-500/40',
  },
}

// ── Category badge ────────────────────────────────────────────────────────────

function CategoryBadge({ category }: { category: NewsCategory }) {
  const { t } = useTranslation()
  const cfg = CATEGORY_CONFIG[category]
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-semibold ${cfg.badge}`}
    >
      {cfg.icon}
      {t(cfg.labelKey)}
    </span>
  )
}

// ── Featured card ─────────────────────────────────────────────────────────────

function FeaturedCard({ item }: { item: NewsItem }) {
  const { t } = useTranslation()
  const cfg = CATEGORY_CONFIG[item.category]

  return (
    <div
      className={`relative bg-slate-800/60 backdrop-blur-sm border ${cfg.accent} rounded-2xl p-7 flex flex-col h-full group hover:bg-slate-800/80 transition-all duration-300`}
    >
      {/* Glow accent */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400/40 to-transparent rounded-t-2xl" />

      <div className="flex items-start justify-between mb-4">
        <CategoryBadge category={item.category} />
        <span className="text-slate-600 text-xs font-medium">
          {t('news.featured')}
        </span>
      </div>

      <h3 className="text-white font-bold text-xl leading-snug mb-3 group-hover:text-amber-100 transition-colors">
        {t(item.titleKey)}
      </h3>

      <p className="text-slate-400 text-sm leading-relaxed mb-6 flex-1">
        {t(item.descKey)}
      </p>

      <div className="space-y-2 mb-6">
        <div className="flex items-center gap-2 text-slate-500 text-xs">
          <Calendar size={12} />
          <span>{item.date}</span>
        </div>
        {item.location && (
          <p className="text-slate-500 text-xs pl-4">{item.location}</p>
        )}
      </div>

      <a
        href="#"
        className="inline-flex items-center gap-1.5 text-amber-400 hover:text-amber-300 text-sm font-semibold transition-colors group/link"
      >
        {t('news.readMore')}
        <ArrowUpRight
          size={15}
          className="transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"
        />
      </a>
    </div>
  )
}

// ── Compact card ──────────────────────────────────────────────────────────────

function CompactCard({ item }: { item: NewsItem }) {
  const { t } = useTranslation()

  return (
    <div className="flex gap-4 p-4 bg-slate-800/40 backdrop-blur-sm border border-slate-700/50 rounded-xl hover:border-slate-600 hover:bg-slate-800/60 transition-all duration-200 group">
      {/* Date column */}
      <div className="flex-shrink-0 w-12 text-center">
        <p className="text-amber-400 font-bold text-lg leading-none">
          {item.date.split(' ')[1].replace(',', '')}
        </p>
        <p className="text-slate-500 text-xs mt-0.5">
          {item.date.split(' ')[0].slice(0, 3)}
        </p>
      </div>

      {/* Divider */}
      <div className="w-px bg-slate-700 flex-shrink-0" />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <CategoryBadge category={item.category} />
        </div>
        <h4 className="text-white text-sm font-semibold leading-snug mb-1 group-hover:text-amber-100 transition-colors line-clamp-2">
          {t(item.titleKey)}
        </h4>
        {item.location && (
          <p className="text-slate-500 text-xs truncate">{item.location}</p>
        )}
      </div>

      <a
        href="#"
        className="flex-shrink-0 self-center text-slate-600 hover:text-amber-400 transition-colors"
        aria-label={t('news.readMore')}
      >
        <ArrowUpRight size={16} />
      </a>
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

export default function NewsSection() {
  const { t } = useTranslation()
  const featured = NEWS.find((n) => n.featured)!
  const rest = NEWS.filter((n) => !n.featured)

  return (
    <section id="news" className="bg-slate-950 px-6 py-24 scroll-mt-16 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-6xl mx-auto relative">
        {/* Header */}
        <p className="text-amber-400 text-sm font-semibold uppercase tracking-widest text-center mb-3">
          {t('news.label')}
        </p>
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-3">
          {t('news.title')}
        </h2>
        <p className="text-slate-400 text-center text-base max-w-xl mx-auto mb-14">
          {t('news.subtitle')}
        </p>

        {/* Layout: featured left + compact list right */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Featured — takes 2 of 5 columns */}
          <div className="lg:col-span-2">
            <FeaturedCard item={featured} />
          </div>

          {/* Compact stack — takes 3 of 5 columns */}
          <div className="lg:col-span-3 flex flex-col gap-3 justify-between">
            {rest.map((item) => (
              <CompactCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
