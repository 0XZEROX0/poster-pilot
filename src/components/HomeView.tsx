import { addDays, cairoNow, stageOf, titleOf, whenOf } from '../data/logic'
import { seesPage } from '../data/store'
import type { Data, Post } from '../data/types'
import { t } from '../i18n'
import { problemText } from './FixView'
import { Poster } from './Poster'
import { PostRow } from './PostRow'
import { ReviewCard } from './ReviewView'
import { Empty, Icon, dayLabel, timeLabel } from './ui'

export type Tab = 'home' | 'prices' | 'offers' | 'review' | 'fix' | 'calendar' | 'posted' | 'database'

/** Sorts posts by the time they go out, soonest first. */
export function byWhen(a: Post, b: Post) {
  const wa = whenOf(a), wb = whenOf(b)
  return `${wa?.date ?? '9999'} ${wa?.time ?? ''}`.localeCompare(`${wb?.date ?? '9999'} ${wb?.time ?? ''}`)
}

type Props = { data: Data; go: (tab: Tab) => void; onOpen: (id: string) => void; desktop?: boolean }

export function HomeView({ data, go, onOpen, desktop = false }: Props) {
  const today = cairoNow().date
  const of = (stage: string) => data.posts.filter((p) => stageOf(p) === stage)
  const review = of('review')
  const fix = of('fix')
  // Approved posts split in two: the ones with a time are on the schedule, the rest still wait for one.
  const scheduled = of('scheduled').filter((p) => whenOf(p)).sort(byWhen)
  const ready = of('scheduled').filter((p) => !whenOf(p))
  const building = of('building')
  const postedToday = of('posted').filter((p) => whenOf(p)?.date === today).length
  const allTiles: { tab: Tab; label: string; count: number; tone: string; icon: string }[] = [
    { tab: 'review', label: t('To review'), count: review.length, tone: 'warn', icon: 'review' },
    { tab: 'fix', label: t('Needs fixing'), count: fix.length, tone: 'bad', icon: 'fix' },
    { tab: 'calendar', label: t('Ready to schedule'), count: ready.length, tone: 'warn', icon: 'clock' },
    { tab: 'calendar', label: t('Scheduled'), count: scheduled.length, tone: 'info', icon: 'calendar' },
    { tab: 'posted', label: t('Posted today'), count: postedToday, tone: 'good', icon: 'posted' },
  ]
  const tiles = allTiles.filter((x) => seesPage(x.tab))
  const tileRow = (
    <div className="tiles">
      {tiles.map((x) => (
        <button key={x.label} className={`tile tile-${x.tone}${x.count ? '' : ' tile-zero'}`} onClick={() => go(x.tab)}>
          {desktop && <span className="tile-icon"><Icon name={x.icon} /></span>}
          <b>{x.count}</b>
          <span>{x.label}</span>
        </button>
      ))}
    </div>
  )
  const buildingBlock = building.length > 0 && (
    <section>
      <h2>{t('Being built')}</h2>
      <div className="list">{building.map((p) => <PostRow key={p.id} post={p} onOpen={onOpen} />)}</div>
    </section>
  )
  const upNext = (count: number) => seesPage('calendar') && (
    <section>
      <h2>{t('Up next')}</h2>
      {scheduled.length ? <div className="list">{scheduled.slice(0, count).map((p) => <PostRow key={p.id} post={p} onOpen={onOpen} />)}</div> : <Empty icon="calendar" text={t('Nothing scheduled yet.')} />}
    </section>
  )

  if (!desktop) {
    return (
      <div className="view">
        {tileRow}
        {buildingBlock}
        {upNext(6)}
      </div>
    )
  }

  // Desktop dashboard: the counts across the top, the coming week, then the work to do in columns.
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i))
  const onDay = (date: string) => data.posts.filter((p) => ['scheduled', 'posted'].includes(stageOf(p)) && whenOf(p)?.date === date).sort(byWhen)
  return (
    <div className="view">
      {tileRow}
      {seesPage('calendar') && <section>
        <h2>{t('Next 7 days')}</h2>
        <div className="week">
          {week.map((date) => {
            const posts = onDay(date)
            return (
              <div key={date} className={`week-day${date === today ? ' week-today' : ''}`}>
                <b>{dayLabel(date)}</b>
                {posts.map((p) => (
                  <button key={p.id} className={`slot${stageOf(p) === 'posted' ? ' slot-done' : ''}`} onClick={() => onOpen(p.id)} title={titleOf(p)}>
                    <Poster post={p} small />
                    <span>
                      <i>{timeLabel(whenOf(p)!.time)}</i>
                      <span dir="auto">{titleOf(p)}</span>
                    </span>
                  </button>
                ))}
                {!posts.length && <span className="week-empty">·</span>}
              </div>
            )
          })}
        </div>
      </section>}
      <div className="dash">
        {seesPage('review') && <section>
          <h2>
            {t('To review')}
            {review.length > 3 && <button className="link" onClick={() => go('review')}>{t('All')} ({review.length})</button>}
          </h2>
          {review.length ? <div className="cards cards-3">{review.slice(0, 3).map((p) => <ReviewCard key={p.id} post={p} onOpen={onOpen} />)}</div> : <div className="list"><Empty icon="review" text={t('Nothing to review. New posters will show up here.')} /></div>}
        </section>}
        <div className="view">
          {seesPage('fix') && <section>
            <h2>{t('Needs fixing')}</h2>
            <div className="list">
              {fix.map((p) => (
                <button key={p.id} className="row" onClick={() => onOpen(p.id)}>
                  <Poster post={p} small />
                  <span className="row-main">
                    <span className="row-title" dir="auto">{titleOf(p)}</span>
                    <span className="problem-title"><Icon name="fix" size={16} />{problemText(p)?.title}</span>
                  </span>
                </button>
              ))}
              {!fix.length && <Empty icon="posted" text={t('No problems. Everything is running.')} />}
            </div>
          </section>}
          {buildingBlock}
          {upNext(4)}
        </div>
      </div>
    </div>
  )
}
