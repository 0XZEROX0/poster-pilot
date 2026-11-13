import { useEffect, useRef, useState } from 'react'
import { addDays, addMinutes, cairoNow, matchesSearch, problemOf, stageOf, titleOf, whenOf } from '../data/logic'
import { backend } from '../data/store'
import type { Data, Post } from '../data/types'
import { locale, t } from '../i18n'
import { byWhen } from './HomeView'
import { Poster } from './Poster'
import { PostCard } from './PostRow'
import { Empty, Icon, SearchBox, dayLabel, showToast, timeLabel } from './ui'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** The steps of the day view, in minutes, from widest to finest. */
const ZOOMS = [60, 30, 15]
const ZOOM_LABEL: Record<number, string> = { 60: '1 hour', 30: '30 min', 15: '15 min' }
const ZOOM_KEY = 'posterpilot.zoom'
/** The day view opens at noon, as most posts go out between noon and midnight. */
const DAY_START = 12 * 60
/** Facebook needs some notice before a post goes out. */
const NOTICE_MIN = 20

const hhmm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
const minsOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))

/** Approved and still movable: on the schedule, or held back by a publishing problem a new time can fix. */
function movable(p: Post): boolean {
  const stage = stageOf(p)
  if (stage === 'scheduled') return true
  const kind = problemOf(p)?.kind
  return stage === 'fix' && p.feedback === 'Done' && (kind === 'facebook' || kind === 'instagram')
}

function savedZoom(): number {
  try {
    const v = Number(localStorage.getItem(ZOOM_KEY))
    if (ZOOMS.includes(v)) return v
  } catch {
    // No storage: use the default.
  }
  return 30
}

type Drag = { id: string; x: number; y: number; over: string | null }

