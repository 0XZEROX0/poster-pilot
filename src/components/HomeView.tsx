import { cairoNow, stageOf, whenOf } from '../data/logic'
import type { Data, Post } from '../data/types'
import { t } from '../i18n'
import { PostRow } from './PostRow'
import { Empty } from './ui'

export type Tab = 'home' | 'review' | 'fix' | 'calendar' | 'posted'

/** Sorts posts by the time they go out, soonest first; `desc` for newest first. */
export function byWhen(a: Post, b: Post) {
  const wa = whenOf(a), wb = whenOf(b)
  return `${wa?.date ?? '9999'} ${wa?.time ?? ''}`.localeCompare(`${wb?.date ?? '9999'} ${wb?.time ?? ''}`)
}

export function HomeView({ data, go, onOpen }: { data: Data; go: (tab: Tab) => void; onOpen: (id: string) => void }) {
  const today = cairoNow().date
  const of = (stage: string) => data.posts.filter((p) => stageOf(p) === stage)
  const scheduled = of('scheduled').sort(byWhen)
  const building = of('building')
  const postedToday = of('posted').filter((p) => whenOf(p)?.date === today).length
  const tiles: { tab: Tab; label: string; count: number; tone: string }[] = [
    { tab: 'review', label: t('To review'), count: of('review').length, tone: 'warn' },
    { tab: 'fix', label: t('Needs fixing'), count: of('fix').length, tone: 'bad' },
    { tab: 'calendar', label: t('Scheduled'), count: scheduled.length, tone: 'info' },
    { tab: 'posted', label: t('Posted today'), count: postedToday, tone: 'good' },
  ]
  return (
    <div className="view">
      <div className="tiles">
        {tiles.map((x) => (
          <button key={x.tab} className={`tile tile-${x.tone}${x.count ? '' : ' tile-zero'}`} onClick={() => go(x.tab)}>
            <b>{x.count}</b>
            <span>{x.label}</span>
          </button>
        ))}
      </div>
      {building.length > 0 && (
        <section>
          <h2>{t('Being built')}</h2>
          <div className="list">{building.map((p) => <PostRow key={p.id} post={p} onOpen={onOpen} />)}</div>
        </section>
      )}
      <section>
        <h2>{t('Up next')}</h2>
        {scheduled.length ? <div className="list">{scheduled.slice(0, 6).map((p) => <PostRow key={p.id} post={p} onOpen={onOpen} />)}</div> : <Empty icon="calendar" text={t('Nothing scheduled yet.')} />}
      </section>
    </div>
  )
}
