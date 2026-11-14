import { useEffect, useState } from 'react'
import { ACT_TEXT, cairoTime, FIELD_TEXT, sortLog } from '../data/history'
import { backend } from '../data/store'
import type { LogEntry } from '../data/types'
import { locale, t, useLang } from '../i18n'
import { Sheet } from './Sheet'
import { Icon } from './ui'

const who = (e: LogEntry) => (e.by === 'sheet' ? t('Sheet') : e.by === 'system' ? t('System') : e.byName || t('Someone'))
const tone = (act: string) => (/^(offer\.rejected|poster\.failed|fb\.error|ig\.error|delete\.refused|deleted|removed|cleared)$/.test(act) ? 'log-bad' : /approved|published|built|scheduled$/.test(act) ? 'log-good' : '')

/** The lines of a history, newest first. */
export function LogList({ entries }: { entries: LogEntry[] }) {
  useLang()
  if (!entries.length) return <p className="muted small">{t('Nothing recorded yet. Every action from now on is listed here.')}</p>
  return (
    <ol className="log">
      {sortLog(entries).map((e) => (
        <li key={e.id} className={`log-line ${tone(e.act)}`}>
          <div className="log-head">
            <b>{t(ACT_TEXT[e.act] ?? e.act)}</b>
            <span className="log-who">{who(e)}</span>
          </div>
          <time className="muted small" dir="auto" dateTime={new Date(e.at).toISOString()}>{cairoTime(e.at, locale())}</time>
          {e.note && <p className="small" dir="auto">{e.note}</p>}
          {e.changes?.map((c, i) => (
            <p key={i} className="small log-change" dir="auto">
              <span className="muted">{t(FIELD_TEXT[c.f] ?? c.f)}:</span> {c.from && <><s dir="auto">{c.from}</s> → </>}<span dir="auto">{c.to || '-'}</span>
            </p>
          ))}
        </li>
      ))}
    </ol>
  )
}

/** One post's history. It is read only while it is open, to keep database reads low. */
export function PostHistory({ postId }: { postId: string }) {
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<LogEntry[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open) return
    return backend.watchLog(postId, setEntries, setError)
  }, [open, postId])
  return (
    <details className="history" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary><Icon name="clock" size={18} />{t('History')} <span className="muted small">{t('(Cairo time)')}</span></summary>
      {error ? <p className="small alert">{error}</p> : entries === null ? <p className="muted small">{t('Loading…')}</p> : <LogList entries={entries} />}
    </details>
  )
}

/** Posts that are gone keep their history: the list of them, and each one's full history. */
export function DeletedHistory({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<LogEntry[] | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState('')
  useEffect(() => {
    backend.deletedLog().then(setList, (e: Error) => setError(e.message))
  }, [])
  // One line per post: its latest removal.
  const gone = [...new Map(sortLog(list ?? []).reverse().map((e) => [e.postId, e])).values()].sort((a, b) => b.at - a.at)
  return (
    <Sheet title={t('Deleted posts')} onClose={onClose}>
      <p className="hint">{t('Posts deleted in the app or removed from the sheet. Their history is kept.')} {t('(Cairo time)')}</p>
      {error && <p className="small alert">{error}</p>}
      {list === null && !error && <p className="muted small">{t('Loading…')}</p>}
      {list !== null && !gone.length && <p className="muted small">{t('Nothing deleted since the history started.')}</p>}
      <ul className="gone-list">
        {gone.map((e) => (
          <li key={e.postId}>
            <button className="gone-row" onClick={() => setOpen(open === e.postId ? '' : e.postId)}>
              <b dir="auto">{e.title || e.postId}</b>
              <span className="muted small">{t(ACT_TEXT[e.act] ?? e.act)} · {who(e)} · {cairoTime(e.at, locale())}</span>
            </button>
            {open === e.postId && <Full postId={e.postId} />}
          </li>
        ))}
      </ul>
    </Sheet>
  )
}

function Full({ postId }: { postId: string }) {
  const [entries, setEntries] = useState<LogEntry[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => backend.watchLog(postId, setEntries, setError), [postId])
  return error ? <p className="small alert">{error}</p> : entries === null ? <p className="muted small">{t('Loading…')}</p> : <LogList entries={entries} />
}
