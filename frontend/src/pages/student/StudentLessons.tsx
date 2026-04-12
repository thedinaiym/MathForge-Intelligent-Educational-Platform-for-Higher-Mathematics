/**
 * StudentLessons — Phase 22
 *
 * Shows a gallery of all video lessons assigned to classrooms
 * the student is enrolled in.  Clicking a card opens a custom
 * HTML5 video player with full controls.
 *
 * No external player library — pure HTML5 <video> + Tailwind overlay.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  BookOpen,
  Clock,
  ArrowLeft,
  Loader2,
  Video,
  GraduationCap,
} from 'lucide-react'
import api from '../../lib/axios'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Lesson {
  id: string
  classroom_id: string
  classroom_name: string
  title: string
  description: string | null
  video_url: string
  duration_sec: number | null
  created_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

async function fetchStudentLessons(): Promise<Lesson[]> {
  const { data } = await api.get<Lesson[]>('/lessons/student')
  return data
}

// ── Custom Video Player ───────────────────────────────────────────────────────

function VideoPlayer({ lesson, onClose }: { lesson: Lesson; onClose: () => void }) {
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [buffering, setBuffering] = useState(false)

  // ── Playback helpers ────────────────────────────────────────────────────────

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play(); setPlaying(true) }
    else { v.pause(); setPlaying(false) }
  }, [])

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime)
  }, [])

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) setDuration(videoRef.current.duration)
  }, [])

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current
    if (!v) return
    const t = Number(e.target.value)
    v.currentTime = t
    setCurrentTime(t)
  }, [])

  const handleVolume = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current
    if (!v) return
    const vol = Number(e.target.value)
    v.volume = vol
    setVolume(vol)
    setMuted(vol === 0)
  }, [])

  const toggleMute = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = !muted
    setMuted(!muted)
  }, [muted])

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      await el.requestFullscreen?.()
    } else {
      await document.exitFullscreen?.()
    }
  }, [])

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // Auto-hide controls after 3 s of no mouse movement during playback
  const revealControls = useCallback(() => {
    setShowControls(true)
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current)
    hideControlsTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowControls(false)
    }, 3000)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); togglePlay() }
      if (e.code === 'ArrowRight' && videoRef.current) videoRef.current.currentTime += 5
      if (e.code === 'ArrowLeft' && videoRef.current) videoRef.current.currentTime -= 5
      if (e.code === 'KeyM') toggleMute()
      if (e.code === 'KeyF') toggleFullscreen()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, toggleMute, toggleFullscreen])

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-black/70 backdrop-blur-sm flex-shrink-0">
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm truncate">{lesson.title}</p>
          <p className="text-white/50 text-xs truncate">{lesson.classroom_name}</p>
        </div>
      </div>

      {/* Video container */}
      <div
        ref={containerRef}
        className="flex-1 relative flex items-center justify-center bg-black select-none"
        onMouseMove={revealControls}
        onClick={togglePlay}
        style={{ cursor: showControls ? 'default' : 'none' }}
      >
        <video
          ref={videoRef}
          src={lesson.video_url}
          className="max-h-full max-w-full"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onWaiting={() => setBuffering(true)}
          onCanPlay={() => setBuffering(false)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setShowControls(true) }}
          playsInline
        />

        {/* Buffering spinner */}
        {buffering && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Loader2 size={40} className="animate-spin text-white/70" />
          </div>
        )}

        {/* Centre play/pause flash */}
        {!buffering && !playing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-16 h-16 rounded-full bg-black/40 flex items-center justify-center">
              <Play size={28} className="text-white ml-1" />
            </div>
          </div>
        )}

        {/* Controls overlay */}
        <div
          className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent
            px-4 pb-4 pt-10 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Progress bar */}
          <div className="relative mb-3 group">
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.25}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1 appearance-none bg-white/30 rounded-full cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3
                [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-amber-400 [&::-webkit-slider-thumb]:cursor-pointer"
              style={{
                background: `linear-gradient(to right, #f59e0b ${progress}%, rgba(255,255,255,0.3) ${progress}%)`,
              }}
            />
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-3">
            {/* Play / Pause */}
            <button onClick={togglePlay} className="text-white hover:text-amber-400 transition-colors">
              {playing ? <Pause size={20} /> : <Play size={20} />}
            </button>

            {/* Volume */}
            <button onClick={toggleMute} className="text-white/70 hover:text-white transition-colors">
              {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={handleVolume}
              className="w-20 h-1 appearance-none bg-white/30 rounded-full cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5
                [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
            />

            {/* Time */}
            <span className="text-white/70 text-xs tabular-nums flex-1">
              {fmtDuration(currentTime)} / {duration ? fmtDuration(duration) : '--:--'}
            </span>

            {/* Fullscreen */}
            <button onClick={toggleFullscreen} className="text-white/70 hover:text-white transition-colors">
              {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </div>
        </div>
      </div>

      {/* Description bar */}
      {lesson.description && (
        <div className="px-4 py-3 bg-black/70 flex-shrink-0">
          <p className="text-white/60 text-xs">{lesson.description}</p>
        </div>
      )}
    </div>
  )
}

// ── Lesson gallery card ───────────────────────────────────────────────────────

function LessonCard({ lesson, onClick }: { lesson: Lesson; onClick: () => void }) {
  const date = new Date(lesson.created_at).toLocaleDateString()

  return (
    <button
      onClick={onClick}
      className="group bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden
        text-left hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 w-full"
    >
      {/* Thumbnail */}
      <div className="relative h-36 bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center overflow-hidden">
        <video
          src={lesson.video_url}
          className="absolute inset-0 w-full h-full object-cover opacity-40"
          preload="metadata"
          muted
        />
        <div className="relative w-12 h-12 rounded-full bg-white/20 flex items-center justify-center
          group-hover:bg-amber-500/80 transition-colors">
          <Play size={22} className="text-white ml-0.5" />
        </div>
        {lesson.duration_sec && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-0.5
            bg-black/60 rounded text-white text-xs font-mono">
            {fmtDuration(lesson.duration_sec)}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <p className="font-semibold text-slate-800 text-sm line-clamp-2 leading-snug mb-2">
          {lesson.title}
        </p>
        <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
          <span className="flex items-center gap-1">
            <GraduationCap size={11} /> {lesson.classroom_name}
          </span>
          <span className="text-slate-200">·</span>
          <span>{date}</span>
        </div>
        {lesson.description && (
          <p className="text-xs text-slate-400 mt-2 line-clamp-2">{lesson.description}</p>
        )}
      </div>
    </button>
  )
}

// ── Classroom filter tabs ─────────────────────────────────────────────────────

function ClassroomTabs({
  classrooms,
  active,
  onSelect,
}: {
  classrooms: string[]
  active: string
  onSelect: (c: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex gap-1 flex-wrap">
      <button
        onClick={() => onSelect('')}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          active === '' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
        }`}
      >
        {t('lessons.allClasses')}
      </button>
      {classrooms.map((c) => (
        <button
          key={c}
          onClick={() => onSelect(c)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            active === c ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {c}
        </button>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StudentLessons() {
  const { t } = useTranslation()
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null)
  const [activeClassroom, setActiveClassroom] = useState('')

  const { data: lessons = [], isLoading, isError } = useQuery({
    queryKey: ['lessons', 'student'],
    queryFn: fetchStudentLessons,
  })

  // Unique classroom names for filter tabs
  const classroomNames = Array.from(new Set(lessons.map((l) => l.classroom_name)))

  const filtered = activeClassroom
    ? lessons.filter((l) => l.classroom_name === activeClassroom)
    : lessons

  if (activeLesson) {
    return <VideoPlayer lesson={activeLesson} onClose={() => setActiveLesson(null)} />
  }

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">{t('lessons.studentTitle')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('lessons.studentSubtitle')}</p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 size={28} className="animate-spin text-amber-400" />
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          {t('common.error')}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && lessons.length === 0 && (
        <div className="flex flex-col items-center py-20 gap-4 text-center">
          <Video size={40} className="text-slate-200" />
          <p className="text-sm font-semibold text-slate-500">{t('lessons.emptyStudent')}</p>
          <p className="text-xs text-slate-400">{t('lessons.emptyStudentHint')}</p>
        </div>
      )}

      {/* Content */}
      {!isLoading && !isError && lessons.length > 0 && (
        <>
          {/* Classroom filter */}
          {classroomNames.length > 1 && (
            <div className="mb-5">
              <ClassroomTabs
                classrooms={classroomNames}
                active={activeClassroom}
                onSelect={setActiveClassroom}
              />
            </div>
          )}

          {/* Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((lesson) => (
              <LessonCard
                key={lesson.id}
                lesson={lesson}
                onClick={() => setActiveLesson(lesson)}
              />
            ))}
          </div>

          {filtered.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-10">
              {t('lessons.noLessonsInClass')}
            </p>
          )}
        </>
      )}
    </div>
  )
}
