import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityFeed, actText, APP_LABEL, APPS, matches, type ActivityRow } from '../data/activity'
import { addDays, cairoNow } from '../data/logic'
import type { Data } from '../data/types'
import { locale, t, tn, useLang } from '../i18n'
import { useCostShown } from '../data/costs'
import { allowed } from '../data/store'
import { CostEye } from './PricesView'
import { Chip, Empty, Icon, SearchBox } from './ui'

/** How many lines one "Load more" adds. Each line is about one database read. */
/** Price list lines for the website prices, left out for roles without 'See website prices'. */
const WEB_LABELS = ['Price before', 'Price after']
const PAGE = 100
const RANGES = [
  { id: 'today', label: 'Today', days: 0 },
  { id: '7', label: 'Last 7 days', days: 6 },
  { id: '30', label: 'Last 30 days', days: 29 },
  { id: 'custom', label: 'Dates', days: -1 },
] as const
type Range = (typeof RANGES)[number]['id']

/** Midnight in Cairo at the start of a yyyy-mm-dd day, as a moment. */
function cairoMidnight(date: string): number {
  const noon = new Date(`${date}T12:00:00Z`)
  const asCairo = new Date(noon.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }))
  const asUtc = new Date(noon.toLocaleString('en-US', { timeZone: 'UTC' }))
  return Date.parse(`${date}T00:00:00Z`) - (asCairo.getTime() - asUtc.getTime())
}
const cairoDay = (ms: number) => cairoNow(new Date(ms)).date
const dayTitle = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const clock = (ms: number) => new Intl.DateTimeFormat(locale(), { timeZone: 'Africa/Cairo', hour: 'numeric', minute: '2-digit' }).format(new Date(ms))

const tone = (act: string) =>
  /(rejected|failed|error|refused|deleted|removed|remove|declined|cleared|cancel)/.test(act) ? 'log-bad' : /(approved|published|built|scheduled|accepted|saved|sent)$/.test(act) ? 'log-good' : ''

