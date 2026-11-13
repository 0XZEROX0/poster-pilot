import { stageOf, whenOf } from '../data/logic'
import type { Data, Post } from '../data/types'
import { t } from '../i18n'
import { byWhen } from './HomeView'
import { BulkBar, BulkToggle, Pick, useBulk, type BulkAction } from './Bulk'
import { CardSize } from './CardSize'
import { allowed, backend } from '../data/store'
import { PostCard } from './PostRow'
import { Empty, dayLabel } from './ui'

/** Everything already published, as cards grouped by the day it went out, newest first. */
export function PostedView({ data, onOpen }: { data: Data; onOpen: (id: string) => void }) {
  const posts = data.posts.filter((p) => stageOf(p) === 'posted').sort((a, b) => byWhen(b, a))
  const bulk = useBulk(posts.map((p) => p.id))
  // Removes the post from the app and empties its sheet row. What is on Facebook and Instagram stays there.
  const actions: BulkAction[] = allowed('delete') ? [{ label: 'Delete from the app', icon: 'trash', tone: 'danger', confirm: true, run: (id) => backend.removePost(id) }] : []
  if (!posts.length) return <div className="view"><Empty icon="posted" text={t('Nothing posted yet.')} /></div>
  const groups = new Map<string, Post[]>()
  for (const p of posts) {
    const date = whenOf(p)?.date ?? ''
    groups.set(date, [...(groups.get(date) ?? []), p])
  }
  return (
    <div className="view">
      <div className="review-bar tools">{actions.length > 0 && <BulkToggle bulk={bulk} />}<CardSize /></div>
      {[...groups].map(([date, list]) => (
        <section key={date}>
          <h2>{date ? dayLabel(date) : t('Posted')} <span className="group-count">{list.length}</span></h2>
          <div className="cards cards-sm">{list.map((p) => <Pick key={p.id} bulk={bulk} id={p.id} show={actions.length > 0}><PostCard post={p} onOpen={onOpen} /></Pick>)}</div>
        </section>
      ))}
      <BulkBar bulk={bulk} actions={actions} />
    </div>
  )
}
