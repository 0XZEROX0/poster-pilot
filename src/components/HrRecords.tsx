import { useEffect, useState } from 'react'
import { track } from '../data/activity'
import { addDays, cairoNow } from '../data/logic'
import { hr, myUid, withDate, type Person, type Shifts } from '../data/hr'
import { annualUsed, leaveDates, staff, tenure, LEAVE_KINDS, NOTE_KINDS, type Leave, type LeaveKind, type NoteKind, type Staff } from '../data/staff'
import { locale, t, tn } from '../i18n'
import { Sheet } from './Sheet'
import { Avatar, Empty, showToast } from './ui'

// HR records: leave requests (everyone who clocks in) and employee files (HR only).

const KIND_LABEL: Record<LeaveKind, string> = { annual: 'Annual leave', sick: 'Sick leave', unpaid: 'Unpaid leave', other: 'Other' }
const STATE_LABEL: Record<Leave['state'], string> = { pending: 'Waiting', ok: 'Accepted', no: 'Declined', cancelled: 'Cancelled' }
const STATE_TONE: Record<Leave['state'], string> = { pending: 'chip-warn', ok: 'chip-good', no: 'chip-bad', cancelled: '' }
const NOTE_LABEL: Record<NoteKind, string> = { note: 'Note', warning: 'Warning', praise: 'Praise' }
const NOTE_TONE: Record<NoteKind, string> = { note: 'chip-info', warning: 'chip-bad', praise: 'chip-good' }

const dayLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const dateLabel = (ms: number) => new Date(ms).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Cairo' })
const range = (l: Pick<Leave, 'from' | 'to'>) => (l.from === l.to ? dayLabel(l.from) : `${dayLabel(l.from)} → ${dayLabel(l.to)}`)
const daysText = (n: number) => (n === 1 ? t('1 day') : tn('%n days', { n }))
const refused = (e: unknown) => {
  console.error(e)
  showToast(/permission/i.test(String(e)) ? t('Your role does not allow this. Make sure the latest rules are published in Firebase.') : t('Could not save. Check the connection and try again.'))
}

/** Requests from this year on: HR sees everyone's, the rest see their own. */
export function useLeaves(manager: boolean, mineToo: boolean): { all: Leave[] | null; mine: Leave[] | null; error: string } {
  const [all, setAll] = useState<Leave[] | null>(null)
  const [mine, setMine] = useState<Leave[] | null>(null)
  const [error, setError] = useState('')
  const year = cairoNow().date.slice(0, 4)
  useEffect(() => (manager ? staff.watchLeaves(`${year}-01-01`, setAll, (e) => setError(String(e))) : undefined), [manager, year])
  useEffect(() => (!manager && mineToo ? staff.watchMyLeaves(setMine, (e) => setError(String(e))) : undefined), [manager, mineToo])
  return { all, mine: manager ? (all ? all.filter((l) => l.uid === myUid()) : null) : mine, error }
}

// ---------- Leave ----------

export function LeaveBoard({ manager, canAsk, all, mine, shifts, onShiftsSaved }: { manager: boolean; canAsk: boolean; all: Leave[] | null; mine: Leave[] | null; shifts: Shifts; onShiftsSaved: (changed: Shifts) => void }) {
  const year = cairoNow().date.slice(0, 4)
  const waiting = (all ?? []).filter((l) => l.state === 'pending')
  const decided = (all ?? []).filter((l) => l.state === 'ok' || l.state === 'no')
  return (
    <>
      {manager && waiting.length > 0 && (
        <section className="hr-requests">
          <h3>{tn('Days off waiting for you (%n)', { n: waiting.length })}</h3>
          {waiting.map((l) => <LeaveRow key={l.id} l={l} all={all ?? []} shifts={shifts} onShiftsSaved={onShiftsSaved} />)}
        </section>
      )}
      {canAsk && <AskLeave />}
      {canAsk && (
        <section className="hr-off-box">
          <h3>{t('My requests')}</h3>
          <p className="hint">{tn('Annual leave used in %y: %n days', { y: year, n: annualUsed(mine ?? [], myUid(), year) })}</p>
          {!mine ? <p className="muted">{t('Loading…')}</p> : !mine.length ? <p className="muted small">{t('No requests yet.')}</p> : (
            <div className="hr-list">{mine.map((l) => <MyLeave key={l.id} l={l} />)}</div>
          )}
        </section>
      )}
      {manager && (
        <section className="hr-off-box">
          <h3>{tn('Days off in %y', { y: year })}</h3>
          {!all ? <p className="muted">{t('Loading…')}</p> : !decided.length ? <p className="muted small">{t('No days off yet this year.')}</p> : (
            <div className="hr-list">{decided.map((l) => <LeaveRow key={l.id} l={l} all={all} shifts={shifts} onShiftsSaved={onShiftsSaved} />)}</div>
          )}
        </section>
      )}
    </>
  )
}

