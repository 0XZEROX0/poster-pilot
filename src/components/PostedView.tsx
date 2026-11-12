import { stageOf, whenOf } from '../data/logic'
import type { Data, Post } from '../data/types'
import { t } from '../i18n'
import { byWhen } from './HomeView'
import { PostRow } from './PostRow'
import { Empty, dayLabel } from './ui'

/** Everything already published, newest first, grouped by day. */
export function PostedView({ data, onOpen }: { data: Data; onOpen: (id: string) => void }) {
  const posts = data.posts.filter((p) => stageOf(p) === 'posted').sort((a, b) => byWhen(b, a))
  if (!posts.length) return <div className="view"><Empty icon="posted" text={t('Nothing posted yet.')} /></div>
  const groups = new Map<string, Post[]>()
  for (const p of posts) {
    const date = whenOf(p)?.date ?? ''
    groups.set(date, [...(groups.get(date) ?? []), p])
  }
  return (
    <div className="view">
      {[...groups].map(([date, list]) => (
        <section key={date}>
          <h2>{date ? dayLabel(date) : t('Posted')}</h2>
          <div className="list">{list.map((p) => <PostRow key={p.id} post={p} onOpen={onOpen} />)}</div>
        </section>
      ))}
    </div>
  )
}
