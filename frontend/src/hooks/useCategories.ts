import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../lib/axios'

export interface Category {
  id: string
  name: string
}

// Matches only when 'ort' / 'орт' is a whole word (not a substring of e.g. "proportion")
const ORT_WORD_RE = /\bort\b|\bорт\b/i

/** True if this category represents the ORT national exam, not a regular subject. */
export function isOrtCategory(cat: Category): boolean {
  return ORT_WORD_RE.test(cat.name)
}

export function useCategories() {
  const { i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'ru'

  return useQuery({
    // Include locale in key so cache is invalidated on language switch
    queryKey: ['categories', locale],
    queryFn: async () => {
      const { data } = await api.get<Category[]>('/tasks/categories')
      return data
    },
    staleTime: 5 * 60 * 1000,
    retry: 2,
  })
}
