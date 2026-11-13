import { useCallback, useEffect, useRef, useState } from 'react'
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

const MODE_KEY = 'posterpilot.review'
const savedMode = (): 'cards' | 'swipe' => {
  try {
    return localStorage.getItem(MODE_KEY) === 'swipe' ? 'swipe' : 'cards'
  } catch {
    return 'cards'
  }
}

type Swipe = 'up' | 'left' | 'right'
const SWIPES: Record<Swipe, { feedback: 'Done' | 'Redo next image' | 'ignore'; label: string; done: string; icon: string }> = {
  up: { feedback: 'Done', label: 'Approve', done: 'Approved', icon: 'check' },
  left: { feedback: 'Redo next image', label: 'Redo with next photo', done: 'Sent for redo', icon: 'redo' },
  right: { feedback: 'ignore', label: 'Skip', done: 'Skipped', icon: 'skip' },
}
/** How far a card has to travel, in pixels, before letting go counts as a decision. */
const SWIPE_AT = 90

/** One poster at a time: swipe up to approve, left to redo with the next photo, right to skip. */
function SwipeDeck({ posts, onOpen }: { posts: Post[]; onOpen: (id: string) => void }) {
  const [move, setMove] = useState<{ x: number; y: number } | null>(null)
  const [leaving, setLeaving] = useState<Swipe | null>(null)
  const moved = useRef(false)
  const top = posts[0]
  const aim = (x: number, y: number): Swipe | null => (y < -SWIPE_AT && -y > Math.abs(x) ? 'up' : x < -SWIPE_AT ? 'left' : x > SWIPE_AT ? 'right' : null)
  const toward = leaving ?? (move ? aim(move.x, move.y) : null)

  const decide = useCallback((dir: Swipe) => {
    if (!top || leaving) return
    setLeaving(dir)
    // The card flies off first, then the decision is saved and the next card takes its place.
    setTimeout(() => {
      backend.updatePost(top.id, { feedback: SWIPES[dir].feedback }).then(() => showToast(t(SWIPES[dir].done)))
      setLeaving(null)
      setMove(null)
    }, 180)
  }, [top, leaving])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as Element).closest('input, textarea, select, .sheet')) return
      const dir = e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowLeft' ? 'left' : e.key === 'ArrowRight' ? 'right' : null
      if (!dir) return
      e.preventDefault()
      decide(dir)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [decide])

  function start(e: React.PointerEvent) {
    if (e.button !== 0 || leaving) return
    const sx = e.clientX, sy = e.clientY
    let last = { x: 0, y: 0 }
    moved.current = false
    const onMove = (ev: PointerEvent) => {
      last = { x: ev.clientX - sx, y: ev.clientY - sy }
      if (Math.hypot(last.x, last.y) > 6) moved.current = true
      if (moved.current) setMove(last)
    }
    const end = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      const dir = ev.type === 'pointerup' ? aim(last.x, last.y) : null
      if (dir) decide(dir)
      else setMove(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  if (!top) return null
  const fly = leaving === 'up' ? 'translate(0, -120vh)' : leaving === 'left' ? 'translate(-120vw, 0) rotate(-20deg)' : leaving === 'right' ? 'translate(120vw, 0) rotate(20deg)' : ''
  const style = leaving ? { transform: fly, transition: 'transform 0.2s ease-in' } : move ? { transform: `translate(${move.x}px, ${move.y}px) rotate(${move.x / 22}deg)` } : { transition: 'transform 0.2s' }
  return (
    <div className="deck">
      <p className="deck-count muted small">{posts.length} {t('left to review')}</p>
      <div className="deck-stack">
        {posts[1] && <article className="card deck-card deck-next" aria-hidden="true"><div className="card-poster"><Poster post={posts[1]} /></div></article>}
        <article key={top.id} className="card deck-card" style={style} onPointerDown={start} onDragStart={(e) => e.preventDefault()} onClick={() => !moved.current && onOpen(top.id)}>
          <div className="card-poster"><Poster post={top} /></div>
          <div className="card-body">
            <h3 dir="auto">{titleOf(top)}</h3>
            <p className="price">
              <span dir="ltr">{hasOffer(top) && <s>{formatPrice(top.priceBefore)}</s>} {formatPrice(priceOf(top))} EGP</span> <span className="muted">· {top.style}</span>
            </p>
          </div>
          {toward && <span className={`stamp stamp-${toward}`}><Icon name={SWIPES[toward].icon} size={20} />{t(SWIPES[toward].label)}</span>}
        </article>
      </div>
      <div className="deck-actions">
        <button className="btn" onClick={() => decide('left')}><Icon name="left" size={18} />{t('Redo with next photo')}</button>
        <button className="btn btn-primary" onClick={() => decide('up')}><Icon name="check" size={18} />{t('Approve')}</button>
        <button className="btn" onClick={() => decide('right')}>{t('Skip')}<Icon name="right" size={18} /></button>
      </div>
      <p className="hint deck-hint">{t('Swipe up to approve, left to redo with the next photo, right to skip. Tap the poster to edit.')}</p>
    </div>
  )
}

/** A skipped poster, kept so it can be looked at again and put back. */
function SkippedCard({ post: p, onOpen }: { post: Post; onOpen: (id: string) => void }) {
  return (
    <article className="card">
      <button className="card-poster" onClick={() => onOpen(p.id)} aria-label={t('Edit')}><Poster post={p} /></button>
      <div className="card-body">
        <h3 dir="auto">{titleOf(p)}</h3>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => backend.updatePost(p.id, { feedback: '' }).then(() => showToast(t('Back in review')))}><Icon name="review" size={18} />{t('Back to review')}</button>
        </div>
      </div>
    </article>
  )
}

