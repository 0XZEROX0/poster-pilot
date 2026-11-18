import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { track } from '../data/activity'
import { addDays, cairoNow } from '../data/logic'
import { allowed } from '../data/store'
import {
  addMonths, cairoMs, checkSpot, clockOf, clockOpen, windowText, DAY_NAMES, DEFAULT_SETTINGS, deviceId, devicesOf, hm, hr, judgeDay, judgeMonth, metersPerLng, monthOf, myUid, openDay, giveTemplate, shiftOn, templateOf, weeklyOff, withWeeklyOff, UNITS, WEEK, weekdayOf, withDate, withPlan,
  type DayResult, type DayState, type HrSettings, type Month, type Person, type Place, type Shift, type Shifts, type Template, type Totals, type Unit,
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
      {section === 'shifts' && <ShiftsBoard shifts={shifts} people={people} onSaved={(changed) => setShifts({ ...shifts, ...changed })} />}
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
      <div className="tile tile-good"><b>{hm(totals.workedMin)}</b><span>{tn('Worked · of %s in shifts', { s: hm(totals.shiftMin) })}</span></div>
      <div className={`tile ${totals.missingMin ? 'tile-bad' : 'tile-zero'}`}><b>{hm(totals.missingMin)}</b><span>{totals.excusedMin ? tn('Missing (late, early, absent) · %e excused', { e: hm(totals.excusedMin) }) : t('Missing (late, early, absent)')}</span></div>
      <div className={`tile ${totals.lateDays ? 'tile-bad' : 'tile-zero'}`}><b>{totals.lateDays}</b><span>{tn('Late days · %m', { m: hm(totals.lateMin) })}</span></div>
      <div className={`tile ${totals.earlyDays || totals.absent ? 'tile-warn' : 'tile-zero'}`}><b>{totals.earlyDays}</b><span>{tn('Left early · %a absent', { a: totals.absent })}</span></div>
    </div>
  )
}

/** A late or early chip: red when it counts, crossed out and green when it was excused. */
function MinChip({ raw, counted, label, tone }: { raw: number; counted: number; label: string; tone: string }) {
  if (!raw) return null
  return counted ? <span className={`chip ${tone}`}>{tn(label, { m: hm(raw) })}</span> : <span className="chip chip-good"><s>{tn(label, { m: hm(raw) })}</s> · {t('excused')}</span>
}

