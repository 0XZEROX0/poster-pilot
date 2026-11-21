import { useEffect, useState } from 'react'
import { checkHealth, HEALTH_URL, overall, spanLabel, useHealth, type HealthReport, type HealthState, type Level } from '../data/health'
import { locale, t, tn, useLang } from '../i18n'
import { Icon } from './ui'

const clock = (ms: number) => new Intl.DateTimeFormat(locale(), { timeZone: 'Africa/Cairo', hour: 'numeric', minute: '2-digit' }).format(new Date(ms))
const dayClock = (ms: number) => {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date(ms))
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date())
  const yesterday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date(Date.now() - 86_400_000))
  const day = d === today ? '' : d === yesterday ? `${t('Yesterday')} ` : `${new Intl.DateTimeFormat(locale(), { timeZone: 'Africa/Cairo', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(ms))} `
  return day + clock(ms)
}
const ago = (ms: number) => (Date.now() - ms < 90_000 ? t('just now') : tn('%s ago', { s: spanLabel(Date.now() - ms, t) }))
const fromTo = (a: number, b: number) => (b ? `${dayClock(a)} – ${clock(b)}` : `${dayClock(a)} · ${t('still going')}`)

type Tile = { key: string; icon: string; name: string; level: Level; big: string; small: string }

function tilesFor(h: HealthState): Tile[] {
  const r = h.report
  const down = h.state === 'down'
  const T = r?.tiles
  const since = h.lastSeen ? spanLabel(Date.now() - h.lastSeen, t) : ''
  const inRange = (x?: number) => !!x && !!r && x >= r.start
  const tiles: Tile[] = []
  // Internet at the server
  if (down || !T) tiles.push({ key: 'internet', icon: 'globe', name: t('Internet at the server'), level: 'none', big: t('Unknown'), small: down ? t('We will know when the server answers again.') : '' })
  else if (T.internet.state === 'bad') tiles.push({ key: 'internet', icon: 'globe', name: t('Internet at the server'), level: 'bad', big: t('Down'), small: tn('Since %s. n8n is running but cannot reach the internet.', { s: clock(T.internet.since || Date.now()) }) })
  else {
    const out = T.internet.lastOut
    tiles.push({ key: 'internet', icon: 'globe', name: t('Internet at the server'), level: T.internet.state === 'none' ? 'none' : 'good', big: t('Online'), small: out && inRange(out.to) ? tn('Down %d (%t).', { d: spanLabel(out.to - out.from, t), t: fromTo(out.from, out.to) }) : t('No cuts in this time.') })
  }
  // Server PC
  if (down) tiles.push({ key: 'server', icon: 'server', name: t('Server PC'), level: 'bad', big: t('No answer'), small: h.lastSeen ? tn('Last heard %t.', { t: dayClock(h.lastSeen) }) : '' })
  else if (T && T.server.state !== 'none' && (T.server.up ?? -1) >= 0) {
    const up = (T.server.up ?? 0) * 1000
    const bits = [inRange(T.server.restarted) ? tn('Restarted %t', { t: dayClock(T.server.restarted!) }) : '', T.server.disk && T.server.disk > 0 ? tn('Disk %n% full', { n: T.server.disk }) : '', T.server.note || ''].filter(Boolean)
    tiles.push({ key: 'server', icon: 'server', name: t('Server PC'), level: T.server.state, big: tn('Up %s', { s: spanLabel(up, t) }), small: bits.join(' · ') })
  } else tiles.push({ key: 'server', icon: 'server', name: t('Server PC'), level: T ? 'good' : 'none', big: T ? t('Running') : t('Unknown'), small: T ? t('The server watchdog has not reported yet.') : '' })
  // n8n
  if (down) tiles.push({ key: 'n8n', icon: 'engine', name: t('n8n engine'), level: 'bad', big: t('No answer'), small: tn('For %s. Nothing can run until it is back.', { s: since }) })
  else tiles.push({ key: 'n8n', icon: 'engine', name: t('n8n engine'), level: T ? 'good' : 'none', big: T ? t('Answering') : t('Checking…'), small: T?.n8n.lastCheck ? tn('Last check %s.', { s: ago(T.n8n.lastCheck) }) : '' })
  // Workflows
  if (down || !T) tiles.push({ key: 'workflows', icon: 'redo', name: t('Workflows'), level: 'none', big: down ? t('Paused') : t('Unknown'), small: down ? t('Waiting for the server.') : '' })
  else {
    const w = T.workflows
    const n = w.failed24 ?? 0
    // The tile is only yellow or red for failures in the last 2 hours that an internet cut or a restart do not explain.
    const small = !n ? t('No failed runs in the last 24 hours.')
      : (w.since ?? 0) > 0 ? tn('Last one %s. See What happened below.', { s: ago(w.lastAt || Date.now()) })
      : w.explained === n ? t('All during an internet cut or a server restart. Nothing failed since.')
      : tn('Last one %s. Nothing failed in the last 2 hours.', { s: ago(w.lastAt || Date.now()) })
    tiles.push({ key: 'workflows', icon: 'redo', name: t('Workflows'), level: w.state, big: n ? tn('%n failed', { n }) : t('All fine'), small })
  }
  // Website
  const web = T?.website
  tiles.push({ key: 'website', icon: 'cart', name: t('Website'), level: down ? 'warn' : web?.state ?? 'none', big: down ? t('Orders waiting') : web?.state === 'good' ? t('Orders arriving') : web?.state === 'warn' ? t('Order alerts stuck') : t('Not checked yet'), small: down ? t('The website sends them again when the server is back.') : web?.at ? tn('Checked %s.', { s: ago(web.at) }) : t('Checked every 15 minutes.') })
  // Facebook / Instagram
  const meta = T?.meta
  tiles.push({ key: 'meta', icon: 'send', name: t('Facebook & Instagram'), level: meta?.state ?? 'none', big: meta?.state === 'good' ? t('Connected') : meta?.state === 'bad' ? t('Token stopped working') : t('Not checked yet'), small: meta?.state === 'bad' ? t('Paste a new token into n8n\'s "Meta Page Token".') : down ? t('Posts already scheduled on Facebook still go out.') : meta?.at ? tn('Checked %s.', { s: ago(meta.at) }) : '' })
  // App errors
  const app = T?.app
  tiles.push({ key: 'app', icon: 'apps', name: t('App errors'), level: app?.state ?? 'none', big: app ? tn('%n in 24 h', { n: app.today ?? 0 }) : t('Unknown'), small: app?.today ? t('See What happened below.') : app ? t('No errors on anyone\'s phone or computer.') : '' })
  // Public link
  tiles.push({ key: 'link', icon: 'link', name: t('Public link'), level: down ? 'bad' : T ? 'good' : 'none', big: down ? t('No answer') : T ? t('Reachable') : t('Unknown'), small: down ? t('The app and the website cannot reach n8n.') : T ? t('The app and the website can reach n8n.') : '' })
  return tiles
}