const SKIPPED = '\u0000skipped'

/** Finished posters waiting for a decision, as cards or one at a time to swipe. */
export function ReviewView({ data, onOpen }: { data: Data; onOpen: (id: string) => void }) {
  const [style, setStyle] = useState('')
  const [mode, setMode] = useState(savedMode)
  const posts = data.posts.filter((p) => stageOf(p) === 'review')
  // Skipped posters that do have a poster: the ones worth a second look.
  const skipped = data.posts.filter((p) => stageOf(p) === 'skipped' && p.posterUrl)
  if (!posts.length && !skipped.length) return <div className="view"><Empty icon="review" text={t('Nothing to review. New posters will show up here.')} /></div>
  const counts = new Map<string, number>()
  for (const p of posts) counts.set(p.style, (counts.get(p.style) ?? 0) + 1)
  // A style whose last poster was just decided falls back to all styles.
  const active = style === SKIPPED ? (skipped.length ? SKIPPED : '') : counts.has(style) ? style : ''
  const shown = active ? posts.filter((p) => p.style === active) : posts
  const pickMode = (next: 'cards' | 'swipe') => {
    setMode(next)
    try {
      localStorage.setItem(MODE_KEY, next)
    } catch {
      // No storage: the choice lasts for this visit.
    }
  }
  return (
    <div className="view">
      <div className="review-bar">
        <div className="filters" role="group" aria-label={t('Style')}>
          <button className={active ? 'filter' : 'filter on'} aria-pressed={!active} onClick={() => setStyle('')}>{t('All')} <i>{posts.length}</i></button>
          {counts.size > 1 && [...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([name, n]) => (
            <button key={name} className={active === name ? 'filter on' : 'filter'} aria-pressed={active === name} onClick={() => setStyle(name)}>{name || t('No style')} <i>{n}</i></button>
          ))}
          {skipped.length > 0 && <button className={active === SKIPPED ? 'filter on' : 'filter'} aria-pressed={active === SKIPPED} onClick={() => setStyle(SKIPPED)}>{t('Skipped')} <i>{skipped.length}</i></button>}
        </div>
        {active !== SKIPPED && (
          <div className="seg">
            <button className={mode === 'cards' ? 'on' : ''} onClick={() => pickMode('cards')}>{t('Cards')}</button>
            <button className={mode === 'swipe' ? 'on' : ''} onClick={() => pickMode('swipe')}>{t('Swipe')}</button>
          </div>
        )}
      </div>
      {active === SKIPPED ? (
        <div className="cards">{skipped.map((p) => <SkippedCard key={p.id} post={p} onOpen={onOpen} />)}</div>
      ) : !shown.length ? (
        <Empty icon="review" text={t('Nothing to review. New posters will show up here.')} />
      ) : mode === 'swipe' ? (
        <SwipeDeck posts={shown} onOpen={onOpen} />
      ) : (
        <div className="cards">{shown.map((p) => <ReviewCard key={p.id} post={p} onOpen={onOpen} />)}</div>
      )}
    </div>
  )
}
