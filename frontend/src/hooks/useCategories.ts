import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../lib/axios'

export interface Category {
  id: string
  name: string
}

export function useCategories() {
  const { i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'ru'

  return useQuery({
    // Include locale in key so cache is invalidated on language switch
    queryKey: ['categories', locale],
    queryFn: async () => {
      const { data } = await api.get<Category[]>('/tasks/categories', {
        headers: { 'Accept-Language': locale },
      })
      return data
    },
    staleTime: 5 * 60 * 1000,
  })
}
