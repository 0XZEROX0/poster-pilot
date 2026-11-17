import type { CSSProperties } from 'react'
import { cairoNow } from '../data/logic'
import { locale, t } from '../i18n'
import { Icon } from './ui'

export type LauncherItem = { id: string; label: string; icon: string }

/** Each app's own colour on the home screen and in its top bar. */
const COLORS: Record<string, string> = {
  dashboard: '#283890',
  prices: '#f05828',
  builder: '#2f6bd8',
  maintenance: '#0f9488',
  offers: '#e04a7a',
  review: '#7a5af0',
  fix: '#e5484d',
  calendar: '#16a06a',
  brainstorm: '#e7a21a',
  posted: '#1597c9',
  database: '#56657f',
  activity: '#4f55d6',
  settings: '#6b7280',
}

/** Apps that belong together: inside one of them, the others of its group show as a small menu. */
export const APP_GROUPS: { title: string; ids: string[] }[] = [
  { title: 'Shop', ids: ['prices', 'builder', 'maintenance'] },
  { title: 'Posters', ids: ['dashboard', 'offers', 'review', 'fix', 'calendar', 'brainstorm', 'posted', 'database'] },
  { title: 'Team', ids: ['activity'] },
]

/** An app's icon: a coloured rounded square with the app's line icon in white. */
export function AppIcon({ id, icon, size = 64 }: { id: string; icon: string; size?: number }) {
  return (
    <span className="app-icon" style={{ '--app': COLORS[id] ?? '#283890', width: size, height: size } as CSSProperties}>
      <Icon name={icon} size={Math.round(size * 0.46)} />
    </span>
  )
}

/** The home screen: every app the person can open, as an icon. Opening one shows only that app. */
export function Launcher({ items, counts, name, onGo, onSettings }: {
  items: LauncherItem[]
  counts: Partial<Record<string, number>>
  name: string
  onGo: (id: string) => void
  onSettings: () => void
}) {
  const order = APP_GROUPS.flatMap((g) => g.ids)
  const list = [...items].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
  const first = name.split(/[\s@]/)[0]
  const hour = Number(cairoNow().time.slice(0, 2))
  const hello = hour < 12 ? t('Good morning') : hour < 18 ? t('Good afternoon') : t('Good evening')
  const tile = (x: LauncherItem, onClick: () => void) => (
    <button key={x.id} className="launch-tile" onClick={onClick}>
      <span className="launch-icon">
        <AppIcon id={x.id} icon={x.icon} />
        {counts[x.id] ? <i className={x.id === 'fix' ? 'badge badge-bad' : 'badge'}>{counts[x.id]}</i> : null}
      </span>
      <span className="launch-label">{t(x.label)}</span>
    </button>
  )
  return (
    <div className="launcher">
      <header className="launch-head">
        <h2 dir="auto">{first ? `${hello}, ${first}` : hello}</h2>
        <p className="muted">{new Date(`${cairoNow().date}T12:00:00Z`).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}</p>
      </header>
      <nav className="launch-grid" aria-label={t('Apps')}>
        {list.map((x) => tile(x, () => onGo(x.id)))}
        {tile({ id: 'settings', label: 'Settings', icon: 'settings' }, onSettings)}
      </nav>
    </div>
  )
}