function Hero({ h }: { h: HealthState }) {
  const level = overall(h)
  const r = h.report
  let title = t('Checking…')
  let text = ''
  if (h.state === 'down') {
    title = tn('Server is offline · %s', { s: spanLabel(Date.now() - (h.lastSeen || h.checkedAt), t) })
    text = h.lastSeen ? tn('n8n has not answered since %t. This device is online, so the problem is at the server: its internet, power or the link.', { t: dayClock(h.lastSeen) }) : t('n8n does not answer. This device is online, so the problem is at the server: its internet, power or the link.')
  } else if (h.state === 'offline') {
    title = t('This device is offline')
    text = t('Connect to the internet to see how the server is doing.')
  } else if (h.state === 'refused') {
    title = t('Not allowed')
    text = t('Sign out and in again. If it stays, ask the owner for "See system health".')
  } else if (r) {
    const bad = tilesFor(h).filter((x) => x.level === 'bad').map((x) => x.name)
    const warn = tilesFor(h).filter((x) => x.level === 'warn').map((x) => x.name)
    title = level === 'good' ? t('Everything is working') : level === 'warn' ? t('Working now') : t('Something needs a look')
    const last = [...r.events].sort((a, b) => (b.to || b.at) - (a.to || a.at)).find((e) => e.level === 'bad')
    text = level === 'good' ? t('Server, internet, n8n and the workflows are all answering.') : level === 'warn' ? tn('Needs a look: %w. See the yellow parts below.', { w: warn.join(', ') }) : bad.join(' · ')
    if (level === 'good' && last && last.to) text += ' ' + tn('Last problem: %w, %t. It is fixed.', { w: t(last.title).toLowerCase(), t: fromTo(last.at, last.to) })
  }
  return (
    <section className={`hl-hero hl-hero-${h.state === 'down' ? 'bad' : level}`}>
      <span className="hl-pulse"><i /></span>
      <div className="hl-hero-text">
        <h2>{title}</h2>
        {text && <p>{text}</p>}
      </div>
      <p className="hl-hero-when">
        {h.state === 'down' || h.state === 'offline' ? t('Trying again every minute') : h.checkedAt ? tn('Checked %s', { s: ago(h.checkedAt) }) : ''}
        <button className="hl-again" onClick={() => void checkHealth()}><Icon name="redo" size={16} />{t('Check now')}</button>
      </p>
    </section>
  )
}

