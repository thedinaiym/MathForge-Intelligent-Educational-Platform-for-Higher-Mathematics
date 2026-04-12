/**
 * TeacherClassrooms — Phase 21
 *
 * Teachers can:
 *   - Create a new virtual classroom (generates a join_code)
 *   - View all their classrooms with enrolled student lists
 *   - Copy the join_code to clipboard
 *   - Delete a classroom
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Trash2,
  Users,
  BookOpen,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import api from '../../lib/axios'

// ── Types ─────────────────────────────────────────────────────────────────────

interface StudentInfo {
  id: string
  name: string
  joined_at: string
}

interface ClassroomData {
  id: string
  name: string
  join_code: string
  created_at: string
  student_count: number
  students: StudentInfo[]
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchMyClassrooms(): Promise<ClassroomData[]> {
  const { data } = await api.get<ClassroomData[]>('/classes/me')
  return data
}

async function createClassroom(name: string): Promise<ClassroomData> {
  const { data } = await api.post<ClassroomData>('/classes', { name })
  return data
}

async function deleteClassroom(id: string): Promise<void> {
  await api.delete(`/classes/${id}`)
}

// ── Copy-code button ──────────────────────────────────────────────────────────

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback: select text via execCommand
    }
  }

  return (
    <button
      onClick={handleCopy}
      title="Copy join code"
      className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold tracking-widest border transition-all ${
        copied
          ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
          : 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
      }`}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {code}
    </button>
  )
}

// ── Single classroom card ─────────────────────────────────────────────────────

function ClassroomCard({ classroom }: { classroom: ClassroomData }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: () => deleteClassroom(classroom.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classrooms', 'me'] })
    },
  })

  const createdDate = new Date(classroom.created_at).toLocaleDateString()

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="flex items-center gap-3 p-4">
        <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
          <BookOpen size={18} className="text-amber-500" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 text-sm truncate">{classroom.name}</p>
          <p className="text-xs text-slate-400">{t('classes.createdOn', { date: createdDate })}</p>
        </div>

        {/* Student count badge */}
        <div className="flex items-center gap-1 px-2 py-1 bg-slate-50 rounded-lg text-xs text-slate-500 flex-shrink-0">
          <Users size={12} />
          {classroom.student_count}
        </div>

        {/* Join code */}
        <CopyCodeButton code={classroom.join_code} />

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors flex-shrink-0"
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      {/* Expandable student roster */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-3">
          {classroom.students.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-3">
              {t('classes.noStudentsYet')}
            </p>
          ) : (
            <ul className="space-y-2">
              {classroom.students.map((s) => (
                <li key={s.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-400 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm text-slate-700">{s.name}</span>
                  </div>
                  <span className="text-xs text-slate-400">
                    {new Date(s.joined_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Delete zone */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 font-medium transition-colors"
              >
                <Trash2 size={12} /> {t('classes.deleteClass')}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600 font-medium">{t('classes.confirmDelete')}</span>
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="text-xs px-2 py-1 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  {deleteMutation.isPending ? '…' : t('classes.yes')}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  {t('classes.cancel')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Create classroom form ─────────────────────────────────────────────────────

function CreateClassroomForm({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')

  const mutation = useMutation({
    mutationFn: () => createClassroom(name.trim()),
    onSuccess: () => {
      setName('')
      onCreated()
    },
  })

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (name.trim()) mutation.mutate() }}
      className="flex gap-2"
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('classes.namePlaceholder')}
        maxLength={120}
        className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-sm
          focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder:text-slate-300"
      />
      <button
        type="submit"
        disabled={!name.trim() || mutation.isPending}
        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 text-white
          text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors"
      >
        {mutation.isPending
          ? <Loader2 size={15} className="animate-spin" />
          : <Plus size={15} />}
        {t('classes.create')}
      </button>
    </form>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TeacherClassrooms() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { data: classrooms = [], isLoading, isError } = useQuery({
    queryKey: ['classrooms', 'me'],
    queryFn: fetchMyClassrooms,
  })

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">{t('classes.title')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('classes.subtitle')}</p>
      </div>

      {/* Create form */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">{t('classes.newClass')}</h2>
        <CreateClassroomForm
          onCreated={() => queryClient.invalidateQueries({ queryKey: ['classrooms', 'me'] })}
        />
        <p className="text-xs text-slate-400 mt-2">{t('classes.codeHint')}</p>
      </div>

      {/* Classroom list */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 size={28} className="animate-spin text-amber-400" />
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          <AlertCircle size={16} />
          {t('common.error')}
        </div>
      )}

      {!isLoading && !isError && classrooms.length === 0 && (
        <div className="flex flex-col items-center py-16 gap-3 text-center">
          <Users size={36} className="text-slate-200" />
          <p className="text-sm font-semibold text-slate-500">{t('classes.empty')}</p>
          <p className="text-xs text-slate-400">{t('classes.emptyHint')}</p>
        </div>
      )}

      {!isLoading && !isError && classrooms.length > 0 && (
        <div className="space-y-3">
          {classrooms.map((c) => (
            <ClassroomCard key={c.id} classroom={c} />
          ))}
        </div>
      )}
    </div>
  )
}
