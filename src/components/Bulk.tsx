import { useState, type ReactNode } from 'react'
import { t } from '../i18n'
import { Icon, showToast } from './ui'

export type Bulk = {
  on: boolean
  /** The selected ids that are still on screen. */
  picked: string[]
  has: (id: string) => boolean
  toggle: (id: string) => void
  setAll: (all: boolean) => void
  start: () => void
  stop: () => void
  total: number
}

/** Selecting several cards of one list. `ids` are the cards on screen now, so a card that left is forgotten. */
export function useBulk(ids: string[]): Bulk {
  const [on, setOn] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const picked = ids.filter((id) => sel.has(id))
  return {
    on,
    picked,
    total: ids.length,
    has: (id) => sel.has(id),
    toggle: (id) => setSel((s) => { const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next }),
    setAll: (all) => setSel(new Set(all ? ids : [])),
    start: () => setOn(true),
    stop: () => { setOn(false); setSel(new Set()) },
  }
}

/** The button that turns selecting on and off. */
export function BulkToggle({ bulk }: { bulk: Bulk }) {
  return <button className={`btn btn-small${bulk.on ? ' btn-primary' : ''}`} onClick={bulk.on ? bulk.stop : bulk.start}><Icon name="check" size={16} />{t(bulk.on ? 'Done selecting' : 'Select')}</button>
}

/** Wraps a card. While selecting, a tap anywhere on the card selects it instead of using its buttons. */
export function Pick({ bulk, id, children }: { bulk: Bulk; id: string; children: ReactNode }) {
  if (!bulk.on) return <>{children}</>
  const picked = bulk.has(id)
  return (
    <div className={`sel${picked ? ' sel-on' : ''}`}>
      {children}
      <button className="sel-hit" role="checkbox" aria-checked={picked} aria-label={t('Select')} onClick={() => bulk.toggle(id)}>
        <span className="sel-mark">{picked && <Icon name="check" size={18} />}</span>
      </button>
    </div>
  )
}

export type BulkAction = {
  label: string
  icon?: string
  tone?: 'primary' | 'danger'
  /** Asks once more before it runs. */
  confirm?: boolean
  /** Does it for one post. Return false for a post it does not apply to. */
  run: (id: string) => Promise<unknown> | false
}

/** The bar with what can be done to the selected cards. */
export function BulkBar({ bulk, actions }: { bulk: Bulk; actions: BulkAction[] }) {
  const [asking, setAsking] = useState('')
  const [busy, setBusy] = useState(false)
  if (!bulk.on) return null
  const n = bulk.picked.length
  async function go(a: BulkAction) {
    if (a.confirm && asking !== a.label) return setAsking(a.label)
    setAsking('')
    setBusy(true)
    const jobs = bulk.picked.map((id) => a.run(id))
    const skipped = jobs.filter((j) => j === false).length
    const done = await Promise.allSettled(jobs.filter((j) => j !== false) as Promise<unknown>[])
    const ok = done.filter((d) => d.status === 'fulfilled').length
    const failed = done.length - ok
    setBusy(false)
    showToast(`${t(a.label)}: ${ok}${skipped + failed ? ` · ${t('not done')}: ${skipped + failed}` : ''}`)
    bulk.stop()
  }
  return (
    <div className="bulk-bar" role="toolbar" aria-label={t('Selected posts')}>
      <span className="bulk-count"><b>{n}</b> {t('selected')}</span>
      <button className="link" onClick={() => bulk.setAll(n < bulk.total)}>{t(n < bulk.total ? 'Select all' : 'Select none')}</button>
      <span className="bulk-actions">
        {actions.map((a) => (
          <button key={a.label} disabled={!n || busy} className={`btn btn-small${asking === a.label || a.tone === 'danger' ? ' btn-danger' : a.tone === 'primary' ? ' btn-primary' : ''}`} onClick={() => go(a)}>
            {a.icon && <Icon name={a.icon} size={16} />}{asking === a.label ? `${t('Yes')}, ${t(a.label).toLowerCase()} ${n}` : t(a.label)}
          </button>
        ))}
      </span>
      <button className="icon-btn" onClick={bulk.stop} aria-label={t('Cancel')}><Icon name="close" size={18} /></button>
    </div>
  )
}
