import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Coins, X, Zap, QrCode, Phone, CheckCircle2 } from 'lucide-react'
import { useBalance } from '../../hooks/useBalance'
import { useUIStore } from '../../store/uiStore'

interface Package {
  id: string
  tokens: number
  price: number
  currency: string
  popular: boolean
}

const PACKAGES: Package[] = [
  { id: 'pkg_100', tokens: 100, price: 250, currency: 'сом', popular: false },
  { id: 'pkg_200', tokens: 200, price: 400, currency: 'сом', popular: true },
]

// ── Payment modal ─────────────────────────────────────────────────────────────

function PaymentModal({
  pkg,
  onClose,
}: {
  pkg: Package
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const phone = '+996 500 633 297'

  const handleCopy = () => {
    navigator.clipboard.writeText(phone.replace(/\s/g, '')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <p className="font-bold text-slate-800">{t('billing.payTitle')}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {pkg.tokens} {t('billing.tokens')} — {pkg.price} {pkg.currency}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* QR code */}
        <div className="px-5 pt-5 pb-3 flex flex-col items-center gap-3">
          <div className="p-2 border-2 border-amber-200 rounded-2xl bg-amber-50">
            <img
              src="/mbank-qr.png"
              alt="M-Bank QR"
              className="w-52 h-52 object-contain rounded-xl"
              onError={(e) => {
                // fallback if image not placed yet
                const el = e.currentTarget
                el.style.display = 'none'
                el.nextElementSibling?.classList.remove('hidden')
              }}
            />
            <div className="hidden w-52 h-52 flex items-center justify-center text-slate-300 flex-col gap-2">
              <QrCode size={48} />
              <span className="text-xs">mbank-qr.png</span>
            </div>
          </div>

          <p className="text-xs text-slate-500 text-center leading-relaxed">
            {t('billing.payInstructions')}
          </p>
        </div>

        {/* Phone */}
        <div className="px-5 pb-2">
          <button
            onClick={handleCopy}
            className="w-full flex items-center justify-between gap-3 px-4 py-3
                       bg-slate-50 border border-slate-200 rounded-xl hover:bg-amber-50
                       hover:border-amber-300 transition-all text-sm"
          >
            <div className="flex items-center gap-2">
              <Phone size={15} className="text-slate-400" />
              <span className="font-mono font-medium text-slate-700">{phone}</span>
            </div>
            {copied
              ? <CheckCircle2 size={15} className="text-green-500" />
              : <span className="text-xs text-slate-400">{t('billing.tapToCopy')}</span>
            }
          </button>
        </div>

        {/* Note */}
        <div className="px-5 pb-5">
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 leading-relaxed text-center">
            {t('billing.payNote')}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { t } = useTranslation()
  const { isLoading, isError } = useBalance()
  const { tokenBalance } = useUIStore()
  const [selectedPkg, setSelectedPkg] = useState<Package | null>(null)

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">{t('billing.title')}</h1>

      {isLoading ? (
        <p className="text-slate-400">{t('common.loading')}</p>
      ) : isError ? (
        <p className="text-red-500">{t('common.error')}</p>
      ) : (
        <>
          {/* Balance card */}
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
            {PACKAGES.map((pkg) => (
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

                <button
                  onClick={() => setSelectedPkg(pkg)}
                  className="inline-flex items-center gap-2 font-medium rounded-lg transition-colors
                             bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 text-sm w-full justify-center"
                >
                  {t('billing.buy')}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* M-Bank payment modal */}
      {selectedPkg && (
        <PaymentModal pkg={selectedPkg} onClose={() => setSelectedPkg(null)} />
      )}
    </div>
  )
}
