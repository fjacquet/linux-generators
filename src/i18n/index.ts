import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import deCommon from './locales/de/common.json'
import enCommon from './locales/en/common.json'
import frCommon from './locales/fr/common.json'
import itCommon from './locales/it/common.json'

export const SUPPORTED_LANGUAGES = ['en', 'fr', 'de', 'it'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

// One namespace for now; split per-section as the form grows (Phase 5).
export const NAMESPACES = ['common'] as const
export const DEFAULT_NS = 'common' satisfies (typeof NAMESPACES)[number]

export const resources = {
  en: { common: enCommon },
  fr: { common: frCommon },
  de: { common: deCommon },
  it: { common: itCommon },
} as const

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES,
    defaultNS: DEFAULT_NS,
    ns: NAMESPACES,
    interpolation: { escapeValue: false },
    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      lookupQuerystring: 'lang',
      lookupLocalStorage: 'lg-lang',
      caches: ['localStorage'],
    },
  })

export default i18n
