import { useRef, useState } from 'react'
import { driveThumb, KIND_LABEL } from '../data/logic'
import { checkFile, isVideoFile, MAX_PHOTOS, mediaUploads, uploadMedia, videoSeconds, type MediaProblem } from '../data/media'
import type { PostKind, PostMedia, PostPlaces } from '../data/types'
import { t, tn } from '../i18n'
import { Icon } from './ui'

// Text, photo and video posts: written and uploaded in the app instead of a product poster.

export const KINDS: { kind: '' | PostKind; label: string; icon: string }[] = [
  { kind: '', label: 'Offer', icon: 'offer' },
  { kind: 'text', label: 'Text', icon: 'text' },
  { kind: 'image', label: 'Photos', icon: 'image' },
  { kind: 'video', label: 'Video', icon: 'video' },
]

/** Product offer, or a text, photo or video post. */
export function KindPicker({ value, onChange }: { value: '' | PostKind; onChange: (k: '' | PostKind) => void }) {
  return (
    <div className="seg kind-seg" role="group" aria-label={t('Kind of post')}>
      {KINDS.map((k) => (
        <button key={k.kind} type="button" className={value === k.kind ? 'on' : ''} aria-pressed={value === k.kind} onClick={() => onChange(k.kind)}>
          <Icon name={k.icon} size={16} />{t(k.label)}
        </button>
      ))}
    </div>
  )
}

const PLACES: { value: PostPlaces; label: string }[] = [
  { value: 'fb+ig', label: 'Facebook + Instagram' },
  { value: 'fb', label: 'Facebook only' },
  { value: 'ig', label: 'Instagram only' },
]

/** Where the post goes. A text post goes to Facebook only, and says why. */
export function PlacesPicker({ kind, value, onChange, disabled }: { kind: PostKind; value: PostPlaces; onChange: (p: PostPlaces) => void; disabled?: boolean }) {
  if (kind === 'text') {
    return (
      <div className="field-note">
        <span className="label">{t('Where it goes')}</span>
        <p className="hint"><b>{t('Facebook only.')}</b> {t('Instagram does not allow a post without a photo or video.')}</p>
      </div>
    )
  }
  return (
    <label>
      <span>{t('Where it goes')}</span>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as PostPlaces)}>
        {PLACES.map((p) => <option key={p.value} value={p.value}>{t(p.label)}</option>)}
      </select>
    </label>
  )
}

const PROBLEM_TEXT: Record<MediaProblem, string> = {
  type: 'Only JPEG, PNG or WebP photos and MP4 or MOV videos.',
  size: 'Too big: photos up to 30 MB, videos up to 300 MB.',
  short: 'Instagram needs a video of at least 3 seconds.',
  long: 'Instagram takes videos up to 15 minutes.',
  failed: 'The upload did not work. Check the connection and try again.',
  'no-engine': 'Uploading needs the engine (n8n), which this copy of the app cannot reach.',
}

type Sending = { name: string; share: number }

/**
 * The photos (1 to 10) or the video of a post: shows what is there, sends new files straight to Google Drive with a
 * progress bar, and lets the person remove or reorder photos.
 */