function AskLeave() {
  const today = cairoNow().date
  const [f, setF] = useState({ from: addDays(today, 1), to: '', kind: 'annual' as LeaveKind, why: '' })
  const [busy, setBusy] = useState(false)
  const to = f.to && f.to >= f.from ? f.to : f.from
  const days = leaveDates({ from: f.from, to }).length
  async function go() {
    setBusy(true)
    try {
      await staff.askLeave({ from: f.from, to, kind: f.kind, why: f.why })
      setF({ ...f, to: '', why: '' })
      showToast(t('Sent to HR.'))
    } catch (e) { refused(e) }
    setBusy(false)
  }
  return (
    <section className="hr-off-box">
      <h3>{t('Ask for days off')}</h3>
      <div className="form">
        <div className="hr-one">
          <label><span>{t('From')}</span><input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
          <label><span>{t('To (optional)')}</span><input type="date" value={f.to} min={f.from} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
          <label><span>{t('Kind')}</span><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as LeaveKind })}>{LEAVE_KINDS.map((k) => <option key={k} value={k}>{t(KIND_LABEL[k])}</option>)}</select></label>
        </div>
        <label><span>{t('Why')}</span><textarea rows={2} maxLength={500} value={f.why} dir="auto" onChange={(e) => setF({ ...f, why: e.target.value })} /></label>
        <button className="btn btn-primary" disabled={busy || !f.from || !f.why.trim() || days > 60} onClick={go}>{days === 1 ? t('Send request (1 day)') : tn('Send request (%n days)', { n: days })}</button>
      </div>
    </section>
  )
}

function MyLeave({ l }: { l: Leave }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="hr-leave">
      <div className="hr-person-main">
        <b dir="auto">{range(l)} · {daysText(leaveDates(l).length)}</b>
        <span className="muted small" dir="auto">{t(KIND_LABEL[l.kind])} · {l.why}</span>
        {l.answer && <span className="hr-day-why" dir="auto">{tn('HR: %r', { r: l.answer })}</span>}
      </div>
      <div className="hr-day-chips">
        <span className={`chip ${STATE_TONE[l.state]}`}>{t(STATE_LABEL[l.state])}</span>
        {l.state === 'pending' && <button className="btn btn-small btn-ghost" disabled={busy} onClick={async () => { setBusy(true); try { await staff.cancelLeave(l.id) } catch (e) { refused(e) } setBusy(false) }}>{t('Cancel')}</button>}
      </div>
    </div>
  )
}

