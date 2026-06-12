import type { TTSLanguage } from './useTTSSpeech'

export function normalizeAvatarLanguage(language?: string | null): TTSLanguage {
  const code = (language ?? 'ru').toLowerCase().split('-')[0]
  if (code === 'en') return 'en'
  if (code === 'kg' || code === 'ky') return 'kg'
  return 'ru'
}
