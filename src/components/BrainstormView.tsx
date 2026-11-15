import { useEffect, useRef, useState } from 'react'
import { cairoNow, categoryOf, matchesSearch, problemOf, stageOf, titleOf, whenOf } from '../data/logic'
import { placeIn, plans, takeOut, weekDays, weeksOfMonth, weekStart, type WeekPlan } from '../data/plans'
import type { Data, Post } from '../data/types'
import { locale, t, tn } from '../i18n'
import { byWhen } from './HomeView'
import { CardSize } from './CardSize'
import { useDesktop } from './useDesktop'
import { Poster } from './Poster'
import { CategoryChips, categoryOn, dayLabel, Empty, Icon, SearchBox, showToast, StyleChips, styleOn, timeLabel } from './ui'

/** Approved and not out yet: what can be planned. */
const plannable = (p: Post) => {
  const stage = stageOf(p)
  if (stage === 'scheduled') return true
  const kind = problemOf(p)?.kind
  return stage === 'fix' && p.feedback === 'Done' && (kind === 'facebook' || kind === 'instagram')
}

const shortDate = (date: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString(locale(), { ...opts, timeZone: 'UTC' })

/** "15 – 21 Nov", or "29 Nov – 5 Dec" across two months. */
function weekLabel(start: string): string {
  const end = weekDays(start)[6]
  return start.slice(5, 7) === end.slice(5, 7)
    ? `${shortDate(start, { day: 'numeric' })} – ${shortDate(end)}`
    : `${shortDate(start)} – ${shortDate(end)}`
}

type Drag = { id: string; x: number; y: number; over: string | null }

/**
 * Brainstorm: a week of days, and the approved posts at the side to drag (or tap) onto a day.
 * It is only a plan, saved per week. It never sets a post's date or time, so nothing gets scheduled.
 */
export function BrainstormView({ data, onOpen }: { data: Data; onOpen: (id: string) => void }) {
  const today = cairoNow().date
  const [week, setWeek] = useState(() => weekStart(today))
  const [month, setMonth] = useState(today.slice(0, 7))
  const [plan, setPlan] = useState<WeekPlan>({})
  const [loaded, setLoaded] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [query, setQuery] = useState('')
  const [style, setStyle] = useState('')
  const [category, setCategory] = useState('')
  const [clearing, setClearing] = useState(false)
  const justDragged = useRef(false)
  const desktop = useDesktop()
  const [filters, setFilters] = useState(false)

  useEffect(() => {
    return plans.watch(week, (info) => { setPlan(info.plan); setLoaded(week) })
  }, [week])

  const days = weekDays(week)
  const byId = new Map(data.posts.map((p) => [p.id, p]))
  const dayOf = new Map<string, string>()
  for (const [d, ids] of Object.entries(plan)) for (const id of ids) dayOf.set(id, d)
  const allTray = data.posts.filter(plannable)
  const tray = allTray
    .filter((p) => (!styleOn(allTray, style) || p.style === style) && (!categoryOn(allTray, category) || categoryOf(p) === category) && matchesSearch(p, query))
    .sort(byWhen)
  // Posts not planned this week come first: they are the ones still to place.
  tray.sort((a, b) => Number(dayOf.has(a.id)) - Number(dayOf.has(b.id)))
  const planned = [...dayOf.keys()].length

  function save(next: WeekPlan) {
    setPlan(next)
    plans.save(week, next).catch(() => showToast(t('Could not save the plan. Make sure the latest rules are published in Firebase.')))
  }
  function put(id: string, day: string, before?: string) {
    setPicked(null)
    if (before === id) return
    save(placeIn(plan, id, day, before))
  }
  function remove(id: string) {
    setPicked(null)
    save(takeOut(plan, id))
  }

  function chooseMonth(n: number) {
    const d = new Date(`${month}-01T12:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() + n)
    const next = d.toISOString().slice(0, 7)
    setMonth(next)
    setWeek(next === today.slice(0, 7) ? weekStart(today) : weeksOfMonth(next)[0])
    setPicked(null)
  }
  function chooseWeek(start: string) {
    setWeek(start)
    setPicked(null)
    setClearing(false)
  }

  /** Dragging with the mouse from anywhere on a card, and with a finger from its grip. */
  function startDrag(e: React.PointerEvent, id: string) {
    if (e.button !== 0) return
    if (e.pointerType !== 'mouse' && !(e.target as Element).closest('.grip')) return
    if ((e.target as Element).closest('.bs-x, .bs-open')) return
    const sx = e.clientX, sy = e.clientY
    let active = false
    let over: string | null = null
    let before: string | undefined
    let y = sy
    const scroller = window.setInterval(() => {
      if (!active) return
      const by = y < 90 ? -14 : y > window.innerHeight - 80 ? 14 : 0
      if (by) (document.querySelector('.desk-main') ?? window).scrollBy(0, by)
    }, 30)
    const move = (ev: PointerEvent) => {
      if (!active && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return
      active = true
      y = ev.clientY
      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      over = el?.closest<HTMLElement>('[data-day]')?.dataset.day ?? (el?.closest('.bs-tray') ? 'tray' : null)
      before = el?.closest<HTMLElement>('[data-post]')?.dataset.post
      setDrag({ id, x: ev.clientX, y: ev.clientY, over })
    }
    const end = (ev: PointerEvent) => {
      window.clearInterval(scroller)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      setDrag(null)
      if (!active) return
      justDragged.current = true
      setTimeout(() => { justDragged.current = false }, 0)
      if (ev.type !== 'pointerup' || !over) return
      if (over === 'tray') { if (dayOf.has(id)) remove(id) }
      else put(id, over, before)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }
  const pick = (id: string) => {
    if (justDragged.current) return
    setPicked((cur) => (cur === id ? null : id))
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPicked(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const holding = drag?.id ?? picked
  const dragged = drag && byId.get(drag.id)
  const cardProps = (id: string) => ({
    onPointerDown: (e: React.PointerEvent) => startDrag(e, id),
    onDragStart: (e: React.DragEvent) => e.preventDefault(),
  })

  return (
    <div className={`view brainstorm${drag ? ' dragging' : ''}`}>
      <div className="bs-weeks">
        <div className="bs-month">
          <button className="icon-btn" onClick={() => chooseMonth(-1)} aria-label={t('Previous month')}><Icon name="left" /></button>
          <b>{new Date(`${month}-01T12:00:00Z`).toLocaleDateString(locale(), { month: 'long', year: 'numeric', timeZone: 'UTC' })}</b>
          <button className="icon-btn" onClick={() => chooseMonth(1)} aria-label={t('Next month')}><Icon name="right" /></button>
        </div>
        <div className="filters bs-week-chips" role="group" aria-label={t('Week')}>
          {weeksOfMonth(month).map((s) => (
            <button key={s} className={`filter${s === week ? ' on' : ''}`} aria-pressed={s === week} onClick={() => chooseWeek(s)}>
              {weekLabel(s)}
              {s === weekStart(today) && <i className="bs-now" aria-label={t('This week')} />}
            </button>
          ))}
        </div>
      </div>
      <p className="hint bs-note"><Icon name="shield" size={16} /> {t('Only a plan. Nothing here is scheduled on Facebook or Instagram, and no post gets a date or time.')}</p>

      <div className="day-grid">
        <div className="bs-days">
          <div className="bs-days-head">
            <h2>{weekLabel(week)}</h2>
            <span className="muted small">{tn('%n planned', { n: String(planned) })}</span>
            {planned > 0 && (
              <button className={`btn btn-ghost bs-clear${clearing ? ' bad' : ''}`} onClick={() => (clearing ? (save({}), setClearing(false)) : setClearing(true))} onBlur={() => setClearing(false)}>
                {clearing ? t('Tap again to clear') : t('Clear week')}
              </button>
            )}
          </div>
          {days.map((d) => {
            const ids = plan[d] ?? []
            return (
              <div
                key={d}
                data-day={d}
                className={`bs-day${d === today ? ' bs-today' : ''}${d < today ? ' bs-past' : ''}${drag?.over === d ? ' bs-over' : ''}${picked ? ' bs-target' : ''}`}
                onClick={picked ? () => put(picked, d) : undefined}
              >
                <div className="bs-day-name">
                  <b>{shortDate(d, { weekday: 'short' })}</b>
                  <span>{shortDate(d)}</span>
                </div>
                <div className="bs-day-posts">
                  {ids.map((id) => {
                    const p = byId.get(id)
                    if (!p) {
                      return (
                        <div key={id} data-post={id} className="bs-post bs-gone">
                          <span>{t('Post no longer here')}</span>
                          <button className="icon-btn bs-x" onClick={(e) => { e.stopPropagation(); remove(id) }} aria-label={t('Take off the plan')}><Icon name="close" size={16} /></button>
                        </div>
                      )
                    }
                    const posted = stageOf(p) === 'posted'
                    const when = whenOf(p)
                    return (
                      <div
                        key={id}
                        data-post={id}
                        className={`bs-post${holding === id ? ' held' : ''}${posted ? ' bs-posted' : ''}`}
                        {...cardProps(id)}
                        onClick={(e) => { e.stopPropagation(); if (picked && picked !== id) put(picked, d, id); else pick(id) }}
                      >
                        <span className="grip" aria-hidden="true"><Icon name="grip" size={16} /></span>
                        <Poster post={p} small />
                        <span className="bs-post-text">
                          <span dir="auto">{titleOf(p)}</span>
                          {posted ? <i className="good">{t('Published')}</i> : when ? <i>{t('Scheduled')}: {dayLabel(when.date)} · {timeLabel(when.time)}</i> : null}
                        </span>
                        <button className="icon-btn bs-open" onClick={(e) => { e.stopPropagation(); onOpen(id) }} aria-label={t('Edit')}><Icon name="edit" size={16} /></button>
                        <button className="icon-btn bs-x" onClick={(e) => { e.stopPropagation(); remove(id) }} aria-label={t('Take off the plan')}><Icon name="close" size={16} /></button>
                      </div>
                    )
                  })}
                  {!ids.length && <span className="bs-empty">{picked ? t('Tap to place here') : t('Drop posts here')}</span>}
                </div>
              </div>
            )
          })}
          {loaded !== week && <p className="hint">{t('Loading…')}</p>}
        </div>

        <aside className={`tray bs-tray${drag?.over === 'tray' && dayOf.has(drag.id) ? ' bs-over' : ''}`}>
          <div className="review-bar"><h2>{t('Approved posts')} <span className="group-count">{tray.length}</span></h2>{desktop ? <CardSize /> : (
            <button className={`icon-btn bs-filter-btn${filters || style || category || query ? ' on' : ''}`} onClick={() => setFilters(!filters)} aria-expanded={filters} aria-label={t('Search and filters')}><Icon name="search" size={20} /></button>
          )}</div>
          <p className="hint">{picked ? t('Now tap a day to place it.') : t('Drag a post onto a day, or tap it and then tap a day.')}</p>
          {/* On a phone the panel stays small at the top, so the days stay in view; filters open from the search button. */}
          {(desktop || filters) && (
            <>
              <StyleChips posts={allTray} value={style} onChange={setStyle} className="tray-filters" />
              <CategoryChips posts={allTray} value={category} onChange={setCategory} className="tray-filters" />
              {allTray.length > 4 || query ? <SearchBox value={query} onChange={setQuery} /> : null}
            </>
          )}
          {tray.length ? (
            <div className="tray-list">
              {tray.map((p) => {
                const on = dayOf.get(p.id)
                const when = whenOf(p)
                return (
                  <div key={p.id} className={`tray-card${holding === p.id ? ' held' : ''}${on ? ' bs-in' : ''}`} {...cardProps(p.id)} onClick={() => pick(p.id)}>
                    <Poster post={p} small />
                    <span className="grip" aria-hidden="true"><Icon name="grip" size={18} /></span>
                    <span className="tray-title" dir="auto">{titleOf(p)}</span>
                    <span className={`tray-when${on ? ' bs-in-day' : ''}`}>
                      {on ? `${t('Planned')}: ${shortDate(on, { weekday: 'short' })}` : when ? `${t('Scheduled')}: ${dayLabel(when.date)}` : t('Not planned')}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <Empty icon="review" text={query.trim() ? t('No post matches your search.') : t('No approved posts yet. Approve posters in Review first.')} />
          )}
        </aside>
      </div>

      {dragged && drag && (
        <div className="ghost" style={{ left: drag.x, top: drag.y }}>
          <Poster post={dragged} small />
          <span dir="auto">{drag.over && drag.over !== 'tray' ? shortDate(drag.over, { weekday: 'long', day: 'numeric', month: 'short' }) : drag.over === 'tray' ? t('Take off the plan') : titleOf(dragged)}</span>
        </div>
      )}
    </div>
  )
}
