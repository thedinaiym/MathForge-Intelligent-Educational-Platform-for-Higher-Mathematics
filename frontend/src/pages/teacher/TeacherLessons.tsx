/**
 * TeacherLessons — Phase 22
 *
 * Upload flow:
 *   1. Teacher selects a classroom and fills in title + optional description.
 *   2. Drag-and-drop (or click) to select a video file (mp4/webm/mov/mkv ≤ 500 MB).
 *   3. File is uploaded directly to Supabase Storage bucket `video_lessons`.
 *   4. On upload success, POST /api/lessons with the returned public URL.
 *   5. Lesson list refreshes — grouped by classroom.
 *
 * Delete flow:
 *   1. Teacher clicks delete on a lesson card.
 *   2. DELETE /api/lessons/{id} removes the DB record.
 *   3. supabase.storage.from('video_lessons').remove([storagePath]) removes the file.
 */
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDropzone } from 'react-dropzone'
import {
  Upload,
  Video,
  Trash2,
  AlertCircle,
  CheckCircle,
  Loader2,
  PlayCircle,
  Clock,
  BookOpen,
} from 'lucide-react'
import api from '../../lib/axios'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClassroomOption {
  id: string
  name: string
}

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

const BUCKET = 'video_lessons'
const MAX_MB = 500
const ACCEPT_MIME: Record<string, string[]> = {
  'video/mp4': ['.mp4'],
  'video/webm': ['.webm'],
  'video/quicktime': ['.mov'],
  'video/x-matroska': ['.mkv'],
  'video/avi': ['.avi'],
}

