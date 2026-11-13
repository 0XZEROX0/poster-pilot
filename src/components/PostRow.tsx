import { formatPrice, hasOffer, priceOf, problemOf, stageOf, titleOf, whenOf } from '../data/logic'
import type { Post } from '../data/types'
import { t } from '../i18n'
import { Poster } from './Poster'
import { Chip, Icon, dayLabel, timeLabel } from './ui'

/** A post's state as one small coloured label. */
export function StageChip({ post }: { post: Post }) {
  const stage = stageOf(post)
  const when = whenOf(post)
  if (stage === 'posted') return <Chip tone="good">{t('Published')}</Chip>
  if (stage === 'fix') return <Chip tone="bad">{problemOf(post)?.text.slice(0, 28)}</Chip>
  if (stage === 'building') return <Chip tone="info">{t('Being built')}</Chip>
  if (stage === 'skipped') return <Chip>{t('Skipped')}</Chip>
  if (stage === 'scheduled' && post.feedback === 'Cancel') return <Chip tone="warn">{t('Cancelling the schedule')}</Chip>
  if (stage === 'scheduled') return when && post.fbStatus === 'Scheduled' ? <Chip tone="good">{dayLabel(when.date)} · {timeLabel(when.time)}</Chip> : <Chip tone="warn">{t(when ? 'Being scheduled' : 'Needs a time')}</Chip>
  return <Chip tone="warn">{t('To review')}</Chip>
}

/** One post as a compact line: small poster, name, price and state. Opens the post when tapped. */
export function PostRow({ post, onOpen }: { post: Post; onOpen: (id: string) => void }) {
  return (
    <button className="row" onClick={() => onOpen(post.id)}>
      <Poster post={post} small />
      <span className="row-main">
        <span className="row-title" dir="auto">{titleOf(post)}</span>
        <span className="row-sub">
          <span className="price" dir="ltr">
            {hasOffer(post) && <s>{formatPrice(post.priceBefore)}</s>} {formatPrice(priceOf(post))} EGP
          </span>
          <StageChip post={post} />
        </span>
      </span>
    </button>
  )
}

/** One post as a small card: poster, name, price and its time or state. Opens the post when tapped. */
export function PostCard({ post, onOpen }: { post: Post; onOpen: (id: string) => void }) {
  const when = whenOf(post)
  const posted = stageOf(post) === 'posted'
  return (
    <button className="card card-sm" onClick={() => onOpen(post.id)}>
      <Poster post={post} />
      <span className="card-body">
        <span className="card-title" dir="auto">{titleOf(post)}</span>
        <span className="price" dir="ltr">
          {hasOffer(post) && <s>{formatPrice(post.priceBefore)}</s>} {formatPrice(priceOf(post))} EGP
        </span>
        {posted && when ? <span className="card-when"><Icon name="posted" size={15} />{timeLabel(when.time)}</span> : <StageChip post={post} />}
      </span>
    </button>
  )
}