/** Everything anyone did in the app, newest first: who, what, when, with filters. Read a page at a time. */
export function ActivityView({ data, onOpen }: { data: Data; onOpen: (id: string) => void }) {
  useLang()
  const today = cairoNow().date
  const [range, setRange] = useState<Range>('7')
  const [fromDay, setFromDay] = useState(addDays(today, -6))
  const [toDay, setToDay] = useState(today)
  const [who, setWho] = useState('')
  const [app, setApp] = useState('')
  const [act, setAct] = useState('')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<ActivityRow[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const feed = useRef<ActivityFeed | null>(null)
  const seeCost = allowed('cost')
  const seeWeb = allowed('prices.web')
  const costOn = useCostShown()

  const pick = (id: Range) => {
    setRange(id)
    const r = RANGES.find((x) => x.id === id)!
    if (r.days >= 0) {
      setFromDay(addDays(today, -r.days))
      setToDay(today)
    }
  }

  // A new date range starts a new read. Filters only look through what is loaded.
  const from = cairoMidnight(fromDay <= toDay ? fromDay : toDay)
  const to = cairoMidnight(addDays(fromDay <= toDay ? toDay : fromDay, 1))
  useEffect(() => {
    // Cost changes are only readable (and only read) for roles with 'See and edit cost'.
    const f = new ActivityFeed(from, to, allowed('cost') ? ['activity', 'log', 'priceLog', 'costLog'] : undefined)
    feed.current = f
    setRows(null)
    setErrors([])
    setBusy(true)
    f.more(PAGE).then((list) => {
      if (feed.current !== f) return
      setRows(list)
      setErrors(f.errors)
    }).finally(() => feed.current === f && setBusy(false))
  }, [from, to])

  const loadMore = () => {
    const f = feed.current
    if (!f || busy) return
    setBusy(true)
    f.more(PAGE).then((list) => {
      if (feed.current !== f) return
      // The same line can arrive twice when two share a time; keep it once.
      setRows((old) => [...new Map([...(old ?? []), ...list].map((r) => [r.id, r])).values()])
      setErrors(f.errors)
    }).finally(() => feed.current === f && setBusy(false))
  }

  const all = rows ?? []
  const people = useMemo(() => [...new Map(all.filter((r) => r.kind === 'person').map((r) => [r.by, r.who])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [all])
  const kinds = useMemo(() => (['system', 'website', 'sheet'] as const).filter((k) => all.some((r) => r.kind === k)), [all])
  const acts = useMemo(() => [...new Set(all.filter((r) => !app || r.app === app).map((r) => r.act))].sort((a, b) => t(actText(a)).localeCompare(t(actText(b)))), [all, app])
  const shown = all.filter((r) => matches(r, { who, app, act, search }))
  const filtered = Boolean(who || app || act || search.trim())
  const days = shown.reduce<{ day: string; list: ActivityRow[] }[]>((out, r) => {
    const day = cairoDay(r.at)
    if (out[out.length - 1]?.day === day) out[out.length - 1].list.push(r)
    else out.push({ day, list: [r] })
    return out
  }, [])
  const postOf = (id?: string) => (id ? data.posts.find((p) => p.id === id) : undefined)
  const missingNew = errors.some((e) => e.startsWith('activity:'))
  const done = feed.current?.done ?? true

  return (
    <div className="view activity">
      <div className="filters" role="group" aria-label={t('Dates')}>
        {RANGES.map((r) => <button key={r.id} className={range === r.id ? 'filter on' : 'filter'} onClick={() => pick(r.id)}>{t(r.label)}</button>)}
      </div>
      {range === 'custom' && (
        <div className="form act-dates">
          <label><span>{t('From')}</span><input type="date" value={fromDay} max={today} onChange={(e) => e.target.value && setFromDay(e.target.value)} /></label>
          <label><span>{t('To')}</span><input type="date" value={toDay} max={today} onChange={(e) => e.target.value && setToDay(e.target.value)} /></label>
        </div>
      )}
      <div className="form act-filters">
        <label><span>{t('Who')}</span>
          <select value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">{t('Everyone')}</option>
            {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            {kinds.map((k) => <option key={k} value={`kind:${k}`}>{t(k === 'system' ? 'System' : k === 'website' ? 'Website' : 'Sheet')}</option>)}
          </select>
        </label>
        <label><span>{t('App')}</span>
          <select value={app} onChange={(e) => { setApp(e.target.value); setAct('') }}>
            <option value="">{t('All apps')}</option>
            {APPS.map((a) => <option key={a} value={a}>{t(APP_LABEL[a])}</option>)}
          </select>
        </label>
        <label><span>{t('Action')}</span>
          <select value={act} onChange={(e) => setAct(e.target.value)}>
            <option value="">{t('All actions')}</option>
            {acts.map((a) => <option key={a} value={a}>{t(actText(a))}</option>)}
          </select>
        </label>
      </div>
      <div className="act-search">
        <SearchBox value={search} onChange={setSearch} placeholder={t('Search names, products, notes')} />
        {seeCost && <CostEye />}
      </div>
      <p className="hint">
        {rows === null ? t('Loading…') : filtered ? tn('%shown of %n loaded lines match.', { shown: shown.length, n: all.length }) : tn('%n lines loaded.', { n: all.length })}
        {' '}{t('Cairo time. Nobody can change or remove a line.')}
      </p>
      {missingNew && <p className="small alert">{t('Quotes, people and settings lines cannot be read yet: publish the new database rules.')}</p>}
      {errors.filter((e) => !e.startsWith('activity:')).map((e) => <p key={e} className="small alert" dir="ltr">{e}</p>)}

      {rows !== null && !shown.length ? (
        <Empty icon="clock" text={t(filtered && !done ? 'Nothing matches in the lines loaded so far. Load more to look further back.' : 'Nothing recorded in these dates.')} />
      ) : days.map((d) => (
        <section key={d.day} className="act-day">
          <h3 className="act-day-title">{dayTitle(d.day)} <span className="muted small">{d.list.length}</span></h3>
          <ol className="log">
            {d.list.map((r) => {
              const post = postOf(r.postId)
              return (
                <li key={r.id} className={`log-line ${tone(r.act)}`}>
                  <div className="log-head">
                    <b>{t(actText(r.act))}</b>
                    <span className="act-meta">
                      <Chip tone={r.kind === 'person' ? 'neutral' : 'info'}>{r.kind === 'person' ? r.who : t(r.who)}</Chip>
                      <span className="muted small">{t(APP_LABEL[r.app])}</span>
                      <time className="muted small" dateTime={new Date(r.at).toISOString()}>{clock(r.at)}</time>
                    </span>
                  </div>
                  {(r.what || post) && (
                    post ? <button className="link act-what" onClick={() => onOpen(post.id)} dir="auto">{r.what || post.items.map((i) => i.name).join(' + ')}<Icon name="right" size={14} /></button>
                      : <span className="act-what" dir="auto">{r.what}</span>
                  )}
                  {r.note && <p className="small" dir="auto">{r.note}</p>}
                  {r.changes?.filter((c) => seeWeb || r.app !== 'prices' || !WEB_LABELS.includes(c.f)).map((c, i) => (
                    <p key={i} className="small log-change" dir="auto">
                      <span className="muted">{t(c.f)}:</span> {r.act === 'cost.edit' && !costOn ? <span>{t('Hidden. Press the eye to see it.')}</span> : <>{c.from && <><s dir="auto">{c.from}</s> → </>}<span dir="auto">{c.to || '-'}</span></>}
                    </p>
                  ))}
                </li>
              )
            })}
          </ol>
        </section>
      ))}
      {rows !== null && !done && (
        <button className="btn act-more" disabled={busy} onClick={loadMore}>{busy ? t('Loading…') : t('Load older lines')}</button>
      )}
    </div>
  )
}