export function MediaPicker({ kind, toInstagram, value, onChange, disabled }: { kind: 'image' | 'video'; toInstagram: boolean; value: PostMedia[]; onChange: (m: PostMedia[]) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [sending, setSending] = useState<Sending | null>(null)
  const [problem, setProblem] = useState('')
  const room = kind === 'video' ? 1 : MAX_PHOTOS - value.length
  const can = mediaUploads()

  async function send(files: File[]) {
    setProblem('')
    let list = value
    for (const file of files) {
      if (kind === 'image' && list.length >= MAX_PHOTOS) { setProblem(tn('Up to %n photos.', { n: MAX_PHOTOS })); break }
      const bad = checkFile(file) || (kind === 'video' ? (isVideoFile(file) ? '' : 'type') : (isVideoFile(file) ? 'type' : ''))
      if (bad) { setProblem(t(PROBLEM_TEXT[bad])); continue }
      if (kind === 'video' && toInstagram) {
        const s = await videoSeconds(file)
        if (s && s < 3) { setProblem(t(PROBLEM_TEXT.short)); continue }
        if (s > 15 * 60) { setProblem(t(PROBLEM_TEXT.long)); continue }
      }
      setSending({ name: file.name, share: 0 })
      try {
        const m = await uploadMedia(file, toInstagram, (share) => setSending({ name: file.name, share }))
        list = kind === 'video' ? [m] : [...list, m]
        onChange(list)
      } catch (e) {
        const msg = (e as Error).message
        setProblem(msg === 'no-engine' ? t(PROBLEM_TEXT['no-engine']) : `${t(PROBLEM_TEXT.failed)} (${msg})`)
      }
    }
    setSending(null)
  }
  const move = (i: number, by: number) => {
    const next = value.slice()
    const [m] = next.splice(i, 1)
    next.splice(Math.max(0, Math.min(next.length, i + by)), 0, m)
    onChange(next)
  }

  return (
    <div className="media-picker">
      <span className="label">{t(kind === 'video' ? 'Video' : 'Photos')}{kind === 'image' && <span className="muted small"> · {value.length}/{MAX_PHOTOS}</span>}</span>
      {value.length > 0 && (
        <div className="media-grid">
          {value.map((m, i) => (
            <figure key={m.id} className="media-tile">
              <img src={driveThumb(m.id, 300)} alt="" referrerPolicy="no-referrer" loading="lazy" />
              {m.type === 'video' && <span className="media-play"><Icon name="play" size={22} /></span>}
              {!disabled && (
                <span className="media-tools">
                  {kind === 'image' && i > 0 && <button type="button" onClick={() => move(i, -1)} aria-label={t('Move earlier')}><Icon name="left" size={14} /></button>}
                  {kind === 'image' && i < value.length - 1 && <button type="button" onClick={() => move(i, 1)} aria-label={t('Move later')}><Icon name="right" size={14} /></button>}
                  <button type="button" onClick={() => onChange(value.filter((x) => x !== m))} aria-label={t('Remove')}><Icon name="close" size={14} /></button>
                </span>
              )}
            </figure>
          ))}
        </div>
      )}
      {sending && (
        <div className="media-sending" role="status">
          <span className="small" dir="auto">{t('Uploading')} {sending.name}… {Math.round(sending.share * 100)}%</span>
          <progress max={1} value={sending.share} />
        </div>
      )}
      {!disabled && room > 0 && !sending && (
        <button type="button" className="btn" disabled={!can} onClick={() => input.current?.click()}>
          <Icon name={kind === 'video' ? 'video' : 'image'} size={18} />
          {t(kind === 'video' ? (value.length ? 'Change the video' : 'Upload a video') : value.length ? 'Add photos' : 'Upload photos')}
        </button>
      )}
      {!disabled && kind === 'video' && value.length > 0 && !sending && (
        <button type="button" className="btn" disabled={!can} onClick={() => input.current?.click()}><Icon name="video" size={18} />{t('Change the video')}</button>
      )}
      <input ref={input} type="file" hidden multiple={kind === 'image'} accept={kind === 'video' ? 'video/mp4,video/quicktime' : 'image/jpeg,image/png,image/webp'}
        onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ''; if (files.length) void send(files) }} />
      <p className="hint">
        {problem ? <b className="bad">{problem}</b> : !can ? t(PROBLEM_TEXT['no-engine']) : t(kind === 'video'
          ? 'MP4 or MOV, up to 300 MB. On Instagram it goes out as a Reel (3 seconds to 15 minutes; upright 9:16 looks best).'
          : 'Up to 10 photos: more than one becomes an album on Facebook and a carousel on Instagram. Photos are sent as JPEG; for Instagram, very tall or very wide photos get white bars.')}
      </p>
    </div>
  )
}

/** What is missing before a text, photo or video post can be saved, or ''. */
export function customProblem(kind: PostKind, caption: string, media: PostMedia[]): string {
  if (kind === 'text' && !caption.trim()) return 'Write the text of the post.'
  if (kind === 'image' && !media.some((m) => m.type === 'image')) return 'Upload at least one photo.'
  if (kind === 'video' && !media.some((m) => m.type === 'video')) return 'Upload the video.'
  return ''
}

/** "Text post", "Photo post (3)", "Video post". */
export function kindText(kind: PostKind, media?: PostMedia[]): string {
  const n = (media ?? []).length
  return t(KIND_LABEL[kind]) + (kind === 'image' && n > 1 ? ` (${n})` : '')
}

