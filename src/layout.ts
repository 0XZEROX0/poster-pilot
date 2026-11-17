import { useSyncExternalStore } from 'react'

/**
 * How the app is laid out. 'grid' (the default): a home screen of app icons, and each app opens on its own
 * with only its own menu. 'classic': the older layout with every page in a sidebar (a bottom bar on phones).
 * Kept on this device, like the language and the theme.
 */
export type Layout = 'grid' | 'classic'
const KEY = 'posterpilot.layout'

function cached(): Layout {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'grid' || v === 'classic') return v
  } catch {
    // No storage: the default layout.
  }
  return 'grid'
}

let layout: Layout = cached()
const listeners = new Set<() => void>()

export function setLayout(next: Layout) {
  layout = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // The choice then lasts until the page is closed.
  }
  listeners.forEach((l) => l())
}

/** Re-renders the caller when the layout changes. */
export const useLayout = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => layout)
