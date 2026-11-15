import { useSyncExternalStore } from 'react'

/** Light, dark, or 'auto' to follow the device. Kept on this device, like the language. */
export type Theme = 'light' | 'dark' | 'auto'
const KEY = 'posterpilot.theme'

function cached(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'auto') return v
  } catch {
    // No storage: follow the device.
  }
  return 'auto'
}

let theme: Theme = cached()
const listeners = new Set<() => void>()

/** index.css reads data-theme; with no attribute the device's setting decides. */
function apply() {
  const root = document.documentElement
  if (theme === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}
apply()

export function setTheme(next: Theme) {
  theme = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // The choice then lasts until the page is closed.
  }
  apply()
  listeners.forEach((l) => l())
}

/** Re-renders the caller when the theme changes. */
export const useTheme = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => theme)
