import { KIND_LABEL, titleOf } from './logic'
import type { LogChange, LogEntry, Post } from './types'

// The history of every offer and post: what happened, who did it and when.
// The app writes an entry together with each change it makes (same database step, so a change that
// is refused leaves no entry). The engine (n8n) adds entries for what happened in the sheet and in
// the poster, scheduling and price workflows.

/** What the app may write. The database rules hold the same list. */
export const APP_ACTS = [
  'created', 'edited', 'offer.approved', 'offer.rejected', 'offer.resubmitted', 'design.approved', 'design.redo', 'design.redo_next',
  'design.skipped', 'design.back', 'schedule.set', 'schedule.cleared', 'schedule.cancel', 'schedule.postnow', 'problem.ignored', 'prices.recheck', 'deleted',
  'social.delete',
] as const

/** English text for each kind of entry, app and engine. */
export const ACT_TEXT: Record<string, string> = {
  created: 'Created',
  edited: 'Edited',
  'offer.approved': 'Offer approved',
  'offer.rejected': 'Offer sent back',
  'offer.resubmitted': 'Offer sent for approval again',
  'offer.reset': 'Offer approval cleared',
  'design.approved': 'Design approved',
  'design.redo': 'Sent for a new poster',
  'design.redo_next': 'Sent for a new poster with the next photo',
  'design.skipped': 'Skipped',
  'design.back': 'Back to review',
  'schedule.set': 'Post date and time set',
  'schedule.cleared': 'Post date and time removed',
  'schedule.cancel': 'Asked to cancel the schedule',
  'schedule.postnow': 'Asked to post now on Facebook and Instagram',
  'problem.ignored': 'Problem ignored',
  'prices.recheck': 'Asked to check competitor prices again',
  'prices.checked': 'Competitor prices checked',
  deleted: 'Deleted in the app',
  'social.delete': 'Asked to delete from Facebook and Instagram',
  'fb.removed': 'Removed from Facebook',
  'ig.removed': 'Removed from Instagram',
  'takedown.error': 'Could not remove from Facebook or Instagram',
  'sheet.added': 'Written into the sheet',
  'poster.building': 'Poster being made',
  'poster.built': 'Poster ready',
  'poster.failed': 'Poster problem',
  'fb.scheduled': 'Scheduled on Facebook',
  'fb.published': 'Published on Facebook',
  'fb.cancelled': 'Taken off the Facebook schedule',
  'fb.error': 'Facebook problem',
  'ig.published': 'Published on Instagram',
  'ig.error': 'Instagram problem',
  'story.made': 'Story picture made',
  'story.fb': 'Story posted on Facebook',
  'story.ig': 'Story posted on Instagram',
  'story.error': 'Story problem',
  removed: 'Row emptied in the sheet',
  'delete.refused': 'Not deleted: it is on the schedule',
  cleared: 'Removed from the sheet',
}

export const FIELD_TEXT: Record<string, string> = {
  items: 'Items', priceBefore: 'Price before', priceAfter: 'Price after', style: 'Style', details: 'Details', caption: 'Caption',
  captionStyle: 'Caption style', postDate: 'Date', postTime: 'Time', photos: 'Photos', layers: 'Place on the poster', story: 'Story', storyDelay: 'Story time',
}

/** The story choice as short text for the history: "Facebook + Instagram", "-" for none, or minutes after the post. */
const storyText = (f: 'story' | 'storyDelay', v: string) => f === 'story'
  ? (v.split('+').map((w) => (w === 'fb' ? 'Facebook' : w === 'ig' ? 'Instagram' : '')).filter(Boolean).join(' + ') || '-')
  : (Number(v) > 0 ? `+${Number(v)} min` : 'same time')

const short = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const itemsText = (items: Post['items']) => items.map((i) => i.name.trim()).filter(Boolean).join(' + ')
const photosText = (items: Post['items']) => items.map((i) => [i.manualPhoto ? 'link' : '', i.nextPhoto ? 'next' : ''].filter(Boolean).join('+') || '-').join(', ')

/** The content fields a person can change, with the before and after as short text. */
export function changesOf(before: Post | undefined, patch: Partial<Post>): LogChange[] {
  const out: LogChange[] = []
  for (const f of ['priceBefore', 'priceAfter', 'style', 'details', 'captionStyle', 'caption'] as const) {
    if (!(f in patch) || patch[f] === undefined) continue
    const from = String(before?.[f] ?? ''), to = String(patch[f] ?? '')
    if (from !== to) out.push({ f, from: short(from), to: short(to) })
  }
  // The story choice. Logged as an edit, so older database rules accept the history line too.
  for (const f of ['story', 'storyDelay'] as const) {
    if (!(f in patch) || patch[f] === undefined) continue
    const from = storyText(f, String(before?.[f] ?? '')), to = storyText(f, String(patch[f] ?? ''))
    if (from !== to) out.push({ f, from, to })
  }
  // A text, photo or video post: its uploaded files and where it goes.
  if (patch.media) {
    const n = (m: Post['media']) => (m ?? []).map((x) => x.id).join(',')
    if (n(before?.media) !== n(patch.media)) out.push({ f: 'media', from: String(before?.media?.length ?? 0), to: String(patch.media.length) })
  }
  if (patch.places !== undefined && patch.places !== (before?.places ?? 'fb+ig')) out.push({ f: 'places', from: before?.places ?? 'fb+ig', to: patch.places })
  // A story designed in the story editor: noted on the story line (the design itself is too long for the history).
  if (patch.storyDesign) out.push({ f: 'story', from: '', to: 'designed in the story editor' })
  if (patch.items) {
    const was = before?.items ?? []
    if (itemsText(was) !== itemsText(patch.items)) out.push({ f: 'items', from: short(itemsText(was)), to: short(itemsText(patch.items)) })
    else if (photosText(was) !== photosText(patch.items) || JSON.stringify(was.map((i) => i.manualPhoto)) !== JSON.stringify(patch.items.map((i) => i.manualPhoto)))
      out.push({ f: 'photos', from: '', to: short(patch.items.map((i) => (i.manualPhoto ? i.manualPhoto : i.nextPhoto ? 'next photo' : '')).filter(Boolean).join(' | ') || '-') })
    // Which product stands in front, in the middle or at the back.
    const layers = (items: Post['items']) => items.map((i) => i.layer || 'auto').join(', ')
    if (itemsText(was) === itemsText(patch.items) && layers(was) !== layers(patch.items)) out.push({ f: 'layers', from: layers(was), to: layers(patch.items) })
  }
  return out
}

