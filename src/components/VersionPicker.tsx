import { useEffect, useState } from 'react'
import { backend } from '../data/store'
import type { VersionPhotos, WebPhoto } from '../data/types'
import { t } from '../i18n'
import { Icon } from './ui'

/** One version picked from the website photos: its photo and what tells it apart ("Jungle Panda"). */
export type PickedVersion = { src: string; thumb: string; label: string }

/** How long the picker waits for the engine before it says so. */
const PATIENCE = 2 * 60 * 1000

/**
 * New offer, "Versions of one product": shows every photo the website has of the picked product, so the person
 * can tap up to `max` of them. Each tapped photo becomes one version on the poster, with its own name.
 */
export function VersionPicker({ product, max, value, onChange }: { product: string; max: number; value: PickedVersion[]; onChange: (v: PickedVersion[]) => void }) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<VersionPhotos | null>(null)
  const [error, setError] = useState('')
  const [askedAt, setAskedAt] = useState(0)
  const [, tick] = useState(0)

  useEffect(() => {
    if (!open || !askedAt || !backend.versionPhotos) return
    setState(null)
    setError('')
    return backend.versionPhotos(product, setState, setError)
  }, [open, askedAt, product])

  const answered = !!state && state.answered >= state.asked && !!state.choice
  const waiting = open && !answered && !error
  const late = waiting && askedAt > 0 && Date.now() - askedAt > PATIENCE
  useEffect(() => {
    if (!waiting) return
    const id = setInterval(() => tick((n) => n + 1), 5000)
    return () => clearInterval(id)
  }, [waiting])

  if (!backend.versionPhotos) return null

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && !answered) setAskedAt(Date.now())
  }
  const tap = (p: WebPhoto) => {
    const at = value.findIndex((v) => v.src === p.src)
    if (at >= 0) onChange(value.filter((_, i) => i !== at))
    else if (value.length < max) onChange([...value, { src: p.src, thumb: p.thumb || p.src, label: p.label ?? '' }])
  }
  const grid = (photos: WebPhoto[]) => (
    <div className="photo-grid">
      {photos.map((p) => {
        const n = value.findIndex((v) => v.src === p.src)
        return (
          <button key={p.src} type="button" className={`photo-pick${n >= 0 ? ' chosen' : ''}`} onClick={() => tap(p)} aria-pressed={n >= 0} disabled={n < 0 && value.length >= max}>
            <img src={p.thumb || p.src} alt={p.label ?? ''} loading="lazy" referrerPolicy="no-referrer" />
            {n >= 0 && <span className="photo-num">{n + 1}</span>}
            {p.label && <span className="photo-tag" dir="auto">{p.label}</span>}
          </button>
        )
      })}
    </div>
  )

  const c = state?.choice
  let body = null
  if (open) {
    if (error) body = <p className="hint bad">{error}</p>
    else if (waiting) body = <p className="hint">{late ? t('The website check is taking longer than usual. It will show up here when it is done.') : t('Looking for this product on the website…')}</p>
    else if (c?.error) body = <p className="hint">{t('The website did not answer. Try again in a minute.')} <button type="button" className="link" onClick={() => setAskedAt(Date.now())}>{t('Retry')}</button></p>
    else if (c && c.photos.length) {
      body = (
        <>
          <p className="hint">
            {t('Tap the versions to put on the poster, up to')} {max}
            {c.page && <> · <a href={c.page} target="_blank" rel="noreferrer">{c.product || t('Open on the website')}</a></>}
          </p>
          {grid(c.photos)}
          {!!c.near?.length && (
            <>
              <p className="hint">{t('Other products like it on the website:')}</p>
              {c.near.map((n) => (
                <div key={n.page || n.product} className="photo-near">
                  <p className="small" dir="auto">{n.page ? <a href={n.page} target="_blank" rel="noreferrer">{n.product}</a> : n.product}</p>
                  {grid(n.photos)}
                </div>
              ))}
            </>
          )}
        </>
      )
    } else if (c && c.near?.length) {
      body = (
        <>
          <p className="hint">{t('This exact product is not on the website. These are the closest ones:')}</p>
          {c.near.map((n) => (
            <div key={n.page || n.product} className="photo-near">
              <p className="small" dir="auto">{n.page ? <a href={n.page} target="_blank" rel="noreferrer">{n.product}</a> : n.product}</p>
              {grid(n.photos)}
            </div>
          ))}
        </>
      )
    } else body = <p className="hint">{t('The website has no photos of this product.')}</p>
  }

  return (
    <div className="photo-picker">
      <button type="button" className="btn btn-ghost btn-small" onClick={toggle} aria-expanded={open}>
        <Icon name="image" size={16} />{open ? t('Hide website photos') : t('Choose the versions from the website photos')}
      </button>
      {body}
      {value.length > 0 && (
        <div className="versions">
          {value.map((v, i) => (
            <div key={v.src} className="version-row">
              <img src={v.thumb} alt="" referrerPolicy="no-referrer" />
              <input dir="auto" value={v.label} placeholder={t('Colour or name, e.g. Jungle Panda')} aria-label={`${t('Version')} ${i + 1}`}
                onChange={(e) => onChange(value.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
              <button type="button" className="icon-btn" onClick={() => onChange(value.filter((_, k) => k !== i))} aria-label={t('Delete')}><Icon name="close" size={16} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
