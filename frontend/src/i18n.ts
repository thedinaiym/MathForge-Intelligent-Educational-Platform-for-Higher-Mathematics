import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import en from './locales/en.json'
import ru from './locales/ru.json'
import kg from './locales/kg.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ru: { translation: ru },
      kg: { translation: kg },
    },
    fallbackLng: 'ru',
    supportedLngs: ['en', 'ru', 'kg'],
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'mathforge_lang',
    },
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
