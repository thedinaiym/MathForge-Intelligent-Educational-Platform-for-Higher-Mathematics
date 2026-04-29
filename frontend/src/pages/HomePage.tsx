import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Brain,
  Globe,
  Coins,
  FileText,
  GraduationCap,
  BookOpen,
  Sparkles,
  ChevronDown,
  ArrowRight,
  Volume2,
} from 'lucide-react'
import Button from '../components/ui/Button'
import Footer from '../components/layout/Footer'
import TutorsSection from '../components/sections/TutorsSection'
import VideoLessonsSection from '../components/sections/VideoLessonsSection'
import NewsSection from '../components/sections/NewsSection'
import LibraryPreviewSection from '../components/sections/LibraryPreviewSection'
import { useAuthStore } from '../store/authStore'
import i18n from '../i18n'
import AvatarTutor from '../components/avatar/AvatarTutor'
import GuestChat from '../components/avatar/GuestChat'
import { useTTSSpeech, type TTSLanguage } from '../components/avatar/useTTSSpeech'

// ── Smooth-scroll helper ───────────────────────────────────────────────────────

const scrollTo = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

const LOCALES = ['ru', 'en', 'kg'] as const

// ── Navbar ────────────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { labelKey: 'nav.tutors',  anchor: 'tutors'  },
  { labelKey: 'nav.videos',  anchor: 'videos'  },
  { labelKey: 'nav.news',    anchor: 'news'    },
  { labelKey: 'nav.library', anchor: 'library' },
] as const

