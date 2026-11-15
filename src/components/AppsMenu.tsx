import { useEffect, useState } from 'react'
import { t } from '../i18n'
import { Icon } from './ui'

export type NavItem = { id: string; label: string; icon: string }

const PINS_KEY = 'posterpilot.navPins'
/** How many apps fit in the phone bar between Home and Apps. */
export const MAX_PINS = 3
/** The bar for someone who has not chosen: the first three of these they can open. */
const DEFAULT_PINS = ['review', 'prices', 'offers', 'builder', 'fix', 'calendar']

function savedPins(): string[] | null {
  try {
    const raw = localStorage.getItem(PINS_KEY)
    const list = raw ? JSON.parse(raw) : null
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : null
  } catch {
    return null
  }
}

/** The apps in the phone's bottom bar. Kept in this browser; apps the person cannot open are left out. */
export function usePins(available: string[]) {
  const [pins, setPins] = useState<string[] | null>(savedPins)
  const usable = (pins ?? DEFAULT_PINS).filter((id) => id !== 'home' && available.includes(id)).slice(0, MAX_PINS)
  const save = (next: string[]) => {
    setPins(next)
    try { localStorage.setItem(PINS_KEY, JSON.stringify(next)) } catch { /* the bar is only remembered when storage works */ }
  }
  const toggle = (id: string) => {
    if (usable.includes(id)) save(usable.filter((x) => x !== id))
    else save([...usable, id].slice(-MAX_PINS))
  }
  return { pins: usable, toggle }
}

/** Sections of the apps menu. */
const GROUPS: { title: string; ids: string[] }[] = [
  { title: 'Shop', ids: ['prices', 'builder'] },
  { title: 'Posters', ids: ['offers', 'review', 'fix', 'calendar', 'posted', 'database'] },
]

/** Every app as a tile, opened from the bar's Apps button. "Edit bar" picks which apps sit in the bar. */
export function AppsMenu({ items, current, counts, pins, onToggle, onGo, onSettings, onClose }: {
  items: NavItem[]
  current: string
  counts: Partial<Record<string, number>>
  pins: string[]
  onToggle: (id: string) => void
  onGo: (id: string) => void
  onSettings: () => void
  onClose: () => void
}) {
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const tile = (x: NavItem) => {
    const pinned = pins.includes(x.id)
    return (
      <button
        key={x.id}
        className={`app-tile${x.id === current && !editing ? ' on' : ''}${editing && pinned ? ' pinned' : ''}`}
        onClick={() => (editing ? onToggle(x.id) : onGo(x.id))}
        aria-pressed={editing ? pinned : undefined}
        aria-current={!editing && x.id === current ? 'page' : undefined}
      >
        <span className="app-tile-icon">
          <Icon name={x.icon} size={24} />
          {editing ? (pinned && <i className="pin-mark"><Icon name="check" size={13} /></i>) : counts[x.id] ? <i className={x.id === 'fix' ? 'badge badge-bad' : 'badge'}>{counts[x.id]}</i> : null}
        </span>
        <span className="app-tile-label">{t(x.label)}</span>
      </button>
    )
  }
  const groups = GROUPS.map((g) => ({ ...g, list: items.filter((x) => g.ids.includes(x.id)) })).filter((g) => g.list.length)

  return (
    <div className="apps-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="apps-panel" role="dialog" aria-modal="true" aria-label={t('Apps')}>
        <header className="apps-head">
          <h2>{editing ? t('Edit bar') : t('Apps')}</h2>
          <button className="btn btn-ghost apps-edit" onClick={() => setEditing(!editing)}>{editing ? t('Done editing') : t('Edit bar')}</button>
        </header>
        {editing && <p className="hint apps-hint">{t('Pick up to 3 apps for the bottom bar. Home and Apps are always there.')}</p>}
        {groups.map((g) => (
          <section key={g.title}>
            <h3 className="apps-group">{t(g.title)}</h3>
            <div className="apps-grid">{g.list.map(tile)}</div>
          </section>
        ))}
        {!editing && (
          <button className="apps-settings" onClick={onSettings}><Icon name="settings" size={20} /><span>{t('Settings')}</span><Icon name="right" size={18} /></button>
        )}
      </div>
    </div>
  )
}