/** The history entry for one change made in the app, or null when nothing worth noting changed. */
export function describe(before: Post | undefined, patch: Partial<Post>): Omit<LogEntry, 'id' | 'postId' | 'at' | 'by' | 'byName'> | null {
  const changes = changesOf(before, patch)
  const extra = changes.length ? { changes } : {}
  const wasWhen = [before?.postDate, before?.postTime].filter(Boolean).join(' ')
  const date = patch.postDate ?? before?.postDate ?? ''
  const time = patch.postTime ?? before?.postTime ?? ''
  const nowWhen = [date, time].filter(Boolean).join(' ')
  const moved = ('postDate' in patch || 'postTime' in patch) && wasWhen !== nowWhen
  const whenNote = moved ? (date && time ? { note: nowWhen } : wasWhen ? { note: `${wasWhen} → -` } : {}) : {}
  // "Post now": the time it carries is the moment of the press; the engine writes the real minute it went out.
  if (patch.postNow === 'yes') return { act: 'schedule.postnow', ...(nowWhen ? { note: nowWhen } : {}) }
  if (patch.takeDown === 'asked') return { act: 'social.delete' }
  if ('offer' in patch && patch.offer !== before?.offer) {
    if (patch.offer === 'Approved') return { act: 'offer.approved', ...extra }
    if (patch.offer === 'Rejected') return { act: 'offer.rejected', ...(patch.offerNote ? { note: short(patch.offerNote, 900) } : {}), ...extra }
    return { act: 'offer.resubmitted', ...extra }
  }
  if ('feedback' in patch && patch.feedback !== before?.feedback) {
    const f = patch.feedback
    const act = f === 'Done' ? 'design.approved' : f === 'Redo' ? 'design.redo' : f === 'Redo next image' ? 'design.redo_next' : f === 'ignore' ? 'design.skipped' : f === 'Cancel' ? 'schedule.cancel' : 'design.back'
    // Giving a cancelled post a new time approves it again: the time is the news there.
    if (!(f === 'Done' && before?.feedback === 'Cancel' && moved)) return { act, ...whenNote, ...extra }
  }
  if (moved) return { act: date && time ? 'schedule.set' : 'schedule.cleared', ...whenNote, ...extra }
  if (patch.ignoredProblem && patch.ignoredProblem !== before?.ignoredProblem) return { act: 'problem.ignored', note: short(patch.ignoredProblem, 300) }
  // A missing Price before set aside (logged), or shown again (nothing to log).
  if ('priceIgnored' in patch) return patch.priceIgnored ? { act: 'problem.ignored', note: 'No Price before' } : null
  if (patch.marketAsk) return { act: 'prices.recheck' }
  // Looking at the website photos changes nothing yet; the photo that is then chosen is logged as an edit.
  if (patch.photoAsk) return null
  if (changes.length) return { act: 'edited', changes }
  return null
}

/** The entry for a new post, so its history starts with what it was made from. */
export const describeNew = (p: Pick<Post, 'items' | 'priceBefore' | 'priceAfter' | 'style'> & Partial<Pick<Post, 'kind' | 'caption' | 'variants' | 'title' | 'media'>>) => p.kind
  ? { act: 'created', title: short(titleOf(p), 280), note: KIND_LABEL[p.kind] + (p.media?.length ? ` · ${p.media.length}` : '') }
  : { act: 'created', title: short(itemsText(p.items), 280), note: short([p.priceAfter || p.priceBefore, p.style].filter(Boolean).join(' · '), 300) }

export const describeDelete = (p: Post | undefined) => ({ act: 'deleted', ...(p ? { title: short(titleOf(p), 280) } : {}) })

/** Date and time in Cairo, whatever the device's own time zone is. */
export function cairoTime(ms: number, locale: string) {
  return new Intl.DateTimeFormat(locale, { timeZone: 'Africa/Cairo', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(ms))
}

/** Newest first. */
export const sortLog = (list: LogEntry[]) => list.slice().sort((a, b) => b.at - a.at || b.id.localeCompare(a.id))
