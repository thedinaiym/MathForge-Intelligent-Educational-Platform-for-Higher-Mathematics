import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Star, Clock, BookOpen, CheckCircle } from 'lucide-react'

// ── Mock data ─────────────────────────────────────────────────────────────────

const TUTORS = [
  {
    id: 1,
    name: 'Айгерим Бекова',
    nameEn: 'Aigerim Bekova',
    specialty: 'tutors.specialtyLinearAlgebra',
    experience: 5,
    rating: 4.9,
    price: 800,
    sessions: 142,
    initials: 'АБ',
    color: 'from-violet-500 to-purple-600',
    tags: ['tutors.tagMatrices', 'tutors.tagEigenvalues'],
  },
  {
    id: 2,
    name: 'Нурлан Асанов',
    nameEn: 'Nurlan Asanov',
    specialty: 'tutors.specialtyCalculus',
    experience: 8,
    rating: 4.8,
    price: 1000,
    sessions: 310,
    initials: 'НА',
    color: 'from-blue-500 to-cyan-600',
    tags: ['tutors.tagIntegrals', 'tutors.tagLimits'],
  },
  {
    id: 3,
    name: 'Малика Джумабаева',
    nameEn: 'Malika Djumabaeva',
    specialty: 'tutors.specialtyStatistics',
    experience: 3,
    rating: 4.7,
    price: 600,
    sessions: 87,
    initials: 'МД',
    color: 'from-emerald-500 to-teal-600',
    tags: ['tutors.tagProbability', 'tutors.tagDistributions'],
  },
  {
    id: 4,
    name: 'Тимур Осмонов',
    nameEn: 'Timur Osmonov',
    specialty: 'tutors.specialtyDiffEq',
    experience: 6,
    rating: 4.9,
    price: 900,
    sessions: 198,
    initials: 'ТО',
    color: 'from-amber-500 to-orange-600',
    tags: ['tutors.tagODE', 'tutors.tagPDE'],
  },
  {
    id: 5,
    name: 'Зарина Токтосунова',
    nameEn: 'Zarina Toktosunova',
    specialty: 'tutors.specialtyDiscrete',
    experience: 4,
    rating: 4.6,
    price: 700,
    sessions: 115,
    initials: 'ЗТ',
    color: 'from-pink-500 to-rose-600',
    tags: ['tutors.tagGraphs', 'tutors.tagCombinatorics'],
  },
  {
    id: 6,
    name: 'Данияр Эсенбеков',
    nameEn: 'Daniyar Esenbekov',
    specialty: 'tutors.specialtyAlgebraCalculus',
    experience: 10,
    rating: 5.0,
    price: 1200,
    sessions: 420,
    initials: 'ДЭ',
    color: 'from-slate-500 to-slate-700',
    tags: ['tutors.tagMatrices', 'tutors.tagIntegrals'],
  },
]

// ── Mini toast ────────────────────────────────────────────────────────────────

function Toast({ name, onClose }: { name: string; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-2xl shadow-emerald-900/50 animate-in slide-in-from-bottom-4 duration-300">
      <CheckCircle size={18} />
      <span className="text-sm font-medium">
        {t('tutors.bookingConfirm', { name })}
      </span>
      <button onClick={onClose} className="ml-2 text-white/70 hover:text-white text-lg leading-none">
        ×
      </button>
    </div>
  )
}

// ── Tutor card ────────────────────────────────────────────────────────────────

function TutorCard({
  tutor,
  onBook,
}: {
  tutor: (typeof TUTORS)[number]
  onBook: (name: string) => void
}) {
  const { t, i18n } = useTranslation()
  const displayName = i18n.language === 'en' ? tutor.nameEn : tutor.name

  return (
    <div className="group relative bg-slate-900/60 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 hover:border-slate-600 hover:bg-slate-800/70 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/40 flex flex-col">
      {/* Avatar + rating */}
      <div className="flex items-start justify-between mb-4">
        <div
          className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${tutor.color} flex items-center justify-center text-white text-lg font-bold shadow-lg`}
        >
          {tutor.initials}
        </div>
        <div className="flex items-center gap-1 bg-amber-500/15 border border-amber-500/25 px-2.5 py-1 rounded-full">
          <Star size={12} className="text-amber-400 fill-amber-400" />
          <span className="text-amber-300 text-xs font-semibold">{tutor.rating}</span>
        </div>
      </div>

      {/* Name & specialty */}
      <h3 className="text-white font-bold text-base mb-0.5">{displayName}</h3>
      <p className="text-amber-400/80 text-xs font-medium mb-3">{t(tutor.specialty)}</p>

      {/* Meta row */}
      <div className="flex items-center gap-4 text-slate-400 text-xs mb-4">
        <span className="flex items-center gap-1.5">
          <Clock size={12} />
          {t('tutors.yearsExp', { count: tutor.experience })}
        </span>
        <span className="flex items-center gap-1.5">
          <BookOpen size={12} />
          {t('tutors.sessions', { count: tutor.sessions })}
        </span>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {tutor.tags.map((tag) => (
          <span
            key={tag}
            className="px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400 text-xs"
          >
            {t(tag)}
          </span>
        ))}
      </div>

      {/* Price + CTA */}
      <div className="mt-auto flex items-center justify-between">
        <div>
          <span className="text-white font-bold text-lg">{tutor.price.toLocaleString()}</span>
          <span className="text-slate-400 text-xs ml-1">{t('tutors.kgsHour')}</span>
        </div>
        <button
          onClick={() => onBook(displayName)}
          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-white text-sm font-semibold transition-all shadow-md shadow-amber-500/25"
        >
          {t('tutors.bookBtn')}
        </button>
      </div>
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

export default function TutorsSection() {
  const { t } = useTranslation()
  const [toast, setToast] = useState<string | null>(null)

  const handleBook = (name: string) => {
    setToast(name)
    setTimeout(() => setToast(null), 4000)
  }

  return (
    <section id="tutors" className="bg-slate-950 px-6 py-24 scroll-mt-16 relative overflow-hidden">
      {/* Subtle ambient glow */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-6xl mx-auto relative">
        {/* Header */}
        <p className="text-amber-400 text-sm font-semibold uppercase tracking-widest text-center mb-3">
          {t('tutors.label')}
        </p>
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-3">
          {t('tutors.title')}
        </h2>
        <p className="text-slate-400 text-center text-base max-w-xl mx-auto mb-14">
          {t('tutors.subtitle')}
        </p>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {TUTORS.map((tutor) => (
            <TutorCard key={tutor.id} tutor={tutor} onBook={handleBook} />
          ))}
        </div>

        {/* Disclaimer */}
        <p className="text-center text-slate-600 text-xs mt-10">
          {t('tutors.disclaimer')}
        </p>
      </div>

      {toast && <Toast name={toast} onClose={() => setToast(null)} />}
    </section>
  )
}
