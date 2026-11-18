import { useEffect, useState } from 'react'
import { cairoNow } from '../data/logic'
import { clock12, h12, hr, myUid, openDay, promptFor, shiftOn, type HrSettings, type Month, type Shifts } from '../data/hr'
import { t, tn } from '../i18n'
import { LeaveWhy, punchNow, type PunchResult } from './HrView'
import { Icon } from './ui'

const KEY = 'posterpilot.clockPrompt'
const dismissed = (key: string) => { try { return localStorage.getItem(KEY) === key } catch { return false } }
const dismiss = (key: string) => { try { localStorage.setItem(KEY, key) } catch { /* asked again next time */ } }

/**
 * When someone with a shift today opens Static OS inside the clock-in hours and has not clocked in, the app
 * asks them to. Same for clocking out inside the clock-out hours. "Not now" stops asking for the rest of that day.
 * Costs three reads when the app opens (settings, shifts, the person's month), none if HR has no hours set.
 */
export function ClockPrompt() {
  const [settings, setSettings] = useState<HrSettings | null>(null)
  const [shifts, setShifts] = useState<Shifts | null>(null)
  const [mine, setMine] = useState<Month | undefined | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<PunchResult | null>(null)
  const [why, setWhy] = useState('')
  const [gone, setGone] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id) }, [])
  const today = cairoNow(new Date(now)).date

  useEffect(() => { hr.loadSettings().then(setSettings, () => setSettings(null)) }, [])
  const hours = Boolean(settings && (settings.inFrom || settings.inTo || settings.outFrom || settings.outTo))
  useEffect(() => { if (hours) hr.loadShifts().then(setShifts, () => setShifts(null)) }, [hours])
  const month = today.slice(0, 7)
  const wanted = hours && shifts !== null && Boolean(shifts[myUid()])
  useEffect(() => (wanted ? hr.watchMine(month, setMine, () => setMine(null)) : undefined), [wanted, month])

  if (!settings || !shifts || mine === null || gone) return null
  const person = shifts[myUid()]
  const kind = promptFor(settings, person, mine, now)
  const key = `${today}:${kind}`
  if (!kind && !msg) return null
  if (kind && dismissed(key) && !msg) return null
  const shift = shiftOn(person, today)
  const day = mine?.days[today.slice(8, 10)]

  async function go() {
    setBusy(true)
    const r = await punchNow(settings!, openDay(mine ?? undefined, today), today, person, why)
    setMsg(r)
    setBusy(false)
    if (!r.bad) setTimeout(() => { setGone(true); setMsg(null) }, 2500)
  }
  const close = () => { if (kind) dismiss(key); setMsg(null); setGone(true) }

  return (
    <div className="sheet-back clock-ask-back" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="clock-ask" role="dialog" aria-modal="true" aria-label={t(kind === 'out' ? 'Clock out' : 'Clock in')}>
        <span className={`clock-ask-icon${kind === 'out' ? ' out' : ''}`}><Icon name="clock" size={30} /></span>
        <h2>{kind === 'out' ? t('Leaving? Clock out first') : t('Good to see you. Clock in?')}</h2>
        <p className="muted" dir="auto">
          {shift ? tn('Your shift today is %s.', { s: `${h12(shift.s)} – ${h12(shift.e)}` }) : null}
          {kind === 'out' && day?.in ? ` ${tn('You clocked in at %t.', { t: clock12(day.in) })}` : null}
        </p>
        {msg && <p className={msg.bad ? 'banner banner-bad' : 'banner'}>{msg.text}</p>}
        {msg?.needWhy && <LeaveWhy why={why} setWhy={setWhy} busy={busy} onGo={go} />}
        {(!msg || (msg.bad && !msg.needWhy)) && (
          <button className={`hr-punch${kind === 'out' ? ' out' : ''}`} onClick={go} disabled={busy}>
            <Icon name="clock" size={24} />{busy ? t('Checking your location…') : t(kind === 'out' ? 'Clock out' : 'Clock in')}
          </button>
        )}
        <button className="btn btn-ghost" onClick={close}>{msg && !msg.bad ? t('Close') : t('Not now')}</button>
      </div>
    </div>
  )
}
