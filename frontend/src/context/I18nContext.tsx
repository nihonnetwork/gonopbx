import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type Language = 'de' | 'en'

const STORAGE_KEY = 'ui-language'

function getInitialLanguage(): Language {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'de' || saved === 'en') return saved
  return 'en'
}

type I18nContextValue = {
  lang: Language
  setLang: (lang: Language) => void
  tr: (de: string, en: string) => string
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Language>(getInitialLanguage)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang)
  }, [lang])

  const value = useMemo<I18nContextValue>(() => ({
    lang,
    setLang,
    tr: (de: string, en: string) => (lang === 'en' ? en : de),
  }), [lang])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
