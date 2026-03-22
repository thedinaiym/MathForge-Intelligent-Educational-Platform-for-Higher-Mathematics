import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import api from '../lib/axios'
import { useUIStore } from '../store/uiStore'
import { useAuthStore } from '../store/authStore'

interface BalanceResponse {
  token_balance: number
}

export function useBalance() {
  const setTokenBalance = useUIStore((s) => s.setTokenBalance)
  const user = useAuthStore((s) => s.user)

  const query = useQuery({
    queryKey: ['billing', 'balance'],
    queryFn: async (): Promise<BalanceResponse> => {
      const { data } = await api.get<BalanceResponse>('/billing/balance')
      return data
    },
    enabled: !!user,   // only fetch when logged in
    retry: 1,          // 1 retry max (not 3)
    staleTime: 30_000,
  })

  useEffect(() => {
    if (query.data) {
      setTokenBalance(query.data.token_balance)
    }
  }, [query.data, setTokenBalance])

  return query
}
