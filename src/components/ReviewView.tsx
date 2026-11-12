import { formatPrice, hasOffer, priceOf, stageOf, titleOf } from '../data/logic'
import { backend } from '../data/store'
import type { Data } from '../data/types'
import { t } from '../i18n'
import { Poster } from './Poster'
import { Empty, Icon, showToast } from './ui'

/** Finished posters waiting for a decision: approve, redo or skip, without opening each one. */
export function ReviewView({ data, onOpen }: { data: Data; onOpen: (id: string) => void }) {
  const posts = data.posts.filter((p) => stageOf(p) === 'review')
  if (!posts.length) return <div className="view"><Empty icon="review" text={t('Nothing to review. New posters will show up here.')} /></div>
  const decide = (id: string, feedback: 'Done' | 'Redo' | 'ignore', message: string) => backend.updatePost(id, { feedback }).then(() => showToast(t(message)))
  return (
    <div className="view">
      <div className="cards">
        {posts.map((p) => (
          <article key={p.id} className="card">
            <button className="card-poster" onClick={() => onOpen(p.id)} aria-label={t('Edit')}>
              <Poster post={p} />
            </button>
            <div className="card-body">
              <h3 dir="auto">{titleOf(p)}</h3>
              <p className="price">
                <span dir="ltr">{hasOffer(p) && <s>{formatPrice(p.priceBefore)}</s>} {formatPrice(priceOf(p))} EGP</span> <span className="muted">· {p.style}</span>
              </p>
              <div className="actions">
                <button className="btn btn-primary" onClick={() => decide(p.id, 'Done', 'Approved')}><Icon name="check" size={18} />{t('Approve')}</button>
                <button className="btn" onClick={() => decide(p.id, 'Redo', 'Sent for redo')}><Icon name="redo" size={18} />{t('Redo')}</button>
                <button className="btn btn-ghost" onClick={() => decide(p.id, 'ignore', 'Skipped')}><Icon name="skip" size={18} />{t('Skip')}</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
