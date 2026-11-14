import { useSyncExternalStore } from 'react'
import { ar } from './ar'

export type Lang = 'en' | 'ar'
const KEY = 'posterpilot.lang'

function cached(): Lang {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'en' || v === 'ar') return v
  } catch {
    // No storage: fall through to the browser's language.
  }
  return navigator.language.startsWith('ar') ? 'ar' : 'en'
}

let lang: Lang = cached()
const listeners = new Set<() => void>()

function apply() {
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
}
apply()

export function setLang(next: Lang) {
  lang = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // The choice then lasts until the page is closed.
  }
  apply()
  listeners.forEach((l) => l())
}

/** Re-renders the caller when the language changes. */
export const useLang = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => lang)

/** The text in the current language. English is the key. */
export const t = (english: string) => (lang === 'ar' ? (ar[english] ?? english) : english)

/** Like t, with %name filled in from `vars`. */
export const tn = (english: string, vars: Record<string, string | number>) => t(english).replace(/%([a-z]+)/g, (m, k: string) => (k in vars ? String(vars[k]) : m))

export const locale = () => (lang === 'ar' ? 'ar-EG' : 'en-GB')
