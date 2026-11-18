import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { track } from '../data/activity'
import { addDays, cairoNow } from '../data/logic'
import { allowed } from '../data/store'
import {
  addMonths, cairoMs, checkSpot, clockOf, clockOpen, windowText, DAY_NAMES, DEFAULT_SETTINGS, deviceId, devicesOf, hm, hr, judgeDay, judgeMonth, metersPerLng, monthOf, myUid, openDay, shiftOn, UNITS, WEEK, weekdayOf, withDate, withPlan,
  type DayResult, type DayState, type HrSettings, type Month, type Person, type Place, type Shift, type Shifts, type Totals, type Unit,
} from '../data/hr'
import { locale, t, tn } from '../i18n'
import { Sheet } from './Sheet'
import { useDesktop } from './useDesktop'
import { Avatar, Empty, Icon, showToast } from './ui'

type Section = 'me' | 'today' | 'shifts' | 'report' | 'setup'
const SECTION_LABEL: Record<Section, string> = { me: 'My attendance', today: 'Today', shifts: 'Shifts', report: 'Report', setup: 'Shop location' }

const STATE_LABEL: Record<DayState, string> = { off: 'Day off', upcoming: 'Shift later', notIn: 'Not in yet', absent: 'Absent', working: 'Working', noOut: 'No clock-out', done: 'Done', extra: 'Extra day' }
const STATE_TONE: Record<DayState, string> = { off: '', upcoming: '', notIn: 'chip-warn', absent: 'chip-bad', working: 'chip-info', noOut: 'chip-warn', done: 'chip-good', extra: 'chip-info' }
const UNIT_LABEL: Record<Unit, string> = { EGP: 'EGP', hours: 'hours', days: 'days' }

const dayLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const monthLabel = (month: string) => new Date(`${month}-15T12:00:00Z`).toLocaleDateString(locale(), { month: 'long', year: 'numeric', timeZone: 'UTC' })
const shiftText = (s: Shift) => (s ? `${s.s} – ${s.e}` : t('Off'))
const mapLink = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`
const refused = (e: unknown) => {
  console.error(e)
  showToast(/permission/i.test(String(e)) ? t('Your role does not allow this. Make sure the latest rules are published in Firebase.') : t('Could not save. Check the connection and try again.'))
}

/** The phone's location, asked fresh (never a remembered one). */
function locate(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(Object.assign(new Error('none'), { code: 2 }))
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 })
  })
}
const locateError = (e: unknown) => ((e as { code?: number }).code === 1
  ? t('Location is blocked for this site. Allow location for Static OS in the browser settings, then try again.')
  : t('Could not find where you are. Turn on location (GPS) and try again.'))

export function HrView() {
  const manager = allowed('hr')
  const sections: Section[] = [...(allowed('hr.clock') || manager ? ['me' as const] : []), ...(manager ? ['today', 'shifts', 'report', 'setup'] as const : [])]
  const [section, setSection] = useState<Section>(manager ? 'today' : 'me')
  const [settings, setSettings] = useState<HrSettings | null>(null)
  const [shifts, setShifts] = useState<Shifts | null>(null)
  const [people, setPeople] = useState<{ uid: string; name: string }[]>([])
  const [error, setError] = useState('')
  const thisMonth = monthOf(cairoNow().date)
  const [month, setMonth] = useState(thisMonth)
  const [mine, setMine] = useState<Month | undefined>()
  const [all, setAll] = useState<Month[] | null>(null)

  const reload = () => {
    hr.loadSettings().then(setSettings, (e) => { setSettings(DEFAULT_SETTINGS); setError(String(e)) })
    hr.loadShifts().then(setShifts, (e) => { setShifts({}); setError(String(e)) })
  }
  useEffect(reload, [])
  useEffect(() => { if (manager) hr.loadPeople().then(setPeople, () => setPeople([])) }, [manager])
  // My own month: one document. Everyone's month only for a manager, and only on the pages that show it.
  useEffect(() => hr.watchMine(thisMonth, setMine, (e) => setError(String(e))), [thisMonth])
  const wantAll = manager && (section === 'today' || section === 'report')
  const watchMonth = section === 'today' ? thisMonth : month
  useEffect(() => {
    if (!wantAll) return
    setAll(null)
    return hr.watchAll(watchMonth, setAll, (e) => setError(String(e)))
  }, [wantAll, watchMonth])

  if (!settings || !shifts) return <div className="hr"><p className="muted">{t('Loading…')}</p></div>
  return (
    <div className="hr">
      {sections.length > 1 && (
        <div className="filters">
          {sections.map((s) => <button key={s} className={`filter${section === s ? ' on' : ''}`} onClick={() => setSection(s)}>{t(SECTION_LABEL[s])}</button>)}
        </div>
      )}
      {error && <p className="banner banner-bad hr-banner" dir="ltr">{/permission/i.test(error) ? t('Your role does not allow this. Make sure the latest rules are published in Firebase.') : error}</p>}
      {section === 'me' && <MyAttendance settings={settings} person={shifts[myUid()]} mine={mine} />}
      {section === 'today' && <TodayBoard settings={settings} shifts={shifts} months={all} />}
      {section === 'shifts' && <ShiftsBoard shifts={shifts} people={people} onSaved={(uid, p) => setShifts({ ...shifts, [uid]: p })} />}
      {section === 'report' && <Report settings={settings} shifts={shifts} months={all} month={month} setMonth={setMonth} people={people} />}
      {section === 'setup' && <Setup settings={settings} onSaved={setSettings} />}
    </div>
  )
}

// ---------- Clocking in ----------

/** Clocks the signed-in person in (or out of the open day): checks the hours, then the location. Says what happened. */
export async function punchNow(settings: HrSettings, open: string | null, today: string): Promise<{ bad: boolean; text: string }> {
  if (!settings.places.length) return { bad: true, text: t('The shop location is not set yet. Ask the owner to set it in HR, Shop location.') }
  const kind = open ? 'out' : 'in'
  if (!clockOpen(settings, kind, clockOf(Date.now()))) {
    const hours = kind === 'in' ? windowText(settings.inFrom, settings.inTo) : windowText(settings.outFrom, settings.outTo)
    return { bad: true, text: tn(kind === 'in' ? 'Clocking in is open %h only.' : 'Clocking out is open %h only. Ask HR to fix the time if you have to leave now.', { h: hours }) }
  }
  try {
    const pos = await locate()
    const { latitude: lat, longitude: lng, accuracy } = pos.coords
    const acc = Math.round(accuracy)
    const c = checkSpot(settings, lat, lng, acc)
    if (!c.ok) {
      const place = c.place !== undefined ? settings.places[c.place] : undefined
      return {
        bad: true,
        text: c.why === 'vague' ? tn('Your location is not exact enough (±%a m, at most ±%m m). Turn on precise location or GPS, step near a window and try again.', { a: acc, m: settings.maxAcc })
          : c.why === 'far' && place ? tn('You are %d from %p. Clocking in works only within %r m of the shop.', { d: c.dist! >= 1000 ? `${(c.dist! / 1000).toFixed(1)} km` : `${Math.round(c.dist!)} m`, p: place.name, r: place.radius })
            : t('The shop location is not set yet. Ask the owner to set it in HR, Shop location.'),
      }
    }
    const p = { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), acc, place: c.place, dev: deviceId() }
    if (open) await hr.clockOut(open, p)
    else await hr.clockIn(today, p)
    return { bad: false, text: tn(open ? 'Clocked out at %t. %d m from %p.' : 'Clocked in at %t. %d m from %p.', { t: clockOf(Date.now()), d: Math.round(c.dist), p: settings.places[c.place].name }) }
  } catch (e) {
    if (typeof (e as { code?: unknown }).code === 'number') return { bad: true, text: locateError(e) }
    console.error(e)
    return { bad: true, text: /permission/i.test(String(e)) ? t('Your role does not allow this. Make sure the latest rules are published in Firebase.') : t('Could not save. Check the connection and try again.') }
  }
}

function MyAttendance({ settings, person, mine }: { settings: HrSettings; person?: Person; mine?: Month }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 20_000); return () => clearInterval(id) }, [])
  const today = cairoNow(new Date(now)).date
  const dd = today.slice(8, 10)
  const day = mine?.days[dd]
  const open = openDay(mine, today)
  const shift = shiftOn(person, today)
  const r = judgeDay(today, shift, day, settings.grace, now)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ bad: boolean; text: string } | null>(null)
  const month = judgeMonth(monthOf(today), person, mine, settings.grace, now)
  const doneToday = Boolean(day?.in && day.out) && !open

  async function punch() {
    setMsg(null)
    setBusy(true)
    setMsg(await punchNow(settings, open, today))
    setBusy(false)
  }

  return (
    <div className="hr-me">
      <section className="hr-clock">
        <p className="hr-now" dir="ltr">{clockOf(now)}</p>
        <p className="muted">{dayLabel(today)} · {shift ? tn('Shift %s', { s: shiftText(shift) }) : person ? t('Day off today') : t('No shift set for you yet')}</p>
        <div className="hr-state">
          <span className={`chip ${STATE_TONE[r.state]}`}>{t(STATE_LABEL[r.state])}</span>
          {day?.in && <span className="chip">{tn('In %t', { t: clockOf(day.in) })}</span>}
          {day?.out && <span className="chip">{tn('Out %t', { t: clockOf(day.out) })}</span>}
          {r.late > 0 && <span className="chip chip-bad">{tn('%m late', { m: hm(r.late) })}</span>}
          {r.early > 0 && <span className="chip chip-warn">{tn('Left %m early', { m: hm(r.early) })}</span>}
        </div>
        {doneToday ? (
          <p className="hint">{t('You are done for today.')}</p>
        ) : (
          <button className={`hr-punch${open ? ' out' : ''}`} onClick={punch} disabled={busy}>
            <Icon name="clock" size={26} />
            {busy ? t('Checking your location…') : open ? t('Clock out') : t('Clock in')}
          </button>
        )}
        {msg && <p className={msg.bad ? 'banner banner-bad hr-msg' : 'banner hr-msg'}>{msg.text}</p>}
        <p className="hint">{t('Your location is checked when you tap, and only then. It must be inside the shop.')}</p>
        {(settings.inFrom || settings.inTo || settings.outFrom || settings.outTo) && (
          <p className="hint" dir="auto">{[windowText(settings.inFrom, settings.inTo) && `${t('Clock in')} ${windowText(settings.inFrom, settings.inTo)}`, windowText(settings.outFrom, settings.outTo) && `${t('Clock out')} ${windowText(settings.outFrom, settings.outTo)}`].filter(Boolean).join(' · ')}</p>
        )}
      </section>
      <TotalsTiles totals={month.totals} />
      <MonthDays days={month.days} />
      {mine && mine.pens.length > 0 && <Penalties list={mine.pens} />}
    </div>
  )
}

function TotalsTiles({ totals }: { totals: Totals }) {
  return (
    <div className="hr-tiles">
      <div className={`tile ${totals.lateDays ? 'tile-bad' : 'tile-zero'}`}><b>{totals.lateDays}</b><span>{tn('Late days · %m', { m: hm(totals.lateMin) })}</span></div>
      <div className={`tile ${totals.earlyDays ? 'tile-warn' : 'tile-zero'}`}><b>{totals.earlyDays}</b><span>{tn('Left early · %m', { m: hm(totals.earlyMin) })}</span></div>
      <div className={`tile ${totals.absent ? 'tile-bad' : 'tile-zero'}`}><b>{totals.absent}</b><span>{t('Absent days')}</span></div>
      <div className="tile tile-good"><b>{Math.round(totals.workedMin / 60)}</b><span>{tn('Hours worked · %n days', { n: totals.present })}</span></div>
    </div>
  )
}

function MonthDays({ days, onFix }: { days: DayResult[]; onFix?: (r: DayResult) => void }) {
  const list = [...days].reverse().filter((r) => r.state !== 'off' || r.day)
  if (!list.length) return <Empty icon="calendar" text={t('Nothing this month yet.')} />
  return (
    <div className="hr-days">
      {list.map((r) => (
        <div key={r.date} className="hr-day">
          <span className="hr-day-date">{dayLabel(r.date)}</span>
          <span className="hr-day-shift muted" dir="ltr">{shiftText(r.shift)}</span>
          <span className="hr-day-times" dir="ltr">{r.day?.in ? clockOf(r.day.in) : '—'} → {r.day?.out ? clockOf(r.day.out) : '—'}</span>
          <span className="hr-day-chips">
            {r.state !== 'done' && <span className={`chip ${STATE_TONE[r.state]}`}>{t(STATE_LABEL[r.state])}</span>}
            {r.late > 0 && <span className="chip chip-bad">{tn('%m late', { m: hm(r.late) })}</span>}
            {r.early > 0 && <span className="chip chip-warn">{tn('%m early', { m: hm(r.early) })}</span>}
            {r.day?.excused && <span className="chip chip-good">{t('Excused')}</span>}
            {r.day?.fixBy && <span className="chip" title={r.day.note}>{t('Fixed by hand')}</span>}
          </span>
          {onFix && <button className="btn btn-small btn-ghost" onClick={() => onFix(r)}><Icon name="edit" size={16} />{t('Fix')}</button>}
        </div>
      ))}
    </div>
  )
}

function Penalties({ list, onRemove }: { list: Month['pens']; onRemove?: (i: number) => void }) {
  return (
    <section className="hr-pens">
      <h3>{t('Penalties')}</h3>
      {list.map((p, i) => (
        <div key={`${p.at}-${i}`} className="hr-pen">
          <b dir="ltr">{p.amount} {t(UNIT_LABEL[p.unit])}</b>
          <span dir="auto">{p.reason || '—'}</span>
          <small className="muted">{dayLabel(p.date)} · {p.byName}</small>
          {onRemove && <button className="icon-btn" onClick={() => onRemove(i)} aria-label={t('Take back')} title={t('Take back')}><Icon name="trash" size={18} /></button>}
        </div>
      ))}
    </section>
  )
}

// ---------- Today, for the manager ----------

function peopleOf(shifts: Shifts, months: Month[] | null, extra: { uid: string; name: string }[] = []) {
  const names = new Map<string, string>()
  for (const [uid, p] of Object.entries(shifts)) names.set(uid, p.name)
  for (const m of months ?? []) if (!names.has(m.uid)) names.set(m.uid, extra.find((x) => x.uid === m.uid)?.name ?? m.uid)
  return [...names.entries()].map(([uid, name]) => ({ uid, name })).sort((a, b) => a.name.localeCompare(b.name))
}

function TodayBoard({ settings, shifts, months }: { settings: HrSettings; shifts: Shifts; months: Month[] | null }) {
  const today = cairoNow().date
  const dd = today.slice(8, 10)
  if (!months) return <p className="muted">{t('Loading…')}</p>
  const rows = peopleOf(shifts, months).map((p) => {
    const m = months.find((x) => x.uid === p.uid)
    return { ...p, m, r: judgeDay(today, shiftOn(shifts[p.uid], today), m?.days[dd], settings.grace) }
  })
  const count = (f: (s: DayState) => boolean) => rows.filter((x) => f(x.r.state)).length
  const order: DayState[] = ['working', 'notIn', 'absent', 'noOut', 'done', 'extra', 'upcoming', 'off']
  rows.sort((a, b) => order.indexOf(a.r.state) - order.indexOf(b.r.state))
  if (!rows.length) return <Empty icon="users" text={t('Nobody has shifts yet. Open Shifts to add your team.')} />
  return (
    <>
      <div className="hr-tiles">
        <div className="tile tile-good"><b>{count((s) => s === 'working')}</b><span>{t('In the shop now')}</span></div>
        <div className={`tile ${rows.some((x) => x.r.late) ? 'tile-bad' : 'tile-zero'}`}><b>{rows.filter((x) => x.r.late).length}</b><span>{t('Came late today')}</span></div>
        <div className={`tile ${count((s) => s === 'notIn') ? 'tile-warn' : 'tile-zero'}`}><b>{count((s) => s === 'notIn')}</b><span>{t('Not in yet')}</span></div>
        <div className={`tile ${count((s) => s === 'absent') ? 'tile-bad' : 'tile-zero'}`}><b>{count((s) => s === 'absent')}</b><span>{t('Absent')}</span></div>
      </div>
      <div className="hr-list">
        {rows.map(({ uid, name, m, r }) => {
          const p = r.day?.inP
          const devices = devicesOf(m).size
          return (
            <div key={uid} className="hr-person">
              <Avatar uid={uid} name={name} size={40} />
              <div className="hr-person-main">
                <b dir="auto">{name}</b>
                <span className="muted small" dir="ltr">{shiftText(r.shift)}</span>
              </div>
              <div className="hr-person-times" dir="ltr">
                <span>{r.day?.in ? clockOf(r.day.in) : '—'}</span>
                <span className="muted">→</span>
                <span>{r.day?.out ? clockOf(r.day.out) : '—'}</span>
              </div>
              <div className="hr-day-chips">
                <span className={`chip ${STATE_TONE[r.state]}`}>{t(STATE_LABEL[r.state])}</span>
                {r.late > 0 && <span className="chip chip-bad">{tn('%m late', { m: hm(r.late) })}</span>}
                {r.early > 0 && <span className="chip chip-warn">{tn('%m early', { m: hm(r.early) })}</span>}
                {p && <a className="chip chip-info" href={mapLink(p.lat, p.lng)} target="_blank" rel="noreferrer" title={t('Where they clocked in')}>{settings.places[p.place]?.name ?? '?'} ±{p.acc} m</a>}
                {devices > 1 && <span className="chip chip-warn" title={t('Clocked in from more than one phone this month. Worth a look.')}>{tn('%n phones', { n: devices })}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ---------- Shifts ----------

function ShiftsBoard({ shifts, people, onSaved }: { shifts: Shifts; people: { uid: string; name: string }[]; onSaved: (uid: string, p: Person) => void }) {
  const today = cairoNow().date
  // The week starts on Saturday.
  const [start, setStart] = useState(() => addDays(today, -((weekdayOf(today) + 1) % 7)))
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const [editing, setEditing] = useState<{ uid: string; name: string } | null>(null)
  const [adding, setAdding] = useState('')
  const list = Object.entries(shifts).map(([uid, p]) => ({ uid, name: p.name, p })).sort((a, b) => a.name.localeCompare(b.name))
  const others = people.filter((x) => !shifts[x.uid])
  return (
    <>
      <div className="hr-week-nav">
        <button className="icon-btn" onClick={() => setStart(addDays(start, -7))} aria-label={t('Previous week')}><Icon name="left" /></button>
        <b>{dayLabel(dates[0])} – {dayLabel(dates[6])}</b>
        <button className="icon-btn" onClick={() => setStart(addDays(start, 7))} aria-label={t('Next week')}><Icon name="right" /></button>
        {others.length > 0 && (
          <select className="hr-add" value={adding} onChange={(e) => { const x = others.find((o) => o.uid === e.target.value); if (x) setEditing(x); setAdding('') }}>
            <option value="">{t('+ Add a person')}</option>
            {others.map((o) => <option key={o.uid} value={o.uid}>{o.name}</option>)}
          </select>
        )}
      </div>
      {list.length === 0 ? <Empty icon="calendar" text={t('Nobody has shifts yet. Add a person to set their week.')} /> : (
        <div className="hr-week-wrap">
          <table className="hr-week">
            <thead>
              <tr><th />{dates.map((d) => <th key={d} className={d === today ? 'today' : ''}>{dayLabel(d)}</th>)}</tr>
            </thead>
            <tbody>
              {list.map(({ uid, name, p }) => (
                <tr key={uid} onClick={() => setEditing({ uid, name })}>
                  <th><span className="hr-who"><Avatar uid={uid} name={name} size={28} /><span dir="auto">{name}</span></span></th>
                  {dates.map((d) => {
                    const s = shiftOn(p, d)
                    return <td key={d} className={`${s ? '' : 'off'}${d in p.dates ? ' changed' : ''}${d === today ? ' today' : ''}`} dir="ltr">{s ? <>{s.s}<br />{s.e}</> : t('Off')}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint">{t('Tap a person to change their week or one day. A dotted cell is a one-day change.')}</p>
      {editing && <ShiftEditor uid={editing.uid} person={shifts[editing.uid] ?? { name: editing.name, plans: [], dates: {} }} onClose={() => setEditing(null)} onSaved={(p) => { onSaved(editing.uid, p); setEditing(null) }} />}
    </>
  )
}

function ShiftEditor({ uid, person, onClose, onSaved }: { uid: string; person: Person; onClose: () => void; onSaved: (p: Person) => void }) {
  const today = cairoNow().date
  const current = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), shiftOn({ ...person, dates: {} }, addDays(today, (d - weekdayOf(today) + 7) % 7))]))
  const [days, setDays] = useState<Record<string, Shift>>(() => (person.plans.length ? current : Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), d === 5 ? null : { s: '11:00', e: '19:00' }]))))
  const [from, setFrom] = useState(today)
  const [oneDate, setOneDate] = useState(addDays(today, 1))
  const [oneOff, setOneOff] = useState(true)
  const [one, setOne] = useState({ s: '11:00', e: '19:00' })
  const [p, setP] = useState(person)
  const [busy, setBusy] = useState(false)
  const set = (d: number, s: Shift) => setDays({ ...days, [String(d)]: s })
  const lastOn = WEEK.map((d) => days[String(d)]).find(Boolean) ?? { s: '11:00', e: '19:00' }

  async function save(next: Person, what: string) {
    setBusy(true)
    try {
      await hr.savePerson(uid, next)
      track('hr', 'hr.shifts', { what: next.name, note: what, ref: uid })
      setP(next)
      return true
    } catch (e) { refused(e); return false } finally { setBusy(false) }
  }
  const changes = Object.entries(p.dates).filter(([d]) => d >= addDays(today, -30)).sort(([a], [b]) => (a < b ? -1 : 1))
  return (
    <Sheet title={p.name} onClose={onClose}>
      <div className="form">
        <h3>{t('Weekly shifts')}</h3>
        {WEEK.map((d) => {
          const s = days[String(d)]
          return (
            <div key={d} className="hr-edit-day">
              <label className="check"><input type="checkbox" checked={Boolean(s)} onChange={(e) => set(d, e.target.checked ? lastOn : null)} /><span>{t(DAY_NAMES[d])}</span></label>
              {s ? (
                <span className="hr-times">
                  <input type="time" value={s.s} onChange={(e) => set(d, { ...s, s: e.target.value })} aria-label={t('Starts')} />
                  <span>–</span>
                  <input type="time" value={s.e} onChange={(e) => set(d, { ...s, e: e.target.value })} aria-label={t('Ends')} />
                </span>
              ) : <span className="muted">{t('Day off')}</span>}
            </div>
          )
        })}
        <label><span>{t('These shifts start on')}</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value || today)} /></label>
        <p className="hint">{t('Days before this date keep the shifts they had, so past late minutes do not change. An end before the start means the shift ends the next morning.')}</p>
        <button className="btn btn-primary" disabled={busy} onClick={async () => { if (await save(withPlan(p, { from, days }), `${t('Weekly shifts')} ${from}`)) onSaved(withPlan(p, { from, days })) }}>{t('Save weekly shifts')}</button>

        <h3>{t('One-day change')}</h3>
        <p className="hint">{t('A day off, a holiday, or different hours on one date. It wins over the weekly shifts.')}</p>
        <div className="hr-one">
          <input type="date" value={oneDate} onChange={(e) => setOneDate(e.target.value)} aria-label={t('Date')} />
          <div className="seg">
            <button className={oneOff ? 'on' : ''} onClick={() => setOneOff(true)}>{t('Day off')}</button>
            <button className={!oneOff ? 'on' : ''} onClick={() => setOneOff(false)}>{t('Hours')}</button>
          </div>
          {!oneOff && <span className="hr-times"><input type="time" value={one.s} onChange={(e) => setOne({ ...one, s: e.target.value })} /><span>–</span><input type="time" value={one.e} onChange={(e) => setOne({ ...one, e: e.target.value })} /></span>}
          <button className="btn" disabled={busy || !oneDate} onClick={() => save(withDate(p, oneDate, oneOff ? null : one), `${oneDate}: ${oneOff ? 'off' : `${one.s}-${one.e}`}`)}>{t('Add')}</button>
        </div>
        {changes.map(([d, s]) => (
          <div key={d} className="hr-change">
            <span>{dayLabel(d)}</span><span className="muted" dir="ltr">{shiftText(s)}</span>
            <button className="icon-btn" disabled={busy} onClick={() => save(withDate(p, d, undefined), `${d}: removed`)} aria-label={t('Remove')}><Icon name="trash" size={18} /></button>
          </div>
        ))}
      </div>
    </Sheet>
  )
}

// ---------- Report ----------

function Report({ settings, shifts, months, month, setMonth, people }: { settings: HrSettings; shifts: Shifts; months: Month[] | null; month: string; setMonth: (m: string) => void; people: { uid: string; name: string }[] }) {
  const desktop = useDesktop()
  const [open, setOpen] = useState<string | null>(null)
  const rows = useMemo(() => (months ? peopleOf(shifts, months, people).map((p) => {
    const m = months.find((x) => x.uid === p.uid)
    return { ...p, m, ...judgeMonth(month, shifts[p.uid], m, settings.grace) }
  }) : []), [months, shifts, month, settings.grace, people])
  const pens = (x: Totals) => UNITS.filter((u) => x.pens[u]).map((u) => `${x.pens[u]} ${t(UNIT_LABEL[u])}`).join(' + ') || '—'
  function csv() {
    const head = ['Name', 'Shift days', 'Present', 'Absent', 'Late days', 'Late minutes', 'Left early days', 'Early minutes', 'No clock-out', 'Hours worked', 'Penalty EGP', 'Penalty hours', 'Penalty days']
    const lines = rows.map((r) => [r.name, r.totals.scheduled, r.totals.present, r.totals.absent, r.totals.lateDays, r.totals.lateMin, r.totals.earlyDays, r.totals.earlyMin, r.totals.noOut, (r.totals.workedMin / 60).toFixed(1), r.totals.pens.EGP, r.totals.pens.hours, r.totals.pens.days])
    const text = [head, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }))
    a.download = `attendance-${month}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  }
  const current = rows.find((r) => r.uid === open)
  const [printing, setPrinting] = useState(false)
  useEffect(() => {
    if (!printing) return
    const id = requestAnimationFrame(() => printSheet(`attendance-${month}`, () => setPrinting(false)))
    return () => cancelAnimationFrame(id)
  }, [printing, month])
  return (
    <>
      {printing && createPortal(
        <div className="ticket-print hr-paper">
          <h1>{tn('Attendance %m', { m: monthLabel(month) })}</h1>
          <ReportTable rows={rows} pens={pens} />
          <p>{tn('Grace %g minutes. Printed %d.', { g: settings.grace, d: dayLabel(cairoNow().date) })}</p>
        </div>, document.body)}
      <div className="hr-week-nav">
        <button className="icon-btn" onClick={() => setMonth(addMonths(month, -1))} aria-label={t('Previous month')}><Icon name="left" /></button>
        <b>{monthLabel(month)}</b>
        <button className="icon-btn" onClick={() => setMonth(addMonths(month, 1))} disabled={month >= monthOf(cairoNow().date)} aria-label={t('Next month')}><Icon name="right" /></button>
        <span className="hr-grow" />
        <button className="btn btn-small" onClick={csv} disabled={!rows.length}>{t('Download CSV')}</button>
        <button className="btn btn-small" onClick={() => setPrinting(true)} disabled={!rows.length}><Icon name="print" size={16} />{t('Print')}</button>
      </div>
      {!months ? <p className="muted">{t('Loading…')}</p> : !rows.length ? <Empty icon="calendar" text={t('No attendance this month.')} /> : desktop ? (
        <div className="hr-week-wrap"><ReportTable rows={rows} pens={pens} onOpen={setOpen} /></div>
      ) : (
        <div className="hr-list">
          {rows.map((r) => (
            <button key={r.uid} className="hr-person" onClick={() => setOpen(r.uid)}>
              <Avatar uid={r.uid} name={r.name} size={40} />
              <div className="hr-person-main">
                <b dir="auto">{r.name}</b>
                <span className="muted small">{tn('%p of %s days · %h h', { p: r.totals.present, s: r.totals.scheduled, h: (r.totals.workedMin / 60).toFixed(0) })}</span>
              </div>
              <div className="hr-day-chips">
                {r.totals.lateDays > 0 && <span className="chip chip-bad">{tn('Late %n× · %m', { n: r.totals.lateDays, m: hm(r.totals.lateMin) })}</span>}
                {r.totals.earlyDays > 0 && <span className="chip chip-warn">{tn('Early %n×', { n: r.totals.earlyDays })}</span>}
                {r.totals.absent > 0 && <span className="chip chip-bad">{tn('Absent %n', { n: r.totals.absent })}</span>}
                {pens(r.totals) !== '—' && <span className="chip">{pens(r.totals)}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
      {current && <PersonMonth key={current.uid} uid={current.uid} name={current.name} month={month} m={current.m} days={current.days} totals={current.totals} onClose={() => setOpen(null)} />}
    </>
  )
}

type ReportRow = { uid: string; name: string; totals: Totals }
function ReportTable({ rows, pens, onOpen }: { rows: ReportRow[]; pens: (x: Totals) => string; onOpen?: (uid: string) => void }) {
  return (
    <table className="hr-report">
      <thead><tr><th>{t('Name')}</th><th>{t('Present')}</th><th>{t('Absent')}</th><th>{t('Late')}</th><th>{t('Left early')}</th><th>{t('No clock-out')}</th><th>{t('Hours')}</th><th>{t('Penalties')}</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.uid} onClick={onOpen && (() => onOpen(r.uid))}>
            <th><span className="hr-who">{onOpen && <Avatar uid={r.uid} name={r.name} size={28} />}<span dir="auto">{r.name}</span></span></th>
            <td>{r.totals.present} / {r.totals.scheduled}</td>
            <td className={r.totals.absent ? 'bad' : ''}>{r.totals.absent}</td>
            <td className={r.totals.lateDays ? 'bad' : ''}>{r.totals.lateDays} · {hm(r.totals.lateMin)}</td>
            <td className={r.totals.earlyDays ? 'warn' : ''}>{r.totals.earlyDays} · {hm(r.totals.earlyMin)}</td>
            <td>{r.totals.noOut}</td>
            <td>{(r.totals.workedMin / 60).toFixed(1)}</td>
            <td>{pens(r.totals)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Prints only the report sheet, on A4 landscape, then puts the page back. */
function printSheet(name: string, done: () => void) {
  const title = document.title
  const page = document.createElement('style')
  page.textContent = '@page { size: A4 landscape; margin: 10mm; }'
  document.head.appendChild(page)
  document.body.classList.add('printing-ticket')
  document.title = name
  let finished = false
  const restore = () => {
    if (finished) return
    finished = true
    document.title = title
    page.remove()
    document.body.classList.remove('printing-ticket')
    done()
  }
  const started = Date.now()
  window.print()
  if (Date.now() - started > 1000) return restore()
  window.addEventListener('afterprint', () => setTimeout(restore, 500), { once: true })
  setTimeout(restore, 60_000)
}

function PersonMonth({ uid, name, month, m, days, totals, onClose }: { uid: string; name: string; month: string; m?: Month; days: DayResult[]; totals: Totals; onClose: () => void }) {
  const [fixing, setFixing] = useState<DayResult | null>(null)
  const today = cairoNow().date
  const [pen, setPen] = useState({ amount: '', unit: 'EGP' as Unit, date: monthOf(today) === month ? today : `${month}-01`, reason: '' })
  const [busy, setBusy] = useState(false)
  async function addPen() {
    const amount = Number(pen.amount)
    if (!(amount > 0)) return showToast(t('Type how much.'))
    setBusy(true)
    try {
      await hr.addPenalty(uid, month, { amount, unit: pen.unit, date: pen.date, reason: pen.reason })
      track('hr', 'hr.penalty', { what: name, note: `${amount} ${pen.unit} · ${pen.date} · ${pen.reason.trim()}`, ref: uid })
      setPen({ ...pen, amount: '', reason: '' })
    } catch (e) { refused(e) }
    setBusy(false)
  }
  async function removePen(i: number) {
    if (!m || !confirm(t('Take this penalty back?'))) return
    try {
      await hr.removePenalty(m, i)
      track('hr', 'hr.penalty_removed', { what: name, note: `${m.pens[i].amount} ${m.pens[i].unit} · ${m.pens[i].reason}`, ref: uid })
    } catch (e) { refused(e) }
  }
  return (
    <Sheet title={`${name} · ${monthLabel(month)}`} onClose={onClose}>
      <div className="hr-me">
        <TotalsTiles totals={totals} />
        <MonthDays days={days} onFix={setFixing} />
        <Penalties list={m?.pens ?? []} onRemove={removePen} />
        <div className="form hr-pen-form">
          <h3>{t('Give a penalty')}</h3>
          <div className="hr-one">
            <input type="number" min="0" step="0.25" inputMode="decimal" placeholder={t('Amount')} value={pen.amount} onChange={(e) => setPen({ ...pen, amount: e.target.value })} />
            <select value={pen.unit} onChange={(e) => setPen({ ...pen, unit: e.target.value as Unit })}>{UNITS.map((u) => <option key={u} value={u}>{t(UNIT_LABEL[u])}</option>)}</select>
            <input type="date" value={pen.date} min={`${month}-01`} max={`${month}-31`} onChange={(e) => setPen({ ...pen, date: e.target.value })} />
          </div>
          <input placeholder={t('Reason (they see it)')} value={pen.reason} onChange={(e) => setPen({ ...pen, reason: e.target.value })} maxLength={500} />
          <button className="btn btn-primary" disabled={busy} onClick={addPen}>{t('Give penalty')}</button>
        </div>
      </div>
      {fixing && <FixDay uid={uid} name={name} r={fixing} onClose={() => setFixing(null)} />}
    </Sheet>
  )
}

function FixDay({ uid, name, r, onClose }: { uid: string; name: string; r: DayResult; onClose: () => void }) {
  const [inT, setIn] = useState(r.day?.in ? clockOf(r.day.in) : '')
  const [outT, setOut] = useState(r.day?.out ? clockOf(r.day.out) : '')
  const [excused, setExcused] = useState(Boolean(r.day?.excused))
  const [note, setNote] = useState(r.day?.note ?? '')
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    const inMs = inT ? cairoMs(r.date, inT) : null
    let outMs = outT ? cairoMs(r.date, outT) : null
    if (inMs && outMs && outMs <= inMs) outMs += 86400_000
    try {
      await hr.fixDay(uid, r.date, { in: inMs, out: outMs, excused, note })
      track('hr', 'hr.fixed', { what: name, note: `${r.date}: ${inT || '—'} → ${outT || '—'}${excused ? ' · excused' : ''}${note.trim() ? ` · ${note.trim()}` : ''}`, ref: uid })
      onClose()
    } catch (e) { refused(e) }
    setBusy(false)
  }
  return (
    <Sheet title={`${name} · ${dayLabel(r.date)}`} onClose={onClose} footer={<button className="btn btn-primary" disabled={busy} onClick={save}>{t('Save')}</button>}>
      <div className="form">
        <p className="hint" dir="ltr">{t('Shift')}: {shiftText(r.shift)}</p>
        <label><span>{t('Clock in')}</span><input type="time" value={inT} onChange={(e) => setIn(e.target.value)} /></label>
        <label><span>{t('Clock out')}</span><input type="time" value={outT} onChange={(e) => setOut(e.target.value)} /></label>
        <label className="check"><input type="checkbox" checked={excused} onChange={(e) => setExcused(e.target.checked)} /><span>{t('Excused: do not count late, early or absent for this day')}</span></label>
        <label><span>{t('Note')}</span><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></label>
        <p className="hint">{t('Use this when someone forgot to clock out, or their phone could not find the shop. The day shows "Fixed by hand" with your name.')}</p>
      </div>
    </Sheet>
  )
}

// ---------- Shop location ----------

function Setup({ settings, onSaved }: { settings: HrSettings; onSaved: (s: HrSettings) => void }) {
  const [s, setS] = useState(settings)
  const [busy, setBusy] = useState<number | 'save' | null>(null)
  const put = (i: number, patch: Partial<Place>) => setS({ ...s, places: s.places.map((p, j) => (j === i ? { ...p, ...patch } : p)) })
  async function here(i: number) {
    setBusy(i)
    try {
      const pos = await locate()
      const { latitude: lat, longitude: lng, accuracy } = pos.coords
      put(i, { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), kx: metersPerLng(lat) })
      showToast(tn('Location taken (±%a m). Save to keep it.', { a: Math.round(accuracy) }))
    } catch (e) { showToast(locateError(e)) }
    setBusy(null)
  }
  async function save() {
    const places = s.places.map((p) => ({ name: p.name.trim().slice(0, 80) || t('Shop'), lat: p.lat, lng: p.lng, radius: Math.max(20, Math.min(2000, Math.round(p.radius) || 100)), kx: metersPerLng(p.lat) }))
    if (places.some((p) => !p.lat && !p.lng)) return showToast(t('Set each place\'s location first: stand in the shop and tap Use my location.'))
    const next = { ...s, places, maxAcc: Math.max(10, Math.min(2000, Math.round(s.maxAcc) || 100)), grace: Math.max(0, Math.min(180, Math.round(s.grace) || 0)) }
    setBusy('save')
    try {
      await hr.saveSettings(next)
      track('hr', 'hr.settings', { what: places.map((p) => `${p.name} (${p.radius} m)`).join(', '), note: `±${next.maxAcc} m · grace ${next.grace} min · in ${windowText(next.inFrom, next.inTo) || 'any time'} · out ${windowText(next.outFrom, next.outTo) || 'any time'}` })
      onSaved(next)
      setS(next)
      showToast(t('Saved.'))
    } catch (e) { refused(e) }
    setBusy(null)
  }
  return (
    <div className="hr-setup">
      <section className="form">
        <h3>{t('Where people can clock in')}</h3>
        {s.places.length === 0 && <p className="hint">{t('Add the shop, stand inside it and tap Use my location. Add more places if you have a second branch or a store room.')}</p>}
        {s.places.map((p, i) => (
          <div key={i} className="hr-place">
            <label><span>{t('Name')}</span><input value={p.name} onChange={(e) => put(i, { name: e.target.value })} /></label>
            <label><span>{t('Radius (meters)')}</span><input type="number" min="20" max="2000" value={p.radius} onChange={(e) => put(i, { radius: Number(e.target.value) })} /></label>
            <div className="hr-place-loc">
              <span className="muted small" dir="ltr">{p.lat || p.lng ? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : t('No location yet')}</span>
              <button className="btn btn-small" onClick={() => here(i)} disabled={busy !== null}><Icon name="globe" size={16} />{busy === i ? t('Finding…') : t('Use my location')}</button>
              {(p.lat || p.lng) ? <a className="btn btn-small btn-ghost" href={mapLink(p.lat, p.lng)} target="_blank" rel="noreferrer">{t('See on map')}</a> : null}
              <button className="icon-btn" onClick={() => setS({ ...s, places: s.places.filter((_, j) => j !== i) })} aria-label={t('Remove')}><Icon name="trash" size={18} /></button>
            </div>
          </div>
        ))}
        {s.places.length < 10 && <button className="btn" onClick={() => setS({ ...s, places: [...s.places, { name: s.places.length ? '' : 'Static', lat: 0, lng: 0, radius: 100, kx: 0 }] })}><Icon name="plus" size={18} />{t('Add a place')}</button>}
        <label><span>{t('Least accuracy a phone must have (meters)')}</span><input type="number" min="10" max="2000" value={s.maxAcc} onChange={(e) => setS({ ...s, maxAcc: Number(e.target.value) })} /></label>
        <h3>{t('Clock-in and clock-out hours')}</h3>
        <p className="hint">{t('Outside these hours the button does not work. Inside them, people who open Static OS are asked to clock in (or out). Leave both empty for any time.')}</p>
        <div className="hr-hours">
          <span>{t('Clock in')}</span>
          <input type="time" value={s.inFrom} onChange={(e) => setS({ ...s, inFrom: e.target.value })} aria-label={t('Clock in from')} />
          <span>–</span>
          <input type="time" value={s.inTo} onChange={(e) => setS({ ...s, inTo: e.target.value })} aria-label={t('Clock in until')} />
          <span>{t('Clock out')}</span>
          <input type="time" value={s.outFrom} onChange={(e) => setS({ ...s, outFrom: e.target.value })} aria-label={t('Clock out from')} />
          <span>–</span>
          <input type="time" value={s.outTo} onChange={(e) => setS({ ...s, outTo: e.target.value })} aria-label={t('Clock out until')} />
        </div>
        <label><span>{t('Grace minutes before someone counts as late')}</span><input type="number" min="0" max="180" value={s.grace} onChange={(e) => setS({ ...s, grace: Number(e.target.value) })} /></label>
        <button className="btn btn-primary" onClick={save} disabled={busy !== null}>{t('Save')}</button>
      </section>
      <section className="hr-safety">
        <h3><Icon name="shield" size={18} /> {t('How clocking in is protected')}</h3>
        <ul>
          <li>{t('The time is the server\'s time, not the phone\'s, so changing the phone clock does nothing.')}</li>
          <li>{t('The database itself checks that the location is inside a place above and accurate enough. Changing the app cannot get around it.')}</li>
          <li>{t('Each clock-in keeps where it was made (open it on the map from Today) and from which phone. Someone who uses more than one phone in a month is marked.')}</li>
          <li>{t('Nobody can change their own times or remove a penalty. Only Manage HR can fix a day, and the day then shows it was fixed by hand.')}</li>
        </ul>
        <p className="hint">{t('Limit: a phone can be told a fake location (fake GPS apps, developer tools). That is true for every app that uses the phone\'s location. If it becomes a problem, the next step is a code shown on a screen in the shop that people scan to clock in.')}</p>
      </section>
    </div>
  )
}