function Timeline({ r, range, onRange, stale }: { r: HealthReport; range: '24h' | '7d'; onRange: (x: '24h' | '7d') => void; stale: boolean }) {
  const end = r.start + r.size * (r.rows[0]?.cells.length ?? 0)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => r.start + (end - r.start) * f)
  const tick = (ms: number, i: number) => (i === 4 ? t('Now') : range === '7d' ? new Intl.DateTimeFormat(locale(), { timeZone: 'Africa/Cairo', weekday: 'short' }).format(new Date(ms)) : new Intl.DateTimeFormat(locale(), { timeZone: 'Africa/Cairo', hour: 'numeric' }).format(new Date(ms)))
  const label = (c: Level) => (c === 'good' ? t('working') : c === 'warn' ? t('some trouble') : c === 'bad' ? t('down') : t('no data'))
  return (
    <section className="card hl-card">
      <header className="hl-card-head">
        <h3>{range === '7d' ? t('Last 7 days') : t('Last 24 hours')}</h3>
        <span className="seg hl-seg">
          <button className={range === '24h' ? 'on' : ''} onClick={() => onRange('24h')}>{t('24 h')}</button>
          <button className={range === '7d' ? 'on' : ''} onClick={() => onRange('7d')}>{t('7 days')}</button>
        </span>
      </header>
      {stale && <p className="hint">{tn('Last report from %t. The server has not answered since.', { t: dayClock(r.at) })}</p>}
      <div className="hl-rows">
        {r.rows.map((row) => (
          <div className="hl-row" key={row.key}>
            <span className="hl-row-name">{t(row.label)}</span>
            <span className="hl-bar" dir="ltr">
              {row.cells.map((c, i) => <i key={i} className={`hl-${c}`} title={`${dayClock(r.start + i * r.size)}: ${label(c)}`} />)}
            </span>
            <span className="hl-row-pct">{row.uptime === null ? '—' : `${row.uptime}%`}</span>
          </div>
        ))}
        <div className="hl-row hl-axis">
          <span />
          <span className="hl-ticks" dir="ltr">{ticks.map((x, i) => <span key={i}>{tick(x, i)}</span>)}</span>
          <span />
        </div>
      </div>
      <p className="hl-legend">
        {range === '7d' ? t('Each block is 3 hours.') : t('Each block is 30 minutes.')}
        {(['good', 'warn', 'bad', 'none'] as Level[]).map((c) => <span key={c}><i className={`hl-${c}`} />{label(c)}</span>)}
      </p>
    </section>
  )
}

function Events({ h }: { h: HealthState }) {
  const list = [...(h.report?.events ?? [])].sort((a, b) => (b.to || Date.now()) - (a.to || Date.now()))
  if (h.state === 'down') list.unshift({ at: h.lastSeen || h.checkedAt, to: 0, level: 'bad', title: t('Server stopped answering'), detail: t('Check that the server PC has power and internet. Everything waits and carries on when it is back.') })
  const tag = (l: Level, to: number, kind?: string) => (kind === 'restart' ? t('Restart') : l === 'bad' ? (to ? t('Down') : t('Now')) : l === 'warn' ? t('Error') : t('Fixed'))
  return (
    <section className="card hl-card">
      <header className="hl-card-head"><h3>{t('What happened')}</h3></header>
      {!list.length ? (
        <p className="hint">{t('Nothing went wrong in this time.')}</p>
      ) : (
        <ul className="hl-events">
          {list.map((e, i) => (
            <li key={i}>
              <span className={`hl-tag hl-tag-${e.level}`}>{tag(e.level, e.to, e.kind)}</span>
              <div>
                <b dir="auto">{t(e.title)}{e.count && e.count > 1 ? ` · ${tn('%n times', { n: e.count })}` : ''}</b>
                <p dir="auto">{t(e.detail)}{e.node ? ` (${e.node})` : ''}</p>
                <small>{e.kind === 'workflow' || e.kind === 'app' ? (e.count && e.count > 1 ? fromTo(e.at, e.to) : dayClock(e.at)) : fromTo(e.at, e.to)}{e.to && e.to - e.at > 60_000 && e.kind !== 'workflow' && e.kind !== 'app' ? ` · ${spanLabel(e.to - e.at, t)}` : ''}</small>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** System health: is the server on, does it have internet, does n8n answer, did any workflow or the app fail. */
export function HealthView() {
  useLang()
  const h = useHealth()
  const [range, setRange] = useState<'24h' | '7d'>(h.report?.range ?? '24h')
  // Fresh numbers when the page opens (the app-wide check may be a few minutes old).
  useEffect(() => { if (Date.now() - h.checkedAt > 30_000) void checkHealth() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (x: '24h' | '7d') => { setRange(x); void checkHealth(x) }
  if (!HEALTH_URL && !h.report) return <p className="hint hl-empty">{t('This copy of the app has no engine address, so it cannot check the system.')}</p>
  const tiles = tilesFor(h)
  return (
    <div className="hl">
      <Hero h={h} />
      <div className="hl-tiles">
        {tiles.map((x) => (
          <article key={x.key} className={`hl-tile hl-tile-${x.level}`}>
            <header><span className="hl-ic"><Icon name={x.icon} size={18} /></span><span className="hl-name">{x.name}</span><i className={`hl-dot hl-${x.level}`} /></header>
            <strong>{x.big}</strong>
            {x.small && <p>{x.small}</p>}
          </article>
        ))}
      </div>
      <div className="hl-cols">
        {h.report ? <Timeline r={h.report} range={range} onRange={pick} stale={h.state === 'down'} /> : <section className="card hl-card"><p className="hint">{t('Checking…')}</p></section>}
        <Events h={h} />
      </div>
    </div>
  )
}