/** One request for HR: accept turns its days into days off in the shifts, decline leaves the shifts as they are. */
function LeaveRow({ l, all, shifts, onShiftsSaved }: { l: Leave; all: Leave[]; shifts: Shifts; onShiftsSaved: (changed: Shifts) => void }) {
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState('')
  const [open, setOpen] = useState(false)
  const year = l.from.slice(0, 4)
  const used = annualUsed(all, l.uid, year)
  async function setOff(off: boolean) {
    let p: Person = shifts[l.uid] ?? { name: l.name, plans: [], dates: {} }
    for (const d of leaveDates(l)) p = off ? withDate(p, d, null) : p.dates[d] === null ? withDate(p, d, undefined) : p
    await hr.savePerson(l.uid, p)
    onShiftsSaved({ [l.uid]: p })
  }
  async function decide(state: 'ok' | 'no' | 'cancelled') {
    setBusy(true)
    try {
      await staff.decideLeave(l.id, state, answer)
      if (state === 'ok') await setOff(true)
      if (state === 'cancelled') await setOff(false)
      track('hr', state === 'ok' ? 'hr.leave_ok' : 'hr.leave_no', { what: l.name, note: `${t(KIND_LABEL[l.kind])} ${l.from}${l.to !== l.from ? ` → ${l.to}` : ''}${state === 'cancelled' ? ' (cancelled)' : ''}${answer ? ` · ${answer}` : ''}`, ref: l.uid })
      setOpen(false)
    } catch (e) { refused(e) }
    setBusy(false)
  }
  const today = cairoNow().date
  return (
    <div className="hr-request">
      <Avatar uid={l.uid} name={l.name} size={36} />
      <div className="hr-person-main">
        <b dir="auto">{l.name}</b>
        <span className="muted small" dir="auto">{range(l)} · {daysText(leaveDates(l).length)} · {t(KIND_LABEL[l.kind])}{l.kind === 'annual' ? ` · ${tn('%n annual days used this year', { n: used })}` : ''}</span>
        <span className="hr-day-why" dir="auto">“{l.why}”</span>
        {l.state !== 'pending' && <span className="muted small" dir="auto">{t(STATE_LABEL[l.state])}{l.byName ? ` · ${l.byName}` : ''}{l.decidedAt ? ` · ${dateLabel(l.decidedAt)}` : ''}{l.answer ? ` · ${l.answer}` : ''}</span>}
        {open && <input className="hr-answer" placeholder={t('Answer (optional)')} value={answer} maxLength={500} dir="auto" onChange={(e) => setAnswer(e.target.value)} />}
      </div>
      <div className="hr-day-acts">
        {l.state === 'pending' ? (
          open ? <>
            <button className="btn btn-small btn-ghost" disabled={busy} onClick={() => decide('no')}>{t('Decline')}</button>
            <button className="btn btn-small btn-primary" disabled={busy} onClick={() => decide('ok')}>{t('Accept')}</button>
          </> : <button className="btn btn-small btn-primary" onClick={() => setOpen(true)}>{t('Answer')}</button>
        ) : <>
          <span className={`chip ${STATE_TONE[l.state]}`}>{t(STATE_LABEL[l.state])}</span>
          {l.state === 'ok' && l.to >= today && <button className="btn btn-small btn-ghost" disabled={busy} onClick={() => decide('cancelled')}>{t('Cancel')}</button>}
        </>}
      </div>
    </div>
  )
}

// ---------- Employee files ----------

export function StaffFiles({ people, all }: { people: { uid: string; name: string }[]; all: Leave[] | null }) {
  const [open, setOpen] = useState<{ uid: string; name: string } | null>(null)
  const year = cairoNow().date.slice(0, 4)
  if (!people.length) return <Empty icon="users" text={t('Nobody has joined yet.')} />
  return (
    <>
      <p className="hint">{t('Each person’s details, salary, start date and a record of notes, warnings and praise. Only people who can manage HR see these files.')}</p>
      <div className="hr-list">
        {people.map((p) => (
          <button key={p.uid} className="hr-person" onClick={() => setOpen(p)}>
            <Avatar uid={p.uid} name={p.name} size={40} />
            <div className="hr-person-main"><b dir="auto">{p.name}</b><span className="muted small">{tn('Annual leave used in %y: %n days', { y: year, n: annualUsed(all ?? [], p.uid, year) })}</span></div>
            <span className="muted small">{t('Open file')}</span>
          </button>
        ))}
      </div>
      {open && <StaffFile uid={open.uid} name={open.name} all={all ?? []} onClose={() => setOpen(null)} />}
    </>
  )
}

