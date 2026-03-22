import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Coins, Zap, CheckCircle2 } from 'lucide-react'
import api from '../../lib/axios'
import { useBalance } from '../../hooks/useBalance'
import { useUIStore } from '../../store/uiStore'
import Button from '../../components/ui/Button'

interface PurchaseResponse {
  token_balance: number
  tokens_added: number
  message: string
}

const PACKAGES = [
  {
    id: 'pkg_100',
    tokens: 100,
    price: 250,
    currency: 'сом',
    popular: false,
  },
  {
    id: 'pkg_200',
    tokens: 200,
    price: 400,
    currency: 'сом',
    popular: true,
  },
] as const

export default function BillingPage() {
  const { t } = useTranslation()
  const { isLoading, isError } = useBalance()
  const { tokenBalance, setTokenBalance } = useUIStore()
  const queryClient = useQueryClient()
  const [purchasedPkg, setPurchasedPkg] = useState<string | null>(null)

  const purchaseMutation = useMutation<PurchaseResponse, Error, string>({
    mutationFn: async (packageId: string) => {
      const { data } = await api.post<PurchaseResponse>('/billing/purchase', {
        package_id: packageId,
      })
      return data
    },
    onSuccess: (data, packageId) => {
      setTokenBalance(data.token_balance)
      queryClient.invalidateQueries({ queryKey: ['billing', 'balance'] })
      setPurchasedPkg(packageId)
      setTimeout(() => setPurchasedPkg(null), 3000)
    },
  })

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">{t('billing.title')}</h1>

      {/* Balance card */}
      {isLoading ? (
        <p className="text-slate-400">{t('common.loading')}</p>
      ) : isError ? (
        <p className="text-red-500">{t('common.error')}</p>
      ) : (
        <>
          <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm mb-6 flex items-center gap-4">
            <div className="p-3 bg-amber-100 rounded-xl">
              <Coins className="text-amber-500" size={26} />
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider">{t('billing.balance')}</p>
              <p className="text-3xl font-bold text-slate-800">
                {tokenBalance % 1 === 0 ? tokenBalance : tokenBalance.toFixed(1)}{' '}
                <span className="text-base font-normal text-slate-400">{t('billing.tokens')}</span>
              </p>
            </div>
          </div>

          {/* Pricing info */}
          <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 mb-6">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              {t('billing.costTitle')}
            </p>
            <div className="space-y-2">
              {[
                { label: t('billing.costOcr'), cost: '0.5' },
                { label: t('billing.costPdf'), cost: '5' },
                { label: t('billing.costFree'), cost: '20 🎁', free: true },
              ].map(({ label, cost, free }) => (
                <div key={label} className="flex justify-between items-center text-sm">
                  <span className={free ? 'text-green-600' : 'text-slate-600'}>{label}</span>
                  <span className={`font-semibold ${free ? 'text-green-600' : 'text-amber-600'}`}>
                    {cost} {free ? t('billing.tokens') : t('billing.tokensShort')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Purchase packages */}
          <p className="text-sm font-semibold text-slate-700 mb-3">{t('billing.topUp')}</p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {PACKAGES.map((pkg) => {
              const isPurchased = purchasedPkg === pkg.id
              const isPending = purchaseMutation.isPending && purchaseMutation.variables === pkg.id

              return (
                <div
                  key={pkg.id}
                  className={`relative bg-white rounded-xl border-2 p-4 flex flex-col gap-3 transition-all ${
                    pkg.popular
                      ? 'border-amber-400 shadow-md'
                      : 'border-slate-200 hover:border-amber-300'
                  }`}
                >
                  {pkg.popular && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                      {t('billing.popular')}
                    </span>
                  )}

                  <div className="flex items-center gap-2">
                    <Zap size={16} className="text-amber-500" />
                    <span className="font-bold text-slate-800 text-lg">{pkg.tokens}</span>
                    <span className="text-slate-400 text-sm">{t('billing.tokens')}</span>
                  </div>

                  <p className="text-2xl font-bold text-slate-800">
                    {pkg.price}{' '}
                    <span className="text-sm font-normal text-slate-500">{pkg.currency}</span>
                  </p>

                  <Button
                    size="sm"
                    onClick={() => purchaseMutation.mutate(pkg.id)}
                    loading={isPending}
                    disabled={purchaseMutation.isPending}
                    className="w-full justify-center"
                  >
                    {isPurchased ? (
                      <span className="flex items-center gap-1.5 text-green-600">
                        <CheckCircle2 size={14} /> {t('billing.purchased')}
                      </span>
                    ) : (
                      t('billing.buy')
                    )}
                  </Button>
                </div>
              )
            })}
          </div>

          {purchaseMutation.isError && (
            <p className="text-sm text-red-500 mt-2">{t('common.error')}</p>
          )}
        </>
      )}
    </div>
  )
}
