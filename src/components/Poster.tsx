import { useState } from 'react'
import { DEMO_POSTER } from '../data/demo'
import { formatPrice, hasOffer, anyProblemOf, isBuilding, previewUrl, priceOf, titleOf } from '../data/logic'
import type { Post } from '../data/types'
import { t } from '../i18n'
import { Icon } from './ui'

/**
 * The poster of a post, square. Shows the real image when it can be loaded; a drawn stand-in for
 * the demo and for a poster the browser may not open; and a "building" or "problem" tile otherwise.
 */
export function Poster({ post, small = false }: { post: Post; small?: boolean }) {
  const [failed, setFailed] = useState(false)
  const problem = anyProblemOf(post)
  const building = isBuilding(post)
  const cls = `poster${small ? ' poster-small' : ''}`

  if (!building && !post.posterUrl && problem) {
    return (
      <div className={`${cls} poster-problem`}>
        <Icon name="fix" size={small ? 22 : 40} />
        {!small && <span>{problem.text}</span>}
      </div>
    )
  }
  if (building) {
    return (
      <div className={`${cls} poster-building`}>
        <Icon name="image" size={small ? 22 : 40} />
        {!small && <span>{t('Building the poster…')}</span>}
      </div>
    )
  }
  if (post.posterUrl !== DEMO_POSTER && !failed) {
    return (
      <div className={cls}>
        <img src={previewUrl(post.posterUrl, small ? 300 : 900)} alt={titleOf(post)} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      </div>
    )
  }
  const friday = /friday/i.test(post.style)
  return (
    <div className={`${cls} poster-drawn${friday ? ' poster-friday' : ''}`} dir="ltr" aria-label={titleOf(post)}>
      <span className="poster-brand">STATIC</span>
      {!small && (
        <>
          <span className="poster-name">{titleOf(post)}</span>
          <span className="poster-price">
            {hasOffer(post) && <s>{formatPrice(post.priceBefore)}</s>}
            <b>{formatPrice(priceOf(post))}</b> EGP
          </span>
        </>
      )}
    </div>
  )
}
