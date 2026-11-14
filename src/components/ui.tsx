import { useSyncExternalStore, type ReactNode } from 'react'
import { addDays, cairoNow, categoryOf } from '../data/logic'
import type { Post } from '../data/types'
import { locale, t } from '../i18n'

const paths: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  offer: 'M4 12.5V5h7.5l8.5 8.5-7 7zM8.5 9.5h.01',
  review: 'M4 5h16v11H4zM8 20h8M12 16v4M9 10.5l2 2 4-4',
  fix: 'M12 3 2.5 20h19zM12 10v4.5M12 17.2v.3',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  posted: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.5l2.8 2.8L16 9.8',
  settings: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.4-2.3.9a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.5 2.5a7.6 7.6 0 0 0-2.6 1.5l-2.3-.9-2 3.4 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.4 2.3-.9a7.6 7.6 0 0 0 2.6 1.5l.5 2.5h4l.5-2.5a7.6 7.6 0 0 0 2.6-1.5l2.3.9 2-3.4z',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  redo: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  skip: 'M5 5l8 7-8 7zM18 5v14',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  image: 'M4 5h16v14H4zM4 16l4.5-4.5 4 4 2.5-2.5L20 18M15.5 9.5v.01',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  minus: 'M5 12h14',
  database: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  rows: 'M4 6h16M4 12h16M4 18h16',
  cards: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  prices: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  grip: 'M9 6v.01M15 6v.01M9 12v.01M15 12v.01M9 18v.01M15 18v.01',
}

export function Icon({ name, size = 22 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}

export function Chip({ tone = 'neutral', children }: { tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info'; children: ReactNode }) {
  return <span className={`chip chip-${tone}`}>{children}</span>
}

/** "Today", "Tomorrow", or a short date such as "Sat 14 Nov". */
export function dayLabel(date: string): string {
  const today = cairoNow().date
  if (date === today) return t('Today')
  if (date === addDays(today, 1)) return t('Tomorrow')
  if (date === addDays(today, -1)) return t('Yesterday')
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** "17:15" as "5:15 PM". */
export function timeLabel(time: string): string {
  const [h, m] = time.split(':').map(Number)
  return new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
}

// One short message at the bottom of the screen after an action.
let toast = ''
let toastTimer: ReturnType<typeof setTimeout> | undefined
const toastListeners = new Set<() => void>()
export function showToast(message: string) {
  toast = message
  toastListeners.forEach((l) => l())
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast = ''
    toastListeners.forEach((l) => l())
  }, 2200)
}
export function Toast() {
  const message = useSyncExternalStore((l) => (toastListeners.add(l), () => toastListeners.delete(l)), () => toast)
  return message ? <div className="toast" role="status">{message}</div> : null
}

export function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="empty">
      <Icon name={icon} size={36} />
      <p>{text}</p>
    </div>
  )
}

/** A search field with a clear button. */
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <span className="search">
      <Icon name="search" size={18} />
      <input type="search" value={value} placeholder={placeholder ?? t('Search by item name…')} onChange={(e) => onChange(e.target.value)} aria-label={t('Search')} />
      {value && <button onClick={() => onChange('')} aria-label={t('Clear')}><Icon name="close" size={16} /></button>}
    </span>
  )
}

/** Whether `style` is one of the styles these posts use. A style whose last post left falls back to all. */
export const styleOn = (posts: { style: string }[], style: string) => posts.some((p) => p.style === style)

/** Filter chips, one per style the posts use, each with its count. Hidden when there is only one style. */
export function StyleChips({ posts, value, onChange, className = '' }: { posts: { style: string }[]; value: string; onChange: (style: string) => void; className?: string }) {
  const counts = new Map<string, number>()
  for (const p of posts) counts.set(p.style, (counts.get(p.style) ?? 0) + 1)
  if (counts.size < 2) return null
  const active = counts.has(value) ? value : null
  return (
    <div className={`filters ${className}`} role="group" aria-label={t('Style')}>
      <button className={active === null ? 'filter on' : 'filter'} aria-pressed={active === null} onClick={() => onChange('')}>{t('All')} <i>{posts.length}</i></button>
      {[...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([name, n]) => (
        <button key={name} className={active === name ? 'filter on' : 'filter'} aria-pressed={active === name} onClick={() => onChange(name)}>{name || t('No style')} <i>{n}</i></button>
      ))}
    </div>
  )
}

/** Whether the category filter applies: the chosen category still has posts in the list. */
export const categoryOn = (posts: Pick<Post, 'items'>[], category: string) => category !== '' && posts.some((p) => categoryOf(p) === category)

/** Filter chips by category, with Bundle last. Hidden when the posts are all of one category. */
export function CategoryChips({ posts, value, onChange, className = '' }: { posts: Pick<Post, 'items'>[]; value: string; onChange: (category: string) => void; className?: string }) {
  const counts = new Map<string, number>()
  for (const p of posts) counts.set(categoryOf(p), (counts.get(categoryOf(p)) ?? 0) + 1)
  if (counts.size < 2) return null
  const active = counts.has(value) ? value : ''
  return (
    <div className={`filters ${className}`} role="group" aria-label={t('Category')}>
      <button className={active === '' ? 'filter on' : 'filter'} aria-pressed={active === ''} onClick={() => onChange('')}>{t('All categories')} <i>{posts.length}</i></button>
      {[...counts].sort((a, b) => (a[0] === 'Bundle' ? 1 : b[0] === 'Bundle' ? -1 : a[0].localeCompare(b[0]))).map(([name, n]) => (
        <button key={name} className={active === name ? 'filter on' : 'filter'} aria-pressed={active === name} onClick={() => onChange(name)}><span dir="auto">{name === 'Bundle' || name === 'Other' ? t(name) : name}</span> <i>{n}</i></button>
      ))}
    </div>
  )
}