/** The planner: a month to pick a day from, then that day as a timeline to drop approved posts on. */
export function PlannerView({ data, onOpen }: { data: Data; onOpen: (id: string) => void }) {
  const today = cairoNow().date
  const [month, setMonth] = useState(today.slice(0, 7))
  const [day, setDay] = useState<string | null>(null)

  const byDay = new Map<string, Post[]>()
  const waiting: Post[] = []
  for (const p of data.posts) {
    const stage = stageOf(p)
    if (stage !== 'posted' && !movable(p)) continue
    const when = whenOf(p)
    if (!when) waiting.push(p)
    else byDay.set(when.date, [...(byDay.get(when.date) ?? []), p])
  }

  if (day) return <DayView day={day} setDay={setDay} posts={data.posts} onOpen={onOpen} />

  const first = `${month}-01`
  const lead = new Date(`${first}T12:00:00Z`).getUTCDay()
  const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => addDays(first, i))]
  const shift = (n: number) => {
    const d = new Date(`${first}T12:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() + n)
    setMonth(d.toISOString().slice(0, 7))
  }

  return (
    <div className="view">
      <div className="cal">
        <div className="cal-head">
          <button className="icon-btn" onClick={() => shift(-1)} aria-label={t('Previous month')}><Icon name="left" /></button>
          <b>{new Date(`${first}T12:00:00Z`).toLocaleDateString(locale(), { month: 'long', year: 'numeric', timeZone: 'UTC' })}</b>
          <button className="icon-btn" onClick={() => shift(1)} aria-label={t('Next month')}><Icon name="right" /></button>
        </div>
        <div className="cal-grid">
          {WEEKDAYS.map((w) => <span key={w} className="cal-wd">{t(w)}</span>)}
          {cells.map((date, i) => {
            if (!date) return <span key={`x${i}`} />
            const posts = byDay.get(date) ?? []
            const posted = posts.filter((p) => stageOf(p) === 'posted').length
            return (
              <button key={date} className={`cal-day${date === today ? ' cal-today' : ''}${date < today ? ' cal-past' : ''}`} onClick={() => setDay(date)}>
                <span>{Number(date.slice(8))}</span>
                {posts.length > 0 && <i className={posted === posts.length ? 'dot dot-done' : 'dot'}>{posts.length}</i>}
              </button>
            )
          })}
        </div>
        <p className="hint cal-hint">{t('Pick a day to plan its posts.')}</p>
      </div>
      {waiting.length > 0 && (
        <section>
          <h2>{t('Approved, no time yet')} <span className="group-count">{waiting.length}</span></h2>
          <div className="cards cards-sm">{waiting.map((p) => <PostCard key={p.id} post={p} onOpen={onOpen} />)}</div>
        </section>
      )}
    </div>
  )
}

/** One day as a timeline. Approved posts wait at the side and are dragged, or tapped, onto a time. */
function DayView({ day, setDay, posts, onOpen }: { day: string; setDay: (d: string | null) => void; posts: Post[]; onOpen: (id: string) => void }) {
  const [zoom, setZoom] = useState(savedZoom)
  const [early, setEarly] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [query, setQuery] = useState('')
  const timeline = useRef<HTMLDivElement>(null)
  const justDragged = useRef(false)
  const now = cairoNow()

  const onDay = posts.filter((p) => (stageOf(p) === 'posted' || movable(p)) && whenOf(p)?.date === day).sort(byWhen)
  const allTray = posts.filter((p) => movable(p) && whenOf(p)?.date !== day)
  const tray = allTray.filter((p) => matchesSearch(p, query)).sort(byWhen)
  // Posts with no time come first: they are the ones waiting to be planned.
  tray.sort((a, b) => Number(Boolean(whenOf(a))) - Number(Boolean(whenOf(b))))

  const firstPost = onDay.length ? Math.floor(minsOf(whenOf(onDay[0])!.time) / 60) * 60 : DAY_START
  const start = early ? 0 : Math.min(DAY_START, firstPost)
  const slots = Array.from({ length: (24 * 60 - start) / zoom }, (_, i) => start + i * zoom)
  const open = (time: string) => day > now.date || (day === now.date && time > addMinutes(now.time, NOTICE_MIN))
  const inSlot = (slot: number) => onDay.filter((p) => { const m = minsOf(whenOf(p)!.time); return m >= slot && m < slot + zoom })

  function changeZoom(step: number) {
    const next = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + step))]
    setZoom(next)
    try {
      localStorage.setItem(ZOOM_KEY, String(next))
    } catch {
      // No storage: the choice lasts for this visit.
    }
  }

  function place(id: string, time: string) {
    setPicked(null)
    if (!open(time)) return showToast(t('That time has passed. Pick a later one.'))
    const post = posts.find((p) => p.id === id)
    const when = post && whenOf(post)
    if (when?.date === day && when.time === time) return
    // A new time for a post whose cancel is still pending replaces the cancel.
    backend.updatePost(id, { postDate: day, postTime: time, ...(post?.feedback === 'Cancel' ? { feedback: 'Done' as const } : {}) }).then(() => showToast(`${t('Set for')} ${dayLabel(day)} · ${timeLabel(time)}`))
  }

  /** Dragging with the mouse from anywhere on a card, and with a finger from its grip. */
  function startDrag(e: React.PointerEvent, id: string) {
    if (e.button !== 0) return
    if (e.pointerType !== 'mouse' && !(e.target as Element).closest('.grip')) return
    if ((e.target as Element).closest('.tl-open')) return
    const sx = e.clientX, sy = e.clientY
    let active = false
    let y = sy
    let over: string | null = null
    // Near the top or bottom edge the timeline scrolls, so any time can be reached in one drag.
    const scroller = window.setInterval(() => {
      if (!active) return
      const box = timeline.current
      const own = box && box.scrollHeight > box.clientHeight + 4
      const top = own ? box.getBoundingClientRect().top : 60
      const bottom = own ? box.getBoundingClientRect().bottom : window.innerHeight - 70
      const by = y < top + 50 ? -14 : y > bottom - 50 ? 14 : 0
      if (!by) return
      if (own) box.scrollBy(0, by)
      else (document.querySelector('.desk-main') ?? window).scrollBy(0, by)
    }, 30)
    const move = (ev: PointerEvent) => {
      if (!active && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return
      active = true
      y = ev.clientY
      over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-slot]')?.dataset.slot ?? null
      setDrag({ id, x: ev.clientX, y: ev.clientY, over })
    }
    const end = (ev: PointerEvent) => {
      window.clearInterval(scroller)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      setDrag(null)
      if (!active) return
      // The click that follows a drag must not also pick the card.
      justDragged.current = true
      setTimeout(() => { justDragged.current = false }, 0)
      if (ev.type === 'pointerup' && over) place(id, over)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }
  const pick = (id: string) => {
    if (justDragged.current) return
    setPicked((cur) => (cur === id ? null : id))
  }

  // Escape lets go of a picked post.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPicked(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const dragged = drag && posts.find((p) => p.id === drag.id)
  const holding = drag?.id ?? picked
  const cardProps = (p: Post) => ({
    onPointerDown: (e: React.PointerEvent) => startDrag(e, p.id),
    onDragStart: (e: React.DragEvent) => e.preventDefault(),
  })

  return (
    <div className={`view planner${drag ? ' dragging' : ''}`}>
      <div className="day-bar">
        <button className="btn" onClick={() => setDay(null)}><Icon name="calendar" size={18} />{t('Month')}</button>
        <div className="day-nav">
          <button className="icon-btn" onClick={() => setDay(addDays(day, -1))} aria-label={t('Previous day')}><Icon name="left" /></button>
          <b>{new Date(`${day}T12:00:00Z`).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}</b>
          <button className="icon-btn" onClick={() => setDay(addDays(day, 1))} aria-label={t('Next day')}><Icon name="right" /></button>
        </div>
        <div className="zoom" role="group" aria-label={t('Time steps')}>
          <button className="icon-btn" disabled={zoom === ZOOMS[0]} onClick={() => changeZoom(-1)} aria-label={t('Wider steps')}><Icon name="minus" size={18} /></button>
          <span>{t(ZOOM_LABEL[zoom])}</span>
          <button className="icon-btn" disabled={zoom === ZOOMS[ZOOMS.length - 1]} onClick={() => changeZoom(1)} aria-label={t('Finer steps')}><Icon name="plus" size={18} /></button>
        </div>
      </div>

      <div className="day-grid">
        <div className="tl" ref={timeline}>
          {start > 0 && <button className="link tl-more" onClick={() => setEarly(true)}>{t('Show earlier hours')}</button>}
          {slots.map((slot) => {
            const time = hhmm(slot)
            const here = inSlot(slot)
            const can = open(time)
            return (
              <div
                key={slot}
                data-slot={time}
                className={`tl-row${slot % 60 === 0 ? ' tl-hour' : ''}${can ? '' : ' tl-past'}${drag?.over === time ? ' tl-over' : ''}${picked && can ? ' tl-target' : ''}`}
                style={{ minHeight: zoom === 60 ? 68 : zoom === 30 ? 54 : 44 }}
                onClick={picked ? () => place(picked, time) : undefined}
              >
                <span className="tl-time">{slot % 60 === 0 || zoom < 60 ? timeLabel(time) : ''}</span>
                <div className="tl-posts">
                  {here.map((p) => {
                    const posted = stageOf(p) === 'posted'
                    const at = whenOf(p)!.time
                    return (
                      <div
                        key={p.id}
                        className={`tl-post${posted ? ' tl-done' : ''}${holding === p.id ? ' held' : ''}${problemOf(p) ? ' tl-bad' : ''}`}
                        {...(posted ? {} : cardProps(p))}
                        onClick={(e) => { e.stopPropagation(); if (posted) onOpen(p.id); else pick(p.id) }}
                      >
                        {!posted && <span className="grip" aria-hidden="true"><Icon name="grip" size={18} /></span>}
                        <Poster post={p} small />
                        <span className="tl-text">
                          <b>{timeLabel(at)}{posted && <> · {t('Published')}</>}</b>
                          <span dir="auto">{titleOf(p)}</span>
                        </span>
                        {!posted && <button className="icon-btn tl-open" onClick={(e) => { e.stopPropagation(); onOpen(p.id) }} aria-label={t('Edit')}><Icon name="edit" size={18} /></button>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <aside className="tray">
          <h2>{t('Approved posts')} <span className="group-count">{tray.length}</span></h2>
          <p className="hint">{picked ? t('Now tap a time to place it.') : t('Drag a post onto a time, or tap it and then tap a time.')}</p>
          {allTray.length > 4 || query ? <SearchBox value={query} onChange={setQuery} /> : null}
          {tray.length ? (
            <div className="tray-list">
              {tray.map((p) => {
                const when = whenOf(p)
                return (
                  <div key={p.id} className={`tray-card${holding === p.id ? ' held' : ''}`} {...cardProps(p)} onClick={() => pick(p.id)}>
                    <Poster post={p} small />
                    <span className="grip" aria-hidden="true"><Icon name="grip" size={18} /></span>
                    <span className="tray-title" dir="auto">{titleOf(p)}</span>
                    <span className={`tray-when${when ? '' : ' tray-none'}${problemOf(p) ? ' bad' : ''}`}>{when ? `${dayLabel(when.date)} · ${timeLabel(when.time)}` : t('No time yet')}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <Empty icon="review" text={query.trim() ? t('No post matches your search.') : t('No other approved posts. Approve posters in Review first.')} />
          )}
        </aside>
      </div>

      {dragged && drag && (
        <div className="ghost" style={{ left: drag.x, top: drag.y }}>
          <Poster post={dragged} small />
          <span dir="auto">{drag.over ? timeLabel(drag.over) : titleOf(dragged)}</span>
        </div>
      )}
    </div>
  )
}