function StaffFile({ uid, name, all, onClose }: { uid: string; name: string; all: Leave[]; onClose: () => void }) {
  const [s, setS] = useState<Staff | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState({ kind: 'note' as NoteKind, text: '' })
  useEffect(() => { staff.loadStaff(uid, name).then(setS, (e) => { refused(e); onClose() }) }, [uid, name]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!s) return <Sheet title={name} onClose={onClose}><p className="muted">{t('Loading…')}</p></Sheet>
  const year = cairoNow().date.slice(0, 4)
  const used = annualUsed(all, uid, year)
  const ten = tenure(s.startDate)
  const field = (k: 'title' | 'phone' | 'nationalId' | 'address' | 'emergency', label: string, type = 'text') => (
    <label><span>{t(label)}</span><input type={type} dir="auto" value={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.value })} /></label>
  )
  async function save() {
    setBusy(true)
    try {
      await staff.saveStaff(uid, { ...s!, name })
      track('hr', 'hr.file', { what: name, ref: uid })
      showToast(t('Saved.'))
    } catch (e) { refused(e) }
    setBusy(false)
  }
  async function addNote() {
    setBusy(true)
    try {
      const n = await staff.addNote(uid, name, note.kind, note.text)
      setS({ ...s!, notes: [...s!.notes, n] })
      track('hr', 'hr.note', { what: name, note: `${NOTE_LABEL[note.kind]}: ${note.text}`, ref: uid })
      setNote({ kind: 'note', text: '' })
    } catch (e) { refused(e) }
    setBusy(false)
  }
  return (
    <Sheet title={name} onClose={onClose} footer={<button className="btn btn-primary" disabled={busy} onClick={save}>{t('Save file')}</button>}>
      <div className="form">
        <div className="hr-file-top">
          <Avatar uid={uid} name={name} size={56} />
          <div className="hr-day-chips">
            {ten && <span className="chip chip-info">{tn('With us %y y %m m', { y: ten.y, m: ten.m })}</span>}
            <span className={`chip ${used > s.annualDays ? 'chip-bad' : 'chip-good'}`}>{tn('Annual leave %u of %a days', { u: used, a: s.annualDays })}</span>
          </div>
        </div>
        <div className="hr-one">
          {field('title', 'Job title')}
          <label><span>{t('Start date')}</span><input type="date" value={s.startDate} onChange={(e) => setS({ ...s, startDate: e.target.value })} /></label>
        </div>
        <div className="hr-one">
          {field('phone', 'Phone', 'tel')}
          {field('nationalId', 'National ID')}
        </div>
        {field('address', 'Address')}
        {field('emergency', 'Emergency contact')}
        <div className="hr-one">
          <label><span>{t('Monthly salary (EGP)')}</span><input type="number" min="0" inputMode="decimal" value={s.salary || ''} onChange={(e) => setS({ ...s, salary: Number(e.target.value) || 0 })} /></label>
          <label><span>{t('Annual leave days a year')}</span><input type="number" min="0" max="60" inputMode="numeric" value={s.annualDays} onChange={(e) => setS({ ...s, annualDays: Math.min(60, Math.max(0, Math.round(Number(e.target.value) || 0))) })} /></label>
        </div>
        <section className="hr-off-box">
          <h3>{t('Notes, warnings and praise')}</h3>
          {!s.notes.length && <p className="muted small">{t('Nothing written yet.')}</p>}
          {[...s.notes].reverse().map((n, i) => (
            <div key={n.at + '-' + i} className="hr-note">
              <span className={`chip ${NOTE_TONE[n.kind]}`}>{t(NOTE_LABEL[n.kind])}</span>
              <span dir="auto">{n.text}</span>
              <small className="muted" dir="auto">{dateLabel(n.at)} · {n.byName}</small>
            </div>
          ))}
          <div className="hr-one">
            <label><span>{t('Kind')}</span><select value={note.kind} onChange={(e) => setNote({ ...note, kind: e.target.value as NoteKind })}>{NOTE_KINDS.map((k) => <option key={k} value={k}>{t(NOTE_LABEL[k])}</option>)}</select></label>
          </div>
          <textarea rows={2} maxLength={1000} dir="auto" placeholder={t('What happened?')} value={note.text} onChange={(e) => setNote({ ...note, text: e.target.value })} />
          <button className="btn" disabled={busy || !note.text.trim()} onClick={addNote}>{t('Add to the file')}</button>
        </section>
      </div>
    </Sheet>
  )
}
