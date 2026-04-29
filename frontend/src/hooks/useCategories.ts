import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../lib/axios'

export interface Category {
  id: string
  name: string
}

/** True if this category represents the ORT national exam, not a regular subject.
 *  JS \b word-boundaries don't work for Cyrillic, so we use startsWith after
 *  uppercasing — ORT categories always start with "ORT" or "ОРТ". */
export function isOrtCategory(cat: Category): boolean {
  const upper = cat.name.trim().toUpperCase()
  return upper.startsWith('ORT') || upper.startsWith('ОРТ')
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
    staleTime: 30 * 60 * 1000,  // 30 min — categories rarely change
    gcTime:    60 * 60 * 1000,  // keep in memory 1 hour
    retry: 2,
  })
}