function MonthDays({ days, onFix, onExcuse }: { days: DayResult[]; onFix?: (r: DayResult) => void; onExcuse?: (r: DayResult) => void }) {
  const desktop = useDesktop()
  const list = [...days].reverse().filter((r) => r.state !== 'off' || r.day)
  if (!list.length) return <Empty icon="calendar" text={t('Nothing this month yet.')} />
  const canExcuse = (r: DayResult) => Boolean(onExcuse && (r.rawLate || r.rawEarly))
  const reason = (r: DayResult) => [r.day?.why, r.day?.note].filter(Boolean).join(' · ')
  if (desktop) {
    return (
      <div className="hr-week-wrap">
        <table className="hr-report hr-att">
          <thead><tr><th>{t('Day')}</th><th>{t('Shift')}</th><th>{t('In')}</th><th>{t('Out')}</th><th>{t('Worked')}</th><th>{t('Late')}</th><th>{t('Left early')}</th><th>{t('Missing')}</th><th>{t('Reason / note')}</th>{(onFix || onExcuse) && <th />}</tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.date} className={r.state === 'absent' ? 'absent' : ''}>
                <th>{dayLabel(r.date)}</th>
                <td className="muted" dir="ltr">{shiftText(r.shift)}</td>
                <td dir="ltr">{r.day?.in ? clockOf(r.day.in) : r.state === 'absent' ? <span className="chip chip-bad">{t('Absent')}</span> : '—'}</td>
                <td dir="ltr">{r.day?.out ? clockOf(r.day.out) : r.state === 'noOut' ? <span className="chip chip-warn">{t('No clock-out')}</span> : r.state === 'working' ? <span className="chip chip-info">{t('Working')}</span> : '—'}</td>
                <td>{r.worked ? hm(r.worked) : '—'}</td>
                <td><MinChip raw={r.rawLate} counted={r.late} label="%m" tone="chip-bad" />{!r.rawLate && '—'}</td>
                <td><MinChip raw={r.rawEarly} counted={r.early} label="%m" tone="chip-warn" />{!r.rawEarly && '—'}</td>
                <td className={r.missing ? 'bad' : ''}>{r.missing ? hm(r.missing) : '—'}</td>
                <td className="hr-why" dir="auto">{r.day?.excused && <span className="chip chip-good">{t('Excused day')}</span>} {reason(r)}{r.day?.fixBy && <small className="muted"> · {tn('fixed by %n', { n: r.day.fixBy })}</small>}</td>
                {(onFix || onExcuse) && (
                  <td><div className="hr-acts">
                    {canExcuse(r) && <button className="btn btn-small" onClick={() => onExcuse!(r)}>{t('Excuse')}</button>}
                    {onFix && <button className="btn btn-small btn-ghost" onClick={() => onFix(r)}><Icon name="edit" size={16} />{t('Fix')}</button>}
                  </div></td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  return (
    <div className="hr-days">
      {list.map((r) => (
        <div key={r.date} className="hr-day">
          <span className="hr-day-date">{dayLabel(r.date)}</span>
          <span className="hr-day-shift muted" dir="ltr">{shiftText(r.shift)}</span>
          <span className="hr-day-times" dir="ltr">{r.day?.in ? clockOf(r.day.in) : '—'} → {r.day?.out ? clockOf(r.day.out) : '—'}{r.worked ? <small className="muted"> · {hm(r.worked)}</small> : null}</span>
          <span className="hr-day-chips">
            {r.state !== 'done' && <span className={`chip ${STATE_TONE[r.state]}`}>{t(STATE_LABEL[r.state])}</span>}
            <MinChip raw={r.rawLate} counted={r.late} label="%m late" tone="chip-bad" />
            <MinChip raw={r.rawEarly} counted={r.early} label="%m early" tone="chip-warn" />
            {r.day?.excused && <span className="chip chip-good">{t('Excused day')}</span>}
            {r.day?.fixBy && <span className="chip">{t('Fixed by hand')}</span>}
          </span>
          {reason(r) && <span className="hr-day-why" dir="auto">{reason(r)}</span>}
          {(onFix || onExcuse) && (
            <span className="hr-day-acts">
              {canExcuse(r) && <button className="btn btn-small" onClick={() => onExcuse!(r)}>{t('Excuse')}</button>}
              {onFix && <button className="btn btn-small btn-ghost" onClick={() => onFix(r)}><Icon name="edit" size={16} />{t('Fix')}</button>}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

/** Excuse a late arrival or an early leave, with the reason. It then stops counting, and the reason stays in the table. */
function ExcuseDay({ uid, name, r, onClose }: { uid: string; name: string; r: DayResult; onClose: () => void }) {
  const [late, setLate] = useState(r.rawLate > 0)
  const [early, setEarly] = useState(r.rawEarly > 0)
  const [why, setWhy] = useState(r.day?.why ?? '')
  const [busy, setBusy] = useState(false)
  async function save(excuse: boolean) {
    if (excuse && !why.trim()) return showToast(t('Type the reason.'))
    setBusy(true)
    try {
      const fix = excuse ? { exLate: late && r.rawLate > 0, exEarly: early && r.rawEarly > 0, why } : { exLate: false, exEarly: false, why: '' }
      await hr.fixDay(uid, r.date, fix)
      track('hr', 'hr.fixed', { what: name, note: `${r.date}: ${excuse ? `excused ${[fix.exLate && `${hm(r.rawLate)} late`, fix.exEarly && `${hm(r.rawEarly)} early`].filter(Boolean).join(' + ')} · ${why.trim()}` : 'excuse taken back'}`, ref: uid })
      onClose()
    } catch (e) { refused(e) }
    setBusy(false)
  }
  const had = Boolean(r.day?.exLate || r.day?.exEarly)
  return (
    <Sheet title={`${t('Excuse')} · ${name} · ${dayLabel(r.date)}`} onClose={onClose} footer={<>
      {had && <button className="btn btn-ghost" disabled={busy} onClick={() => save(false)}>{t('Take the excuse back')}</button>}
      <button className="btn btn-primary" disabled={busy} onClick={() => save(true)}>{t('Excuse')}</button>
    </>}>
      <div className="form">
        <p className="hint" dir="ltr">{t('Shift')}: {shiftText(r.shift)} · {r.day?.in ? clockOf(r.day.in) : '—'} → {r.day?.out ? clockOf(r.day.out) : '—'}</p>
        {r.rawLate > 0 && <label className="check"><input type="checkbox" checked={late} onChange={(e) => setLate(e.target.checked)} /><span>{tn('Excuse coming %m late', { m: hm(r.rawLate) })}</span></label>}
        {r.rawEarly > 0 && <label className="check"><input type="checkbox" checked={early} onChange={(e) => setEarly(e.target.checked)} /><span>{tn('Excuse leaving %m early', { m: hm(r.rawEarly) })}</span></label>}
        <label><span>{t('Reason (they see it)')}</span><input value={why} onChange={(e) => setWhy(e.target.value)} maxLength={500} placeholder={t('For example: family emergency, asked by the manager')} autoFocus /></label>
        <p className="hint">{t('Excused minutes stop counting as late, early or missing. The reason stays next to the day.')}</p>
      </div>
    </Sheet>
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

const offText = (off: number[]) => (off.length ? tn('%d off', { d: off.map((d) => t(DAY_NAMES[d])).join(', ') }) : t('No day off'))

function ShiftsBoard({ shifts, people, onSaved }: { shifts: Shifts; people: { uid: string; name: string }[]; onSaved: (all: Shifts) => void }) {
  const today = cairoNow().date
  // The week starts on Saturday.
  const [start, setStart] = useState(() => addDays(today, -((weekdayOf(today) + 1) % 7)))
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const [editing, setEditing] = useState<{ uid: string; name: string } | null>(null)
  const [adding, setAdding] = useState('')
  const [templates, setTemplates] = useState<Template[] | null>(null)
  const [tpEdit, setTpEdit] = useState<Template | null>(null)
  const [giving, setGiving] = useState<string | null>(null)
  const [offFor, setOffFor] = useState<{ uid: string; name: string } | null | 'pick'>(null)
  useEffect(() => { hr.loadTemplates().then(setTemplates, () => setTemplates([])) }, [])
  const list = Object.entries(shifts).map(([uid, p]) => ({ uid, name: p.name, p })).sort((a, b) => a.name.localeCompare(b.name))
  const others = people.filter((x) => !shifts[x.uid])
  const everyone = [...list.map(({ uid, name }) => ({ uid, name })), ...others].sort((a, b) => a.name.localeCompare(b.name))
  return (
    <>
      <div className="hr-templates">
        <h3>{t('Shift templates')}</h3>
        <div className="hr-tp-list">
          {templates === null ? <span className="muted">{t('Loading…')}</span> : templates.map((tp) => (
            <div key={tp.id} className="hr-tp">
              <button className="hr-tp-main" onClick={() => setGiving(tp.id)}>
                <b dir="auto">{tp.name}</b>
                <span dir="ltr">{tp.s} – {tp.e}</span>
              </button>
              <button className="icon-btn" onClick={() => setTpEdit(tp)} aria-label={t('Edit')}><Icon name="edit" size={16} /></button>
            </div>
          ))}
          {templates && templates.length < 20 && <button className="btn btn-small" onClick={() => setTpEdit({ id: '', name: '', s: '12:00', e: '20:00' })}><Icon name="plus" size={16} />{t('New template')}</button>}
        </div>
        {templates && templates.length > 0 && <p className="hint">{t('Tap a template to give it to people. Each person keeps their own days off.')}</p>}
      </div>
      <div className="hr-week-nav">
        <button className="icon-btn" onClick={() => setStart(addDays(start, -7))} aria-label={t('Previous week')}><Icon name="left" /></button>
        <b>{dayLabel(dates[0])} – {dayLabel(dates[6])}</b>
        <button className="icon-btn" onClick={() => setStart(addDays(start, 7))} aria-label={t('Next week')}><Icon name="right" /></button>
        <button className="btn btn-small" onClick={() => setOffFor('pick')} disabled={!everyone.length}><Icon name="calendar" size={16} />{t('Days off')}</button>
        {others.length > 0 && (
          <select className="hr-add" value={adding} onChange={(e) => { const x = others.find((o) => o.uid === e.target.value); if (x) setEditing(x); setAdding('') }}>
            <option value="">{t('+ Add a person')}</option>
            {others.map((o) => <option key={o.uid} value={o.uid}>{o.name}</option>)}
          </select>
        )}
      </div>
      {list.length === 0 ? <Empty icon="calendar" text={t('Nobody has shifts yet. Make a template and give it to people, or add a person.')} /> : (
        <div className="hr-week-wrap">
          <table className="hr-week">
            <thead>
              <tr><th />{dates.map((d) => <th key={d} className={d === today ? 'today' : ''}>{dayLabel(d)}</th>)}</tr>
            </thead>
            <tbody>
              {list.map(({ uid, name, p }) => {
                const tp = templates ? templateOf(p, templates, dates[0] < today ? today : dates[0]) : undefined
                return (
                  <tr key={uid} onClick={() => setEditing({ uid, name })}>
                    <th><span className="hr-who"><Avatar uid={uid} name={name} size={28} /><span><span dir="auto">{name}</span>{tp && <small className="hr-tp-tag" dir="auto">{tp.name}</small>}</span></span></th>
                    {dates.map((d) => {
                      const s = shiftOn(p, d)
                      return <td key={d} className={`${s ? '' : 'off'}${d in p.dates ? ' changed' : ''}${d === today ? ' today' : ''}`} dir="ltr">{s ? <>{s.s}<br />{s.e}</> : t('Off')}</td>
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint">{t('Tap a person to change their week or one day. A dotted cell is a one-day change.')}</p>
      {editing && <ShiftEditor templates={templates ?? []} uid={editing.uid} person={shifts[editing.uid] ?? { name: editing.name, plans: [], dates: {} }} onClose={() => setEditing(null)} onSaved={(p) => { onSaved({ [editing.uid]: p }); setEditing(null) }} />}
      {offFor && <DaysOff everyone={everyone} shifts={shifts} first={offFor === 'pick' ? undefined : offFor.uid} onClose={() => setOffFor(null)} onSaved={onSaved} />}
      {tpEdit && templates && <TemplateEditor tp={tpEdit} list={templates} onClose={() => setTpEdit(null)} onSaved={(l) => { setTemplates(l); setTpEdit(null) }} />}
      {giving && templates?.find((x) => x.id === giving) && (
        <GiveShift tp={templates.find((x) => x.id === giving)!} shifts={shifts} everyone={everyone} onClose={() => setGiving(null)} onSaved={(changed) => { onSaved(changed); setGiving(null) }} />
      )}
    </>
  )
}

/** Days off, apart from the hours: each person's weekly days off, and single days off HR gives. */
function DaysOff({ everyone, shifts, first, onClose, onSaved }: { everyone: { uid: string; name: string }[]; shifts: Shifts; first?: string; onClose: () => void; onSaved: (changed: Shifts) => void }) {
  const today = cairoNow().date
  const [uid, setUid] = useState(first ?? everyone[0]?.uid ?? '')
  const name = everyone.find((x) => x.uid === uid)?.name ?? shifts[uid]?.name ?? ''
  const person: Person = shifts[uid] ?? { name, plans: [], dates: {} }
  const [weekFrom, setWeekFrom] = useState(today)
  const [off, setOff] = useState<number[]>(() => (shifts[uid] ? weeklyOff(shifts[uid], today) : [5]))
  const [day, setDay] = useState({ from: addDays(today, 1), to: '' })
  const [busy, setBusy] = useState(false)
  useEffect(() => { setOff(shifts[uid] ? weeklyOff(shifts[uid], weekFrom) : [5]) }, [uid, weekFrom, shifts])
  async function save(next: Person, note: string) {
    setBusy(true)
    try {
      await hr.savePerson(uid, next)
      track('hr', 'hr.shifts', { what: name, note, ref: uid })
      onSaved({ [uid]: next })
      showToast(t('Saved.'))
    } catch (e) { refused(e) }
    setBusy(false)
  }
  function giveDays() {
    const to = day.to && day.to >= day.from ? day.to : day.from
    let p = person
    let n = 0
    for (let d = day.from; d <= to && n < 62; d = addDays(d, 1), n++) p = withDate(p, d, null)
    save(p, `day off ${day.from}${to !== day.from ? ` → ${to}` : ''}`)
  }
  const singles = Object.entries(person.dates).filter(([d, x]) => x === null && d >= today).map(([d]) => d).sort()
  return (
    <Sheet title={t('Days off')} onClose={onClose}>
      <div className="form">
        <label><span>{t('Person')}</span>
          <select value={uid} onChange={(e) => setUid(e.target.value)}>{everyone.map((x) => <option key={x.uid} value={x.uid}>{x.name}</option>)}</select>
        </label>
        <section className="hr-off-box">
          <h3>{t('Weekly days off')}</h3>
          <div className="hr-off-days">
            {WEEK.map((d) => (
              <label key={d} className={`hr-off-day${off.includes(d) ? ' on' : ''}`}>
                <input type="checkbox" checked={off.includes(d)} onChange={(e) => setOff(e.target.checked ? [...off, d].sort() : off.filter((o) => o !== d))} />
                {t(DAY_NAMES[d])}
              </label>
            ))}
          </div>
          <div className="hr-one">
            <label><span>{t('Starting from')}</span><input type="date" value={weekFrom} onChange={(e) => setWeekFrom(e.target.value)} /></label>
          </div>
          <p className="hint">{shifts[uid] ? t('Their hours stay as they are. Only these days become days off.') : t('They have no shifts yet. Give them a template first, or they get 11:00 – 19:00.')}</p>
          <button className="btn btn-primary" disabled={busy || !uid} onClick={() => save(withWeeklyOff(person, weekFrom, off), `weekly days off from ${weekFrom}: ${off.map((d) => DAY_NAMES[d]).join(', ') || 'none'}`)}>{t('Save weekly days off')}</button>
        </section>
        <section className="hr-off-box">
          <h3>{t('A day off (or a few)')}</h3>
          <div className="hr-one">
            <label><span>{t('From')}</span><input type="date" value={day.from} onChange={(e) => setDay({ ...day, from: e.target.value })} /></label>
            <label><span>{t('To (optional)')}</span><input type="date" value={day.to} min={day.from} onChange={(e) => setDay({ ...day, to: e.target.value })} /></label>
          </div>
          <button className="btn" disabled={busy || !uid || !day.from} onClick={giveDays}>{t('Give the day off')}</button>
          {singles.length > 0 && (
            <div className="hr-list">
              {singles.map((d) => (
                <div key={d} className="hr-change">
                  <span>{dayLabel(d)}</span>
                  <button className="btn btn-small btn-ghost" disabled={busy} onClick={() => save(withDate(person, d, undefined), `day off taken back ${d}`)}>{t('Remove')}</button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Sheet>
  )
}

function TemplateEditor({ tp, list, onClose, onSaved }: { tp: Template; list: Template[]; onClose: () => void; onSaved: (l: Template[]) => void }) {
  const [x, setX] = useState(tp)
  const [busy, setBusy] = useState(false)
  async function save(next: Template[], note: string) {
    setBusy(true)
    try {
      await hr.saveTemplates(next)
      track('hr', 'hr.shifts', { what: t('Shift templates'), note })
      onSaved(next)
    } catch (e) { refused(e) }
    setBusy(false)
  }
  function ok() {
    if (!x.name.trim()) return showToast(t('Type a name.'))
    if (!x.s || !x.e || x.s === x.e) return showToast(t('Set the start and the end.'))
    const item = { ...x, name: x.name.trim(), id: x.id || Math.random().toString(36).slice(2, 10) }
    save(x.id ? list.map((o) => (o.id === x.id ? item : o)) : [...list, item], `${item.name} ${item.s}–${item.e}`)
  }
  return (
    <Sheet title={x.id ? t('Edit template') : t('New template')} onClose={onClose} footer={<>
      {x.id && <button className="btn btn-ghost" disabled={busy} onClick={() => confirm(t('Delete this template? People keep the shifts they already have.')) && save(list.filter((o) => o.id !== x.id), `deleted ${x.name}`)}>{t('Delete')}</button>}
      <button className="btn btn-primary" disabled={busy} onClick={ok}>{t('Save')}</button>
    </>}>
      <div className="form">
        <label><span>{t('Name')}</span><input value={x.name} maxLength={60} onChange={(e) => setX({ ...x, name: e.target.value })} placeholder={t('For example: Morning')} autoFocus /></label>
        <div className="hr-one">
          <label><span>{t('Starts')}</span><input type="time" value={x.s} onChange={(e) => setX({ ...x, s: e.target.value })} /></label>
          <label><span>{t('Ends')}</span><input type="time" value={x.e} onChange={(e) => setX({ ...x, e: e.target.value })} /></label>
        </div>
        <p className="hint">{t('An end before the start ends the next day (a night shift).')}</p>
      </div>
    </Sheet>
  )
}

/** Gives one template to several people from a date on. Their weeks before that date stay as they were. */
function GiveShift({ tp, shifts, everyone, onClose, onSaved }: { tp: Template; shifts: Shifts; everyone: { uid: string; name: string }[]; onClose: () => void; onSaved: (changed: Shifts) => void }) {
  const today = cairoNow().date
  const [from, setFrom] = useState(today)
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  async function save() {
    if (!picked.length) return showToast(t('Pick at least one person.'))
    setBusy(true)
    try {
      const changed: Shifts = Object.fromEntries(picked.map((uid) => {
        const p = shifts[uid] ?? { name: everyone.find((x) => x.uid === uid)?.name ?? '', plans: [], dates: {} }
        return [uid, giveTemplate(p, tp, from)]
      }))
      await hr.savePeople(changed)
      track('hr', 'hr.shifts', { what: tp.name, note: `${tp.s}–${tp.e} from ${from}: ${picked.map((uid) => changed[uid].name).join(', ')}` })
      onSaved(changed)
    } catch (e) { refused(e) }
    setBusy(false)
  }
  return (
    <Sheet title={tn('Give %n', { n: tp.name })} onClose={onClose} footer={<button className="btn btn-primary" disabled={busy || !picked.length} onClick={save}>{tn('Give to %n people', { n: picked.length })}</button>}>
      <div className="form">
        <p className="hint" dir="ltr">{tp.s} – {tp.e}</p>
        <label><span>{t('Starting from')}</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <div className="hr-pick-head">
          <span className="label">{t('People')}</span>
          <button className="btn btn-small btn-ghost" onClick={() => setPicked(picked.length === everyone.length ? [] : everyone.map((x) => x.uid))}>{picked.length === everyone.length ? t('Clear') : t('Pick everyone')}</button>
        </div>
        <div className="hr-pick">
          {everyone.map((x) => (
            <label key={x.uid} className="hr-pick-row">
              <input type="checkbox" checked={picked.includes(x.uid)} onChange={(e) => setPicked(e.target.checked ? [...picked, x.uid] : picked.filter((u) => u !== x.uid))} />
              <Avatar uid={x.uid} name={x.name} size={28} />
              <span dir="auto">{x.name}</span>
              <small className="muted">{shifts[x.uid] ? offText(weeklyOff(shifts[x.uid], from)) : t('New · Friday off')}</small>
            </label>
          ))}
        </div>
        <p className="hint">{t('Everyone keeps their own weekly days off. Days before the start date keep their old shifts.')}</p>
      </div>
    </Sheet>
  )
}

/** The choice a shift is: a day off, one of the templates, or hours typed by hand. */
function ShiftPick({ value, templates, custom, onChange, label }: { value: Shift; templates: Template[]; custom: boolean; onChange: (v: Shift, custom: boolean) => void; label: string }) {
  const tp = value && !custom ? templates.find((x) => x.s === value.s && x.e === value.e) : undefined
  const key = !value ? 'off' : tp ? tp.id : 'custom'
  return (
    <span className="hr-pick-shift">
      <select value={key} aria-label={label} onChange={(e) => {
        const v = e.target.value
        if (v === 'off') return onChange(null, false)
        if (v === 'custom') return onChange(value ?? { s: '11:00', e: '19:00' }, true)
        const x = templates.find((o) => o.id === v)
        if (x) onChange({ s: x.s, e: x.e }, false)
      }}>
        <option value="off">{t('Day off')}</option>
        {templates.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.s} – {x.e}</option>)}
        <option value="custom">{t('Other hours…')}</option>
      </select>
      {value && key === 'custom' && (
        <span className="hr-times">
          <input type="time" value={value.s} onChange={(e) => onChange({ ...value, s: e.target.value }, true)} aria-label={t('Starts')} />
          <span>–</span>
          <input type="time" value={value.e} onChange={(e) => onChange({ ...value, e: e.target.value }, true)} aria-label={t('Ends')} />
        </span>
      )}
    </span>
  )
}

function ShiftEditor({ uid, person, templates, onClose, onSaved }: { uid: string; person: Person; templates: Template[]; onClose: () => void; onSaved: (p: Person) => void }) {
  const today = cairoNow().date
  const current = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), shiftOn({ ...person, dates: {} }, addDays(today, (d - weekdayOf(today) + 7) % 7))]))
  const [days, setDays] = useState<Record<string, Shift>>(() => (person.plans.length ? current : Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), d === 5 ? null : { s: '11:00', e: '19:00' }]))))
  const [from, setFrom] = useState(today)
  const [oneDate, setOneDate] = useState(addDays(today, 1))
  const [oneOff, setOneOff] = useState(true)
  const [one, setOne] = useState({ s: '11:00', e: '19:00' })
  const [p, setP] = useState(person)
  const [busy, setBusy] = useState(false)
  const [customDays, setCustomDays] = useState<number[]>([])
  const [oneCustom, setOneCustom] = useState(false)
  const set = (d: number, s: Shift, custom: boolean) => {
    setDays({ ...days, [String(d)]: s })
    setCustomDays(custom ? [...customDays.filter((x) => x !== d), d] : customDays.filter((x) => x !== d))
  }

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
        {WEEK.map((d) => (
          <div key={d} className="hr-edit-day">
            <b className="hr-edit-name">{t(DAY_NAMES[d])}</b>
            <ShiftPick value={days[String(d)]} templates={templates} custom={customDays.includes(d)} label={t(DAY_NAMES[d])} onChange={(v, c) => set(d, v, c)} />
          </div>
        ))}
        <label><span>{t('These shifts start on')}</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value || today)} /></label>
        <p className="hint">{t('Days before this date keep the shifts they had, so past late minutes do not change. An end before the start means the shift ends the next morning.')}</p>
        <button className="btn btn-primary" disabled={busy} onClick={async () => { if (await save(withPlan(p, { from, days }), `${t('Weekly shifts')} ${from}`)) onSaved(withPlan(p, { from, days })) }}>{t('Save weekly shifts')}</button>

        <h3>{t('One-day change')}</h3>
        <p className="hint">{t('A day off, a holiday, or different hours on one date. It wins over the weekly shifts.')}</p>
        <div className="hr-one">
          <input type="date" value={oneDate} onChange={(e) => setOneDate(e.target.value)} aria-label={t('Date')} />
          <ShiftPick value={oneOff ? null : one} templates={templates} custom={oneCustom} label={t('One-day change')} onChange={(v, c) => { setOneOff(!v); if (v) setOne(v); setOneCustom(c) }} />
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
    const head = ['Name', 'Shift days', 'Present', 'Absent', 'Late days', 'Late minutes', 'Left early days', 'Early minutes', 'No clock-out', 'Hours worked', 'Hours missing', 'Hours excused', 'Penalty EGP', 'Penalty hours', 'Penalty days']
    const lines = rows.map((r) => [r.name, r.totals.scheduled, r.totals.present, r.totals.absent, r.totals.lateDays, r.totals.lateMin, r.totals.earlyDays, r.totals.earlyMin, r.totals.noOut, (r.totals.workedMin / 60).toFixed(1), (r.totals.missingMin / 60).toFixed(1), (r.totals.excusedMin / 60).toFixed(1), r.totals.pens.EGP, r.totals.pens.hours, r.totals.pens.days])
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
      <thead><tr><th>{t('Name')}</th><th>{t('Present')}</th><th>{t('Absent')}</th><th>{t('Late')}</th><th>{t('Left early')}</th><th>{t('No clock-out')}</th><th>{t('Worked')}</th><th>{t('Missing')}</th><th>{t('Excused')}</th><th>{t('Penalties')}</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.uid} onClick={onOpen && (() => onOpen(r.uid))}>
            <th><span className="hr-who">{onOpen && <Avatar uid={r.uid} name={r.name} size={28} />}<span dir="auto">{r.name}</span></span></th>
            <td>{r.totals.present} / {r.totals.scheduled}</td>
            <td className={r.totals.absent ? 'bad' : ''}>{r.totals.absent}</td>
            <td className={r.totals.lateDays ? 'bad' : ''}>{r.totals.lateDays} · {hm(r.totals.lateMin)}</td>
            <td className={r.totals.earlyDays ? 'warn' : ''}>{r.totals.earlyDays} · {hm(r.totals.earlyMin)}</td>
            <td>{r.totals.noOut}</td>
            <td>{hm(r.totals.workedMin)}</td>
            <td className={r.totals.missingMin ? 'bad' : ''}>{r.totals.missingMin ? hm(r.totals.missingMin) : '—'}</td>
            <td>{r.totals.excusedMin ? hm(r.totals.excusedMin) : '—'}</td>
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
  const [excusing, setExcusing] = useState<DayResult | null>(null)
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
    <Sheet wide title={`${name} · ${monthLabel(month)}`} onClose={onClose}>
      <div className="hr-me">
        <TotalsTiles totals={totals} />
        <MonthDays days={days} onFix={setFixing} onExcuse={setExcusing} />
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
      {excusing && <ExcuseDay uid={uid} name={name} r={excusing} onClose={() => setExcusing(null)} />}
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
        <label className="check-line"><input type="checkbox" checked={excused} onChange={(e) => setExcused(e.target.checked)} /><span>{t('Excused: do not count late, early or absent for this day')}</span></label>
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
