import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ptBR from './locales/pt-BR.json'
import en from './locales/en.json'
import es from './locales/es.json'

export const SUPPORTED_LANGUAGES = ['pt-BR', 'en', 'es'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  'pt-BR': 'Português',
  en: 'English',
  es: 'Español'
}

void i18n.use(initReactI18next).init({
  resources: {
    'pt-BR': { translation: ptBR },
    en: { translation: en },
    es: { translation: es }
  },
  lng: 'pt-BR',
  fallbackLng: 'pt-BR',
  interpolation: { escapeValue: false }
})

function isSupportedLanguage(value: string | null): value is SupportedLanguage {
  return !!value && (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
}

export async function loadInitialLanguage(): Promise<void> {
  const saved = await window.api.settings.get('ui_language')
  await i18n.changeLanguage(isSupportedLanguage(saved) ? saved : 'pt-BR')
}

export async function setLanguage(lang: SupportedLanguage): Promise<void> {
  await i18n.changeLanguage(lang)
  await window.api.settings.set('ui_language', lang)
}

export default i18n
