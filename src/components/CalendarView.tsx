import { useState } from 'react'
import { addDays, cairoNow, stageOf, whenOf } from '../data/logic'
import type { Data, Post } from '../data/types'
import { locale, t } from '../i18n'
import { byWhen } from './HomeView'
import { PostRow } from './PostRow'
import { Empty, Icon, dayLabel } from './ui'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** A month of scheduled and posted posts. Pick a day to see what goes out on it. */
export function CalendarView({ data, onOpen }: { data: Data; onOpen: (id: string) => void }) {
  const today = cairoNow().date
  const [month, setMonth] = useState(today.slice(0, 7))
  const [day, setDay] = useState(today)

  const byDay = new Map<string, Post[]>()
  const waiting: Post[] = []
  for (const p of data.posts) {
    const stage = stageOf(p)
    if (stage !== 'scheduled' && stage !== 'posted') continue
    const when = whenOf(p)
    if (!when) waiting.push(p)
    else byDay.set(when.date, [...(byDay.get(when.date) ?? []), p])
  }

  const first = `${month}-01`
  const lead = new Date(`${first}T12:00:00Z`).getUTCDay()
  const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => addDays(first, i))]
  const shift = (n: number) => {
    const d = new Date(`${first}T12:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() + n)
    setMonth(d.toISOString().slice(0, 7))
  }
  const dayPosts = (byDay.get(day) ?? []).sort(byWhen)

  return (
    <div className="view">
      <div className="cal">
        <div className="cal-head">
          <button className="icon-btn" onClick={() => shift(-1)} aria-label="Previous month"><Icon name="left" /></button>
          <b>{new Date(`${first}T12:00:00Z`).toLocaleDateString(locale(), { month: 'long', year: 'numeric', timeZone: 'UTC' })}</b>
          <button className="icon-btn" onClick={() => shift(1)} aria-label="Next month"><Icon name="right" /></button>
        </div>
        <div className="cal-grid">
          {WEEKDAYS.map((w) => <span key={w} className="cal-wd">{t(w)}</span>)}
          {cells.map((date, i) => {
            if (!date) return <span key={`x${i}`} />
            const posts = byDay.get(date) ?? []
            const posted = posts.filter((p) => stageOf(p) === 'posted').length
            return (
              <button key={date} className={`cal-day${date === day ? ' cal-on' : ''}${date === today ? ' cal-today' : ''}`} onClick={() => setDay(date)}>
                <span>{Number(date.slice(8))}</span>
                {posts.length > 0 && <i className={posted === posts.length ? 'dot dot-done' : 'dot'}>{posts.length}</i>}
              </button>
            )
          })}
        </div>
      </div>
      <section>
        <h2>{t('Posts for')} {dayLabel(day)}</h2>
        {dayPosts.length ? <div className="list">{dayPosts.map((p) => <PostRow key={p.id} post={p} onOpen={onOpen} />)}</div> : <Empty icon="calendar" text={t('No posts on this day.')} />}
      </section>
      {waiting.length > 0 && (
        <section>
          <h2>{t('Waiting for a slot')}</h2>
          <div className="list">{waiting.map((p) => <PostRow key={p.id} post={p} onOpen={onOpen} />)}</div>
        </section>
      )}
    </div>
  )
}
