import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Download, ArrowRight, BookOpen, Library } from 'lucide-react'

// ── Mock book data ────────────────────────────────────────────────────────────

const BOOKS = [
  {
    id: 1,
    titleKey: 'libPreview.b1Title',
    author: 'Gilbert Strang',
    subjectKey: 'libPreview.subjectLinearAlgebra',
    pages: 574,
    edition: '5th ed.',
    spineGradient: 'from-blue-700 to-indigo-800',
    accentColor: 'text-blue-400',
    borderColor: 'border-blue-500/30',
    bgColor: 'bg-blue-500/5',
  },
  {
    id: 2,
    titleKey: 'libPreview.b2Title',
    author: 'George B. Thomas Jr.',
    subjectKey: 'libPreview.subjectCalculus',
    pages: 1212,
    edition: '14th ed.',
    spineGradient: 'from-amber-600 to-orange-700',
    accentColor: 'text-amber-400',
    borderColor: 'border-amber-500/30',
    bgColor: 'bg-amber-500/5',
  },
  {
    id: 3,
    titleKey: 'libPreview.b3Title',
    author: 'James Stewart',
    subjectKey: 'libPreview.subjectCalculus',
    pages: 1368,
    edition: '8th ed.',
    spineGradient: 'from-emerald-600 to-teal-700',
    accentColor: 'text-emerald-400',
    borderColor: 'border-emerald-500/30',
    bgColor: 'bg-emerald-500/5',
  },
  {
    id: 4,
    titleKey: 'libPreview.b4Title',
    author: 'David C. Lay',
    subjectKey: 'libPreview.subjectLinearAlgebra',
    pages: 492,
    edition: '5th ed.',
    spineGradient: 'from-violet-600 to-purple-800',
    accentColor: 'text-violet-400',
    borderColor: 'border-violet-500/30',
    bgColor: 'bg-violet-500/5',
  },
]

// ── Book card ─────────────────────────────────────────────────────────────────

function BookCard({ book }: { book: (typeof BOOKS)[number] }) {
  const { t } = useTranslation()

  return (
    <div
      className={`group relative bg-white border ${book.borderColor} rounded-2xl overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col`}
    >
      {/* Spine strip — acts as visual "book cover" */}
      <div className={`h-36 bg-gradient-to-br ${book.spineGradient} relative overflow-hidden flex items-end p-5`}>
        {/* Large decorative icon */}
        <BookOpen
          size={80}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/10"
          strokeWidth={1}
        />
        {/* Edition badge */}
        <span className="relative z-10 px-2 py-0.5 rounded-md bg-black/30 text-white/80 text-xs font-medium backdrop-blur-sm">
          {book.edition}
        </span>
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col flex-1">
        {/* Subject badge */}
        <span
          className={`self-start text-xs font-semibold px-2.5 py-0.5 rounded-full ${book.bgColor} ${book.accentColor} border ${book.borderColor} mb-3`}
        >
          {t(book.subjectKey)}
        </span>

        <h3 className="text-slate-800 font-bold text-sm leading-snug mb-1 group-hover:text-slate-900 transition-colors">
          {t(book.titleKey)}
        </h3>
        <p className="text-slate-500 text-xs mb-1">{book.author}</p>
        <p className="text-slate-400 text-xs mb-4">{book.pages} {t('libPreview.pages')}</p>

        {/* CTA */}
        <a
          href="/app/math-library"
          className={`mt-auto inline-flex items-center gap-2 text-xs font-semibold ${book.accentColor} hover:opacity-80 transition-opacity`}
        >
          <Download size={13} />
          {t('libPreview.downloadPdf')}
        </a>
      </div>
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

export default function LibraryPreviewSection() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <section
      id="library"
      className="bg-white px-6 py-24 scroll-mt-16 relative"
    >
      {/* Subtle top border */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-12">
          <div>
            <div className="inline-flex items-center gap-2 bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-semibold mb-3">
              <Library size={13} />
              {t('libPreview.label')}
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-2">
              {t('libPreview.title')}
            </h2>
            <p className="text-slate-500 text-base max-w-lg">
              {t('libPreview.subtitle')}
            </p>
          </div>

          <button
            onClick={() => navigate('/app/math-library')}
            className="flex-shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors shadow-md"
          >
            {t('libPreview.browseAll')}
            <ArrowRight size={15} />
          </button>
        </div>

        {/* Book grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {BOOKS.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>

        {/* Stats strip */}
        <div className="mt-10 flex flex-wrap gap-8 justify-center">
          {[
            { value: '20+', labelKey: 'libPreview.statBooks' },
            { value: 'PDF', labelKey: 'libPreview.statFormat' },
            { value: '100%', labelKey: 'libPreview.statFree' },
          ].map((s) => (
            <div key={s.labelKey} className="text-center">
              <p className="text-2xl font-extrabold text-slate-800">{s.value}</p>
              <p className="text-slate-400 text-xs mt-0.5 uppercase tracking-wide">
                {t(s.labelKey)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
