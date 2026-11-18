import { useEffect, useRef, useState } from 'react'
import { addMinutes, cairoNow, driveThumb, KIND_LABEL, whenOf } from '../data/logic'
import { checkFile, isVideoFile, MAX_PHOTOS, mediaUploads, uploadMedia, videoSeconds, type MediaProblem } from '../data/media'
import { allowed, backend, myId } from '../data/store'
import type { Data, NewPost, PostKind, PostMedia, PostPlaces } from '../data/types'
import { t, tn } from '../i18n'
import { Sheet } from './Sheet'
import { dayLabel, Icon, showToast, timeLabel } from './ui'

// Text, photo and video posts: written and uploaded in the app instead of a product poster.

export const KINDS: { kind: PostKind; label: string; icon: string }[] = [
  { kind: 'text', label: 'Text', icon: 'text' },
  { kind: 'image', label: 'Photos', icon: 'image' },
  { kind: 'video', label: 'Video', icon: 'video' },
]

/** A text, photo or video post. */
export function KindPicker({ value, onChange }: { value: PostKind; onChange: (k: PostKind) => void }) {
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


/** Facebook needs some notice before a scheduled post goes out (as in the Planner). */
const NOTICE_MIN = 20

/** The first free quarter hour on `day` that Facebook still takes, from 17:00 (or from now, today). */
function freeTimeOn(day: string, data: Data): string {
  const now = cairoNow()
  if (day < now.date) return ''
  const taken = new Set(data.posts.map(whenOf).filter((w) => w?.date === day).map((w) => w!.time))
  for (let mins = 17 * 60; mins < 24 * 60; mins += 15) {
    const time = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
    if (day === now.date && time <= addMinutes(now.time, NOTICE_MIN)) continue
    if (!taken.has(time)) return time
  }
  return ''
}

/**
 * The Planner's "New post": a text, photo or video post, written and uploaded here, then scheduled for a date and
 * time or posted at once. Only people who may schedule see it; the post is approved as it is made (no Review).
 */
export function NewCustomPostSheet({ data, day, onClose }: { data: Data; day: string; onClose: () => void }) {
  const [saved] = useState(readDraft)
  const [kind, setKind] = useState<PostKind>(saved?.kind ?? (mediaUploads() ? 'image' : 'text'))
  const [caption, setCaption] = useState(saved?.caption ?? '')
  const [media, setMedia] = useState<PostMedia[]>(saved?.media ?? [])
  const [places, setPlaces] = useState<PostPlaces>(saved?.places ?? 'fb+ig')
  const [postDate, setPostDate] = useState(saved?.postDate || day)
  const [postTime, setPostTime] = useState(() => saved?.postTime || freeTimeOn(day, data))
  const [restored, setRestored] = useState(!!saved)
  const started = !!caption.trim() || media.length > 0
  // Kept in this browser as it is typed, so leaving the app (or the phone closing it) loses nothing.
  useEffect(() => {
    if (started) writeDraft({ kind, caption, media, places, postDate, postTime, open: true })
    else clearDraft()
  }, [started, kind, caption, media, places, postDate, postTime])
  const close = () => {
    // Closed on purpose: the text stays for the next "New post", but the window does not open by itself.
    const d = readDraft()
    if (d) writeDraft({ ...d, open: false })
    onClose()
  }
  const startFresh = () => {
    clearDraft()
    setKind(mediaUploads() ? 'image' : 'text'); setCaption(''); setMedia([]); setPlaces('fb+ig')
    setPostDate(day); setPostTime(freeTimeOn(day, data)); setRestored(false); setError(''); setConfirmNow(false)
  }
  const [confirmNow, setConfirmNow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const toInstagram = kind !== 'text' && places !== 'fb'
  const where = (kind === 'text' ? ['fb'] : places === 'fb+ig' ? ['fb', 'ig'] : [places]).map((w) => (w === 'fb' ? 'Facebook' : 'Instagram')).join(t(' and '))

  const pickKind = (k: PostKind) => {
    setKind(k)
    // Photos and a video do not mix: a new kind starts with no files.
    if (k !== kind) setMedia([])
    setError('')
    setConfirmNow(false)
  }
  function ready(): boolean {
    const missing = customProblem(kind, caption, media)
    if (missing) { setError(t(missing)); return false }
    return true
  }
  async function create(now: boolean) {
    if (!ready()) return
    const at = cairoNow()
    if (!now) {
      if (!postDate || !postTime) return setError(t('Pick a date and a time.'))
      if (postDate < at.date || (postDate === at.date && postTime <= addMinutes(at.time, NOTICE_MIN))) return setError(tn('Facebook needs at least %n minutes of notice. Pick a later time, or use Post now.', { n: NOTICE_MIN }))
    }
    setBusy(true)
    try {
      const draft: NewPost = {
        kind, caption, items: [], company: '', priceBefore: '', priceAfter: '', style: '', details: '', captionStyle: '', postDate: '', postTime: '',
        ...(kind === 'text' ? { places: 'fb' as const } : { places, media }),
      }
      const id = await backend.addPost(draft)
      // The database takes a new post only without a time; approving it and its time (or Post now) follow at once.
      await backend.updatePost(id, now ? { feedback: 'Done', postNow: 'yes', postDate: at.date, postTime: at.time } : { feedback: 'Done', postDate, postTime })
      clearDraft()
      showToast(now ? `${t('Posting now on')} ${where}` : `${t('Set for')} ${dayLabel(postDate)} · ${timeLabel(postTime)}`)
      onClose()
    } catch {
      showToast(t('Could not save the post. Try again.'))
      setBusy(false)
    }
  }

  const footer = confirmNow ? (
    <div className="confirm-post" role="alertdialog" aria-labelledby="confirm-new-q">
      <p id="confirm-new-q"><b>{t('Publish now on')} {where}?</b><br /><span className="muted small">{t('It goes out within a minute and cannot be taken back from here.')}</span></p>
      <div className="confirm-post-actions">
        <button className="btn btn-primary" disabled={busy} onClick={() => create(true)}><Icon name="send" size={18} />{t('Yes, post now')}</button>
        <button className="btn btn-ghost" disabled={busy} onClick={() => setConfirmNow(false)}>{t('Cancel')}</button>
      </div>
    </div>
  ) : (
    <>
      <button className="btn btn-primary" disabled={busy} onClick={() => create(false)}><Icon name="calendar" size={18} />{t('Schedule')}</button>
      <button className="btn" disabled={busy} onClick={() => { if (ready()) setConfirmNow(true) }}><Icon name="send" size={18} />{t('Post now')}</button>
    </>
  )

  return (
    <Sheet title={t('New post')} onClose={close} footer={footer}>
      <div className="form narrow">
        {restored && (
          <p className="hint">
            {t('Your unfinished post is back.')}{' '}
            <button type="button" className="linkish" onClick={startFresh}>{t('Start fresh')}</button>
          </p>
        )}
        <KindPicker value={kind} onChange={pickKind} />
        {kind !== 'text' && <MediaPicker kind={kind} toInstagram={toInstagram} value={media} onChange={(m) => { setMedia(m); setError('') }} />}
        <label>
          <span>{t(kind === 'text' ? 'Text' : 'Caption')}</span>
          <textarea dir="auto" rows={kind === 'text' ? 8 : 6} value={caption} placeholder={t(kind === 'text' ? 'What should the post say?' : 'Optional')} onChange={(e) => { setCaption(e.target.value); setError('') }} />
        </label>
        <PlacesPicker kind={kind} value={places} onChange={(p) => { setPlaces(p); setConfirmNow(false) }} />
        <div className="two">
          <label><span>{t('Date')}</span><input type="date" value={postDate} min={cairoNow().date} onChange={(e) => { setPostDate(e.target.value); setError('') }} /></label>
          <label><span>{t('Time')}</span><input type="time" value={postTime} onChange={(e) => { setPostTime(e.target.value); setError('') }} /></label>
        </div>
        <p className="hint">{tn('Schedule sends it at that date and time (at least %n minutes from now). Post now sends it at once.', { n: NOTICE_MIN })}</p>
        {error && <p className="hint"><b className="bad">{error}</b></p>}
      </div>
    </Sheet>
  )
}

type Draft = { kind: PostKind; caption: string; media: PostMedia[]; places: PostPlaces; postDate: string; postTime: string; open: boolean }
const draftKey = () => `posterpilot.newPostDraft.${myId() || 'demo'}`

/** The unfinished "New post" kept in this browser, or null. */
export function readDraft(): Draft | null {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey()) ?? 'null') as Draft | null
    return d && typeof d.caption === 'string' && Array.isArray(d.media) ? d : null
  } catch {
    return null
  }
}
function writeDraft(d: Draft) {
  try { localStorage.setItem(draftKey(), JSON.stringify(d)) } catch { /* only kept when storage works */ }
}
function clearDraft() {
  try { localStorage.removeItem(draftKey()) } catch { /* nothing kept */ }
}
/** True when "New post" was open with something in it when the app was left: the Planner opens it again. */
export const draftWasOpen = () => !!readDraft()?.open

/** True when this person may make text, photo and video posts (the people who schedule). */
export const mayMakeCustom = () => allowed('schedule')
