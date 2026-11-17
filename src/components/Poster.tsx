import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { DEMO_POSTER } from '../data/demo'
import { driveThumb, formatPrice, hasOffer, anyProblemOf, isBuilding, previewUrl, priceOf, titleOf } from '../data/logic'
import type { Post } from '../data/types'
import { t } from '../i18n'
import { Icon } from './ui'

/**
 * The poster of a post, square. Shows the real image when it can be loaded; a drawn stand-in for
 * the demo and for a poster the browser may not open; and a "building" or "problem" tile otherwise.
 */
/** The design alone on the whole screen. A tap, or Escape, closes it. */
function FullScreen({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={alt} onClick={(e) => { e.stopPropagation(); onClose() }}>
      <img src={src} alt={alt} referrerPolicy="no-referrer" />
      <span className="lightbox-close"><Icon name="close" size={22} /></span>
    </div>,
    document.body,
  )
}

/** A text, photo or video post: its first photo (or the video's frame, with a play sign), or its text. */
function CustomTile({ post, small, zoom }: { post: Post; small: boolean; zoom: boolean }) {
  const [full, setFull] = useState(false)
  const [failed, setFailed] = useState(false)
  const cls = `poster poster-custom${small ? ' poster-small' : ''}`
  const first = (post.media ?? [])[0]
  if (post.kind === 'text' || !first) {
    return (
      <div className={`${cls} poster-text`} aria-label={titleOf(post)}>
        <Icon name={post.kind === 'video' ? 'video' : post.kind === 'image' ? 'image' : 'text'} size={small ? 20 : 28} />
        {!small && <span dir="auto">{(post.caption || '').slice(0, 280) || t(post.kind === 'text' ? 'Text post' : 'Nothing uploaded yet')}</span>}
      </div>
    )
  }
  const count = (post.media ?? []).length
  return (
    <div className={cls}>
      {failed ? <span className="poster-text"><Icon name={first.type === 'video' ? 'video' : 'image'} size={small ? 20 : 32} /></span>
        : <img src={driveThumb(first.id, small ? 300 : 900)} alt={titleOf(post)} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />}
      {first.type === 'video' && <span className="media-play"><Icon name="play" size={small ? 16 : 28} /></span>}
      {count > 1 && <span className="media-count">1/{count}</span>}
      {zoom && !failed && (
        <span className="poster-zoom" role="button" tabIndex={0} aria-label={t('Full screen')} onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setFull(true) }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); setFull(true) } }}>
          <Icon name="expand" size={18} />
        </span>
      )}
      {full && <FullScreen src={driveThumb(first.id, 2000)} alt={titleOf(post)} onClose={() => setFull(false)} />}
    </div>
  )
}

export function Poster({ post, small = false, zoom = false }: { post: Post; small?: boolean; zoom?: boolean }) {
  if (post.kind) return <CustomTile post={post} small={small} zoom={zoom} />
  return <ProductPoster post={post} small={small} zoom={zoom} />
}

function ProductPoster({ post, small, zoom }: { post: Post; small: boolean; zoom: boolean }) {
  const [failed, setFailed] = useState(false)
  const [full, setFull] = useState(false)
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
        {zoom && (
          // A span, because the poster often sits inside a button already.
          <span className="poster-zoom" role="button" tabIndex={0} aria-label={t('Full screen')} onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setFull(true) }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); setFull(true) } }}>
            <Icon name="expand" size={18} />
          </span>
        )}
        {full && <FullScreen src={previewUrl(post.posterUrl, 2000)} alt={titleOf(post)} onClose={() => setFull(false)} />}
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
