import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import es from './es.json'
import ar from './ar.json'

const LANG_KEY = 'autobot_lang'

function detectLanguage() {
  try {
    const stored = localStorage.getItem(LANG_KEY)
    if (stored) return stored
  } catch {}
  // Detect from browser
  if (typeof navigator !== 'undefined') {
    const navLang = navigator.language || navigator.userLanguage || ''
    if (navLang.startsWith('es')) return 'es'
    if (navLang.startsWith('ar')) return 'ar'
  }
  return 'en'
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
    ar: { translation: ar },
  },
  lng: detectLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
})

export function setLanguage(lang) {
  try { localStorage.setItem(LANG_KEY, lang) } catch {}
  i18n.changeLanguage(lang)
}

export function getLanguage() {
  return i18n.language || 'en'
}

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'ar', label: 'العربية' },
]

export default i18n
