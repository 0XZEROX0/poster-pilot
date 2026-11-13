import { useState } from 'react'
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
  const [style, setStyle] = useState('')
  const posts = data.posts.filter((p) => stageOf(p) === 'review')
  if (!posts.length) return <div className="view"><Empty icon="review" text={t('Nothing to review. New posters will show up here.')} /></div>
  const counts = new Map<string, number>()
  for (const p of posts) counts.set(p.style, (counts.get(p.style) ?? 0) + 1)
  // A style whose last poster was just decided falls back to all styles.
  const active = counts.has(style) ? style : ''
  const shown = active ? posts.filter((p) => p.style === active) : posts
  return (
    <div className="view">
      {counts.size > 1 && (
        <div className="filters" role="group" aria-label={t('Style')}>
          <button className={active ? 'filter' : 'filter on'} aria-pressed={!active} onClick={() => setStyle('')}>{t('All')} <i>{posts.length}</i></button>
          {[...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([name, n]) => (
            <button key={name} className={active === name ? 'filter on' : 'filter'} aria-pressed={active === name} onClick={() => setStyle(name)}>{name || t('No style')} <i>{n}</i></button>
          ))}
        </div>
      )}
      <div className="cards">{shown.map((p) => <ReviewCard key={p.id} post={p} onOpen={onOpen} />)}</div>
    </div>
  )
}