function Navbar() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  return (
    <nav className="flex items-center justify-between px-6 md:px-10 py-4 border-b border-white/10 bg-black/30 backdrop-blur-md sticky top-0 z-30">
      {/* Logo */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
          <Brain size={16} className="text-amber-400" />
        </div>
        <span className="text-xl font-bold text-white tracking-tight">MathForge</span>
      </div>

      {/* Scroll nav links — hidden on small screens */}
      <div className="hidden lg:flex items-center gap-1">
        {NAV_LINKS.map((link) => (
          <button
            key={link.anchor}
            onClick={() => scrollTo(link.anchor)}
            className="px-3 py-1.5 text-sm text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-all font-medium"
          >
            {t(link.labelKey)}
          </button>
        ))}
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-3">
        {/* Language switcher */}
        <div className="flex gap-1">
          {LOCALES.map((loc) => (
            <button
              key={loc}
              onClick={() => i18n.changeLanguage(loc)}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                (i18n.resolvedLanguage ?? i18n.language) === loc
                  ? 'bg-amber-500 text-white'
                  : 'bg-white/10 text-white/60 hover:bg-white/20'
              }`}
            >
              {loc.toUpperCase()}
            </button>
          ))}
        </div>

        {user ? (
          <Button onClick={() => navigate('/app/dashboard')} size="sm" variant="secondary">
            {user.name?.split(' ')[0] ?? t('nav.profile')}
          </Button>
        ) : (
          <Button onClick={() => navigate('/auth')} size="sm">
            {t('home.getStarted')}
          </Button>
        )}
      </div>
    </nav>
  )
}

// ── Hero section ──────────────────────────────────────────────────────────────

const LANG_MAP: Record<string, TTSLanguage> = { en: 'en', ru: 'ru', kg: 'kg', ky: 'kg' }

const AIDA_GREETINGS: Record<string, string> = {
  en: "Hi! I'm Aida, your AI math tutor. Ask me anything!",
  ru: "Привет! Я Айда, ваш AI-репетитор по математике. Задайте любой вопрос!",
  kg: "Саламатсызбы! Мен Айда, AI математика мугалимиңизмин. Суроо бериңиз!",
}

function Hero() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const lang: TTSLanguage = LANG_MAP[i18n.resolvedLanguage ?? i18n.language ?? 'ru'] ?? 'ru'
  const { audioUrl, wordBoundaries, speakTimed, clear } = useTTSSpeech()

  const [showSoundHint, setShowSoundHint] = useState(true)

  // Reset hint whenever language changes so visitor can hear greeting in new language
  useEffect(() => { setShowSoundHint(true) }, [lang])

  const playGreeting = () => {
    const text = AIDA_GREETINGS[lang] ?? AIDA_GREETINGS.ru
    speakTimed(text, lang, 'female')
    setShowSoundHint(false)
  }

  const handleAidaReply = (text: string) => {
    setShowSoundHint(false)
    speakTimed(text, lang, 'female')
  }

  const scrollToFeatures = () =>
    document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' })

  return (
    <section className="relative min-h-screen flex flex-col overflow-hidden">
      {/* ── Video background ── */}
      <video
        autoPlay loop muted playsInline
        className="absolute inset-0 w-full h-full object-cover"
      >
        <source src="/assets/manim_bg.mp4" type="video/mp4" />
      </video>

      {/* ── Overlays ── */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/60 to-slate-950" />
      {/* Ambient glow orbs */}
      <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-amber-500/8 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-violet-500/6 rounded-full blur-3xl pointer-events-none" />

      {/* ── Sticky navbar ── */}
      <Navbar />

      {/* ── Main hero body ── */}
      <div className="relative z-10 flex-1 flex flex-col lg:flex-row items-center justify-center gap-6 lg:gap-10 px-5 pt-8 pb-12 lg:px-10 max-w-7xl mx-auto w-full">

        {/* ── Avatar column ── */}
        <div className="flex flex-col items-center w-full lg:w-[52%] flex-shrink-0">

          {/* Micro eyebrow — kept minimal */}
          <p className="text-amber-400/80 text-xs font-semibold uppercase tracking-[0.2em] mb-4">
            {lang === 'ru' ? 'Познакомьтесь с Айдой' :
             lang === 'kg' ? 'Айда менен таанышыңыз' :
             'Meet Aida'}
          </p>

          {/* Avatar — the hero */}
          <div className="relative w-full rounded-3xl overflow-hidden shadow-2xl shadow-black/60"
               style={{ maxWidth: 480 }}>
            <AvatarTutor
              audioUrl={audioUrl}
              wordBoundaries={wordBoundaries}
              height={440}
              onSpeechEnd={clear}
            />

            {/* Voice hint — shown until user activates TTS (browser requires user gesture) */}
            {showSoundHint && !audioUrl && (
              <button
                onClick={playGreeting}
                className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2
                           px-4 py-2 rounded-full bg-black/70 backdrop-blur-md
                           border border-white/20 hover:border-amber-400/60
                           text-white/75 hover:text-white text-xs font-medium
                           transition-all shadow-lg z-10 whitespace-nowrap"
              >
                <Volume2 size={13} className="text-amber-400" />
                {lang === 'ru' ? 'Нажмите, чтобы услышать Айду' :
                 lang === 'kg' ? 'Айданын үнүн угуу' :
                 'Tap to hear Aida'}
              </button>
            )}
          </div>

          {/* Logged-in user CTAs below avatar */}
          {user && (
            <div className="flex flex-wrap gap-2 mt-5 justify-center">
              {user.role === 'student' && (
                <Button size="sm" onClick={() => navigate('/app/student')}>
                  <GraduationCap size={15} /> {t('nav.student')}
                </Button>
              )}
              {(user.role === 'teacher' || user.role === 'admin') && (
                <Button size="sm" onClick={() => navigate('/app/teacher')}>
                  <BookOpen size={15} /> {t('nav.teacher')}
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => navigate('/app/dashboard')}>
                {t('nav.dashboard')} <ArrowRight size={14} />
              </Button>
            </div>
          )}
        </div>

        {/* ── Chat column ── */}
        <div className="w-full lg:w-[48%] flex flex-col" style={{ maxWidth: 440 }}>

          {/* Glass chat card */}
          <div
            className="rounded-3xl border border-white/10 shadow-2xl shadow-black/40 overflow-hidden"
            style={{
              background:     'rgba(255,255,255,0.06)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              height: 440,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Card header */}
            <div className="px-5 pt-5 pb-3 border-b border-white/8 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-xs font-bold text-white shadow-lg shadow-amber-500/30">
                  A
                </div>
                <div>
                  <p className="text-white font-semibold text-sm leading-none">Aida</p>
                  <p className="text-white/40 text-[11px] mt-0.5">
                    {lang === 'ru' ? 'AI-репетитор по математике' :
                     lang === 'kg' ? 'AI математика мугалими' :
                     'AI Math Tutor'}
                  </p>
                </div>
                {/* Live indicator */}
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-emerald-400/70 text-[10px] font-medium">Live</span>
                </div>
              </div>
            </div>

            {/* GuestChat fills remaining space */}
            <div className="flex-1 min-h-0 flex flex-col">
              <GuestChat
                lang={lang}
                onAidaReply={handleAidaReply}
              />
            </div>
          </div>

          {/* Below-card note */}
          {!user && (
            <div className="mt-3 flex items-center justify-between px-1">
              <p className="text-white/30 text-xs">
                {lang === 'ru' ? '3 бесплатных вопроса · Без регистрации' :
                 lang === 'kg' ? '3 акысыз суроо · Каттоосуз' :
                 '3 free questions · No sign-up needed'}
              </p>
              <button
                onClick={() => navigate('/auth')}
                className="text-amber-400/70 hover:text-amber-300 text-xs font-medium transition-colors flex items-center gap-1"
              >
                {t('home.getStarted')} <ArrowRight size={11} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Scroll cue ── */}
      <div className="relative z-10 flex justify-center pb-6">
        <button
          onClick={scrollToFeatures}
          className="text-white/25 hover:text-white/60 transition-colors animate-bounce"
        >
          <ChevronDown size={26} />
        </button>
      </div>
    </section>
  )
}

// ── Features section ──────────────────────────────────────────────────────────

function Features() {
  const { t } = useTranslation()

  const items = [
    { icon: <Brain className="text-amber-500" size={26} />, title: t('home.features.neuroSymbolic'), desc: t('home.features.neuroSymbolicDesc'), bg: 'bg-amber-50' },
    { icon: <Globe className="text-blue-500" size={26} />,  title: t('home.features.multilingual'), desc: t('home.features.multilingualDesc'),  bg: 'bg-blue-50' },
    { icon: <Coins className="text-emerald-500" size={26} />, title: t('home.features.tokenBilling'), desc: t('home.features.tokenBillingDesc'), bg: 'bg-emerald-50' },
    { icon: <FileText className="text-purple-500" size={26} />, title: t('home.features.pdfGeneration'), desc: t('home.features.pdfGenerationDesc'), bg: 'bg-purple-50' },
  ]

  return (
    <section className="bg-slate-950 px-6 py-24">
      <div className="max-w-5xl mx-auto">
        <p className="text-amber-400 text-sm font-semibold uppercase tracking-widest text-center mb-3">
          {t('home.featuresLabel')}
        </p>
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-14">
          {t('home.featuresTitle')}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {items.map((f) => (
            <div
              key={f.title}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-6 transition-colors group"
            >
              <div className={`w-12 h-12 rounded-xl ${f.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                {f.icon}
              </div>
              <h3 className="font-semibold text-white mb-2">{f.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── About section ─────────────────────────────────────────────────────────────

function About() {
  const { t } = useTranslation()

  return (
    <section id="about" className="bg-white px-6 py-24 scroll-mt-16">
      <div className="max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-700 px-4 py-1.5 rounded-full text-sm font-semibold mb-6">
          <Sparkles size={14} />
          {t('auth.aboutTitle')}
        </div>

        <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-6 leading-snug">
          {t('home.aboutHeading')}
        </h2>

        <div className="grid md:grid-cols-2 gap-8 mb-10">
          <p className="text-slate-600 leading-relaxed">{t('auth.aboutText1')}</p>
          <p className="text-slate-500 leading-relaxed">{t('auth.aboutText2')}</p>
        </div>

        {/* Tech stack pills */}
        <div className="flex flex-wrap gap-2">
          {['SymPy Engine', 'Groq Llama-3', 'LaTeX PDF', 'Google Vision OCR', 'EN / RU / KG', 'Neuro-Symbolic AI'].map((tag) => (
            <span
              key={tag}
              className="px-4 py-1.5 rounded-full bg-slate-100 text-slate-600 text-sm font-medium border border-slate-200"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Creator section ───────────────────────────────────────────────────────────

function Creator() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <section className="bg-gradient-to-br from-amber-50 via-white to-orange-50 px-6 py-24">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-3xl border border-amber-100 shadow-xl shadow-amber-100/50 p-8 md:p-12">
          <div className="flex flex-col md:flex-row items-start gap-8">

            {/* Avatar */}
            <div className="flex-shrink-0">
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-4xl font-extrabold text-white shadow-lg shadow-amber-300/40">
                D
              </div>
            </div>

            {/* Content */}
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-500 mb-2">
                {t('home.creatorLabel')}
              </p>
              <h2 className="text-2xl md:text-3xl font-bold text-slate-800 mb-1">
                {t('auth.creatorName')}
              </h2>
              <p className="text-amber-600 font-medium text-sm mb-5">
                {t('auth.creatorRole')}
              </p>
              <p className="text-slate-600 leading-relaxed mb-6 max-w-xl">
                {t('auth.creatorBio')}
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-slate-400 text-sm">{t('auth.creatorLocation')}</span>
                <button
                  onClick={() => navigate('/auth')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-xl transition-colors shadow-md shadow-amber-200"
                >
                  {t('home.getStarted')}
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <div className="bg-slate-950">
      <Hero />
      <Features />
      <About />
      <TutorsSection />
      <VideoLessonsSection />
      <NewsSection />
      <LibraryPreviewSection />
      <Creator />
      <Footer />
    </div>
  )
}