function fmtDuration(sec: number | null | undefined): string {
  if (!sec) return ''
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function fmtFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ── Upload progress hook ──────────────────────────────────────────────────────

interface UploadState {
  progress: number   // 0–100
  phase: 'idle' | 'uploading' | 'saving' | 'done' | 'error'
  errorMsg: string
}

// ── Classroom selector ────────────────────────────────────────────────────────

async function fetchMyClassrooms(): Promise<ClassroomOption[]> {
  const { data } = await api.get<{ id: string; name: string }[]>('/classes/me')
  return data.map((c) => ({ id: c.id, name: c.name }))
}

async function fetchTeacherLessons(): Promise<Lesson[]> {
  const { data } = await api.get<Lesson[]>('/lessons/teacher')
  return data
}

// ── Lesson card ───────────────────────────────────────────────────────────────

function LessonCard({
  lesson,
  onDelete,
}: {
  lesson: Lesson
  onDelete: (id: string, videoUrl: string) => void
}) {
  const { t } = useTranslation()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const date = new Date(lesson.created_at).toLocaleDateString()

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex gap-0">
      {/* Thumbnail strip */}
      <div className="w-24 flex-shrink-0 bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
        <PlayCircle size={28} className="text-white/60" />
      </div>

      {/* Info */}
      <div className="flex-1 px-4 py-3 min-w-0">
        <p className="font-semibold text-slate-800 text-sm truncate">{lesson.title}</p>
        <div className="flex items-center gap-3 mt-1">
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <BookOpen size={11} /> {lesson.classroom_name}
          </span>
          {lesson.duration_sec && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Clock size={11} /> {fmtDuration(lesson.duration_sec)}
            </span>
          )}
          <span className="text-xs text-slate-300">{date}</span>
        </div>
        {lesson.description && (
          <p className="text-xs text-slate-400 mt-1 line-clamp-1">{lesson.description}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center pr-3 gap-2 flex-shrink-0">
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={15} />
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onDelete(lesson.id, lesson.video_url)}
              className="text-xs px-2 py-1 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
            >
              {t('lessons.delete')}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
            >
              {t('common.cancel')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Upload form ───────────────────────────────────────────────────────────────

function UploadForm({ classrooms }: { classrooms: ClassroomOption[] }) {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  const [classroomId, setClassroomId] = useState(classrooms[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>({
    progress: 0,
    phase: 'idle',
    errorMsg: '',
  })
  const videoRef = useRef<HTMLVideoElement>(null)
  const [durationSec, setDurationSec] = useState<number | null>(null)

  const onDrop = useCallback((accepted: File[]) => {
    const f = accepted[0]
    if (!f) return
    setFile(f)
    setUploadState({ progress: 0, phase: 'idle', errorMsg: '' })
    // Read duration from a hidden video element
    const url = URL.createObjectURL(f)
    const v = document.createElement('video')
    v.src = url
    v.onloadedmetadata = () => {
      setDurationSec(Math.round(v.duration))
      URL.revokeObjectURL(url)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT_MIME,
    maxFiles: 1,
    maxSize: MAX_MB * 1024 * 1024,
    onDropRejected: (rejections) => {
      const msg = rejections[0]?.errors[0]?.message ?? t('lessons.uploadError')
      setUploadState({ progress: 0, phase: 'error', errorMsg: msg })
    },
  })

  const handleUpload = async () => {
    if (!file || !classroomId || !title.trim()) return

    setUploadState({ progress: 0, phase: 'uploading', errorMsg: '' })

    // ── Step 1: Upload to Supabase Storage ────────────────────────────────────
    const ext = file.name.split('.').pop() ?? 'mp4'
    const storagePath = `${user?.id ?? 'unknown'}/${Date.now()}_${title.trim().replace(/\s+/g, '_')}.${ext}`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
        // Supabase JS v2 doesn't expose progress natively;
        // simulate progress with a timer for UX feedback.
      })

    if (uploadError) {
      setUploadState({
        progress: 0,
        phase: 'error',
        errorMsg: uploadError.message,
      })
      return
    }

    setUploadState({ progress: 80, phase: 'uploading', errorMsg: '' })

    // ── Step 2: Get public URL ─────────────────────────────────────────────────
    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(uploadData.path)

    const publicUrl = urlData.publicUrl

    // ── Step 3: Save metadata to backend ──────────────────────────────────────
    setUploadState({ progress: 90, phase: 'saving', errorMsg: '' })
    try {
      await api.post('/lessons', {
        classroom_id: classroomId,
        title: title.trim(),
        description: description.trim() || null,
        video_url: publicUrl,
        duration_sec: durationSec,
      })
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? t('lessons.saveError')
      // Clean up orphaned storage file
      await supabase.storage.from(BUCKET).remove([uploadData.path])
      setUploadState({ progress: 0, phase: 'error', errorMsg: detail })
      return
    }

    setUploadState({ progress: 100, phase: 'done', errorMsg: '' })
    setFile(null)
    setTitle('')
    setDescription('')
    setDurationSec(null)
    queryClient.invalidateQueries({ queryKey: ['lessons', 'teacher'] })
  }

  const isUploading = uploadState.phase === 'uploading' || uploadState.phase === 'saving'
  const canSubmit = !!file && !!classroomId && title.trim().length > 0 && !isUploading

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-700">{t('lessons.uploadNew')}</h2>

      {/* Classroom selector */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t('lessons.classroom')}</label>
        <select
          value={classroomId}
          onChange={(e) => setClassroomId(e.target.value)}
          disabled={isUploading}
          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm
            focus:outline-none focus:ring-2 focus:ring-amber-400
            disabled:bg-slate-50 disabled:text-slate-400"
        >
          {classrooms.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Title */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t('lessons.titleLabel')}</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('lessons.titlePlaceholder')}
          maxLength={200}
          disabled={isUploading}
          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm
            focus:outline-none focus:ring-2 focus:ring-amber-400
            disabled:bg-slate-50 disabled:text-slate-400"
        />
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">
          {t('lessons.descLabel')} <span className="text-slate-300">({t('lessons.optional')})</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('lessons.descPlaceholder')}
          maxLength={1000}
          rows={2}
          disabled={isUploading}
          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm resize-none
            focus:outline-none focus:ring-2 focus:ring-amber-400
            disabled:bg-slate-50 disabled:text-slate-400"
        />
      </div>

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-amber-400 bg-amber-50'
            : file
              ? 'border-emerald-300 bg-emerald-50/40'
              : 'border-slate-200 hover:border-amber-300 hover:bg-amber-50/40'
        } ${isUploading ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-2">
          {file ? (
            <>
              <CheckCircle size={26} className="text-emerald-500" />
              <p className="text-sm font-medium text-emerald-700">{file.name}</p>
              <p className="text-xs text-slate-400">
                {fmtFileSize(file.size)}
                {durationSec ? ` · ${fmtDuration(durationSec)}` : ''}
              </p>
            </>
          ) : (
            <>
              <Video size={26} className="text-slate-300" />
              <p className="text-sm text-slate-400">{t('lessons.dropHint')}</p>
              <p className="text-xs text-slate-300">MP4 · WebM · MOV · MKV · max {MAX_MB} MB</p>
            </>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {isUploading && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-500">
            <span>
              {uploadState.phase === 'saving'
                ? t('lessons.phaseSaving')
                : t('lessons.phaseUploading')}
            </span>
            <span>{uploadState.progress}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 rounded-full transition-all duration-500"
              style={{ width: `${uploadState.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Success */}
      {uploadState.phase === 'done' && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
          <CheckCircle size={15} /> {t('lessons.uploadSuccess')}
        </div>
      )}

      {/* Error */}
      {uploadState.phase === 'error' && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
          {uploadState.errorMsg}
        </div>
      )}

      {/* Submit button */}
      <button
        onClick={handleUpload}
        disabled={!canSubmit}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
          bg-amber-500 text-white text-sm font-semibold
          hover:bg-amber-600 disabled:opacity-50 transition-colors"
      >
        {isUploading
          ? <Loader2 size={16} className="animate-spin" />
          : <Upload size={16} />}
        {isUploading ? t('lessons.uploading') : t('lessons.upload')}
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TeacherLessons() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { data: classrooms = [], isLoading: loadingClasses } = useQuery({
    queryKey: ['classrooms', 'me-options'],
    queryFn: fetchMyClassrooms,
  })

  const { data: lessons = [], isLoading: loadingLessons } = useQuery({
    queryKey: ['lessons', 'teacher'],
    queryFn: fetchTeacherLessons,
  })

  const deleteMutation = useMutation({
    mutationFn: async ({ id, videoUrl }: { id: string; videoUrl: string }) => {
      // Extract storage path from public URL
      // URL shape: https://<project>.supabase.co/storage/v1/object/public/video_lessons/<path>
      const marker = `/object/public/${BUCKET}/`
      const idx = videoUrl.indexOf(marker)
      if (idx !== -1) {
        const storagePath = videoUrl.slice(idx + marker.length)
        await supabase.storage.from(BUCKET).remove([storagePath])
      }
      await api.delete(`/lessons/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lessons', 'teacher'] })
    },
  })

  const hasClassrooms = classrooms.length > 0

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{t('lessons.title')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('lessons.subtitle')}</p>
      </div>

      {/* No classrooms warning */}
      {!loadingClasses && !hasClassrooms && (
        <div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          {t('lessons.noClassroomsHint')}
        </div>
      )}

      {/* Upload form */}
      {hasClassrooms && <UploadForm classrooms={classrooms} />}

      {/* Lesson list */}
      <div>
        <h2 className="text-sm font-semibold text-slate-600 mb-3">{t('lessons.uploaded')}</h2>

        {loadingLessons && (
          <div className="flex justify-center py-10">
            <Loader2 size={26} className="animate-spin text-amber-400" />
          </div>
        )}

        {!loadingLessons && lessons.length === 0 && (
          <div className="flex flex-col items-center py-14 gap-3 text-center">
            <Video size={36} className="text-slate-200" />
            <p className="text-sm font-semibold text-slate-400">{t('lessons.emptyTeacher')}</p>
          </div>
        )}

        {!loadingLessons && lessons.length > 0 && (
          <div className="space-y-3">
            {lessons.map((lesson) => (
              <LessonCard
                key={lesson.id}
                lesson={lesson}
                onDelete={(id, url) => deleteMutation.mutate({ id, videoUrl: url })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
