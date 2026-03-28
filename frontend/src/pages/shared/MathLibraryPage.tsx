import { useTranslation } from 'react-i18next'
import { BookOpen, Download } from 'lucide-react'

// ── Static book catalogue ─────────────────────────────────────────────────────
// These are real, widely-used university textbooks.
// pdfUrl is null until a legitimate open-access link is supplied.

interface Book {
  id: number
  title: string
  author: string
  edition: string
  year: number
  topics: string[]
  formula: string       // decorative display formula on the cover
  gradient: string      // Tailwind gradient classes for the cover
  pdfUrl: string | null
}

const BOOKS: Book[] = [
  {
    id: 1,
    title: "Thomas' Calculus",
    author: 'George B. Thomas Jr.',
    edition: '14th Edition',
    year: 2018,
    topics: ['Limits', 'Derivatives', 'Integrals', 'Series'],
    formula: '∫ f(x) dx',
    gradient: 'from-blue-600 to-blue-900',
    pdfUrl: null,
  },
  {
    id: 2,
    title: 'Linear Algebra and Its Applications',
    author: 'Gilbert Strang',
    edition: '5th Edition',
    year: 2016,
    topics: ['Matrices', 'Eigenvalues', 'Vector Spaces', 'Transformations'],
    formula: 'Ax = λx',
    gradient: 'from-emerald-600 to-teal-900',
    pdfUrl: null,
  },
  {
    id: 3,
    title: 'Principles of Mathematical Analysis',
    author: 'Walter Rudin',
    edition: '3rd Edition',
    year: 1976,
    topics: ['Real Numbers', 'Sequences', 'Continuity', 'Differentiation'],
    formula: 'lim aₙ = L',
    gradient: 'from-violet-600 to-purple-900',
    pdfUrl: null,
  },
  {
    id: 4,
    title: 'Ordinary Differential Equations',
    author: 'Morris Tenenbaum & Harry Pollard',
    edition: 'Dover Edition',
    year: 1985,
    topics: ['First Order', 'Linear ODE', 'Systems', 'Laplace Transform'],
    formula: "y'' + py' + qy = 0",
    gradient: 'from-rose-600 to-red-900',
    pdfUrl: null,
  },
  {
    id: 5,
    title: 'Abstract Algebra',
    author: 'David S. Dummit & Richard M. Foote',
    edition: '3rd Edition',
    year: 2003,
    topics: ['Groups', 'Rings', 'Fields', 'Galois Theory'],
    formula: 'G / H ≅ G′',
    gradient: 'from-orange-500 to-amber-800',
    pdfUrl: null,
  },
]

// ── Book card ─────────────────────────────────────────────────────────────────

function BookCard({ book }: { book: Book }) {
  const { t } = useTranslation()

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg transition-shadow overflow-hidden group">

      {/* Cover */}
      <div className={`relative bg-gradient-to-br ${book.gradient} h-48 flex flex-col items-center justify-center px-6 select-none`}>
        {/* Decorative grid lines */}
        <div className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: 'linear-gradient(0deg, transparent 24%, rgba(255,255,255,.5) 25%, rgba(255,255,255,.5) 26%, transparent 27%, transparent 74%, rgba(255,255,255,.5) 75%, rgba(255,255,255,.5) 76%, transparent 77%), linear-gradient(90deg, transparent 24%, rgba(255,255,255,.5) 25%, rgba(255,255,255,.5) 26%, transparent 27%, transparent 74%, rgba(255,255,255,.5) 75%, rgba(255,255,255,.5) 76%, transparent 77%)',
            backgroundSize: '30px 30px',
          }}
        />

        {/* Formula display */}
        <p className="relative text-white/90 font-mono text-2xl font-bold tracking-tight text-center drop-shadow-md">
          {book.formula}
        </p>

        {/* Book icon badge */}
        <div className="absolute top-3 right-3 bg-white/20 backdrop-blur-sm rounded-lg p-1.5">
          <BookOpen size={14} className="text-white/80" />
        </div>
      </div>

      {/* Info */}
      <div className="p-5">
        <h3 className="font-bold text-slate-800 text-base leading-snug mb-1 group-hover:text-amber-700 transition-colors line-clamp-2">
          {book.title}
        </h3>
        <p className="text-slate-500 text-sm mb-0.5">{book.author}</p>
        <p className="text-slate-400 text-xs mb-3">{book.edition} · {book.year}</p>

        {/* Topic pills */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {book.topics.map((topic) => (
            <span
              key={topic}
              className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs font-medium"
            >
              {topic}
            </span>
          ))}
        </div>

        {/* Action button */}
        {book.pdfUrl ? (
          <a
            href={book.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Download size={14} />
            {t('mathLibrary.download')}
          </a>
        ) : (
          <div className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 text-slate-400 text-sm font-medium rounded-xl cursor-not-allowed">
            <Download size={14} />
            {t('mathLibrary.comingSoon')}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MathLibraryPage() {
  const { t } = useTranslation()

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">{t('mathLibrary.title')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('mathLibrary.subtitle')}</p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {BOOKS.map((book) => (
          <BookCard key={book.id} book={book} />
        ))}
      </div>
    </div>
  )
}
