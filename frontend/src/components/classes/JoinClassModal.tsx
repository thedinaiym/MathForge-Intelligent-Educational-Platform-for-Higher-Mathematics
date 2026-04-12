/**
 * JoinClassModal — Phase 21
 *
 * Modal dialog where a student types a teacher's join_code to enroll
 * in a virtual classroom. Also lists all classrooms the student is
 * already enrolled in.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  X,
  Hash,
  CheckCircle,
  Loader2,
  AlertCircle,
  GraduationCap,
} from 'lucide-react'
import api from '../../lib/axios'

// ── Types ─────────────────────────────────────────────────────────────────────

interface JoinedClassroom {
  id: string
  name: string
  join_code: string
  teacher_name: string
  joined_at: string
}

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchJoinedClassrooms(): Promise<JoinedClassroom[]> {
  const { data } = await api.get<JoinedClassroom[]>('/classes/joined')
  return data
}

async function joinClassroom(code: string): Promise<JoinedClassroom> {
  const { data } = await api.post<JoinedClassroom>(`/classes/join/${code.toUpperCase().trim()}`)
  return data
}

// ── Component ─────────────────────────────────────────────────────────────────

interface JoinClassModalProps {
  onClose: () => void
}

export default function JoinClassModal({ onClose }: JoinClassModalProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')

  const { data: joined = [], isLoading: loadingJoined } = useQuery({
    queryKey: ['classrooms', 'joined'],
    queryFn: fetchJoinedClassrooms,
  })

  const joinMutation = useMutation({
    mutationFn: () => joinClassroom(code),
    onSuccess: () => {
      setCode('')
      queryClient.invalidateQueries({ queryKey: ['classrooms', 'joined'] })
    },
  })

  const errorMsg: string = (() => {
    if (!joinMutation.error) return ''
    const detail = (joinMutation.error as any)?.response?.data?.detail
    return typeof detail === 'string' ? detail : t('common.error')
  })()

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <GraduationCap size={18} className="text-amber-500" />
            <h2 className="font-semibold text-slate-800 text-sm">{t('classes.joinTitle')}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Join form */}
          <div>
            <p className="text-xs text-slate-500 mb-3">{t('classes.joinHint')}</p>
            <form
              onSubmit={(e) => { e.preventDefault(); if (code.trim()) joinMutation.mutate() }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))
                    joinMutation.reset()
                  }}
                  placeholder={t('classes.codePlaceholder')}
                  className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 text-sm font-mono tracking-widest
                    focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder:tracking-normal placeholder:font-sans placeholder:text-slate-300"
                />
              </div>
              <button
                type="submit"
                disabled={code.trim().length < 4 || joinMutation.isPending}
                className="px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold
                  hover:bg-amber-600 disabled:opacity-50 transition-colors"
              >
                {joinMutation.isPending
                  ? <Loader2 size={15} className="animate-spin" />
                  : t('classes.join')}
              </button>
            </form>

            {/* Success */}
            {joinMutation.isSuccess && (
              <div className="flex items-center gap-2 mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
                <CheckCircle size={15} />
                {t('classes.joinedSuccess', { name: joinMutation.data?.name })}
              </div>
            )}

            {/* Error */}
            {joinMutation.isError && (
              <div className="flex items-start gap-2 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                {errorMsg}
              </div>
            )}
          </div>

          {/* Enrolled classrooms */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              {t('classes.myClasses')}
            </h3>

            {loadingJoined && (
              <div className="flex justify-center py-4">
                <Loader2 size={20} className="animate-spin text-amber-400" />
              </div>
            )}

            {!loadingJoined && joined.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-4">
                {t('classes.notJoinedAny')}
              </p>
            )}

            {!loadingJoined && joined.length > 0 && (
              <ul className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {joined.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100"
                  >
                    <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <GraduationCap size={14} className="text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {t('classes.teacher')}: {c.teacher_name}
                      </p>
                    </div>
                    <span className="text-xs font-mono font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200 flex-shrink-0">
                      {c.join_code}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
