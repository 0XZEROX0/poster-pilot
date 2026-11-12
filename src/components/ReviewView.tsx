import { formatPrice, hasOffer, priceOf, stageOf, titleOf } from '../data/logic'
import { backend } from '../data/store'
import type { Data, Post } from '../data/types'
import { t } from '../i18n'
import { Poster } from './Poster'
import { Empty, Icon, showToast } from './ui'

/** One finished poster with its decision buttons. */
export function ReviewCard({ post: p, onOpen }: { post: Post; onOpen: (id: string) => void }) {
  const decide = (feedback: 'Done' | 'Redo' | 'ignore', message: string) => backend.updatePost(p.id, { feedback }).then(() => showToast(t(message)))
  return (
    <article className="card">
      <button className="card-poster" onClick={() => onOpen(p.id)} aria-label={t('Edit')}>
        <Poster post={p} />
      </button>
      <div className="card-body">
        <h3 dir="auto">{titleOf(p)}</h3>
        <p className="price">
          <span dir="ltr">{hasOffer(p) && <s>{formatPrice(p.priceBefore)}</s>} {formatPrice(priceOf(p))} EGP</span> <span className="muted">· {p.style}</span>
        </p>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => decide('Done', 'Approved')}><Icon name="check" size={18} />{t('Approve')}</button>
          <button className="btn" onClick={() => decide('Redo', 'Sent for redo')}><Icon name="redo" size={18} />{t('Redo')}</button>
          <button className="btn btn-ghost" onClick={() => decide('ignore', 'Skipped')}><Icon name="skip" size={18} />{t('Skip')}</button>
        </div>
      </div>
    </article>
  )
}

/** Finished posters waiting for a decision: approve, redo or skip, without opening each one. */
export function ReviewView({ data, onOpen }: { data: Data; onOpen: (id: string) => void }) {
  const posts = data.posts.filter((p) => stageOf(p) === 'review')
  if (!posts.length) return <div className="view"><Empty icon="review" text={t('Nothing to review. New posters will show up here.')} /></div>
  return (
    <div className="view">
      <div className="cards">{posts.map((p) => <ReviewCard key={p.id} post={p} onOpen={onOpen} />)}</div>
    </div>
  )
}
