import { useQuery } from '@tanstack/react-query'
import api from '../lib/axios'

export interface Category {
  id: string
  name: string
}

async function fetchCategories(): Promise<Category[]> {
  const { data } = await api.get<Category[]>('/tasks/categories')
  return data
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
