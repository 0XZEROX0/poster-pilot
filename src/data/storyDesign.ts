import { auth } from './firebase'

/**
 * A story designed in the story editor: what is drawn on the 1080x1920 picture, layer by layer, bottom first.
 * Kept on the post as text (`storyDesign`) so the design can be opened and changed again before the story goes out.
 * Positions are in story pixels (1080 wide, 1920 high); x / y is the middle of each layer.
 */
export type StoryBg = { kind: 'blur' | 'color' | 'gradient'; color: string; color2: string }

export type TextStyle = 'classic' | 'modern' | 'neon' | 'typewriter' | 'strong'
export type TextBox = 'none' | 'solid' | 'soft'
export type TextAlign = 'left' | 'center' | 'right'

/**
 * Stickers, as in Instagram's sticker tray. `text` is what the sticker says (the emoji itself, the badge words, the
 * product name); `sub` is the second line (a product's price, a price's old price); `color` is its main colour.
 */
export type StickerKind = 'emoji' | 'logo' | 'badge' | 'location' | 'website' | 'product' | 'price'
export type PenKind = 'pen' | 'marker' | 'neon' | 'eraser'
/** How a layer moves when the story is a video. 'type' (text only) writes the words out letter by letter. */
export type Motion = 'none' | 'pulse' | 'bounce' | 'wiggle' | 'spin' | 'flash' | 'float' | 'type'
export const MOTIONS: { key: Motion; label: string }[] = [
  { key: 'none', label: 'Still' }, { key: 'pulse', label: 'Pulse' }, { key: 'bounce', label: 'Bounce' }, { key: 'wiggle', label: 'Wiggle' },
  { key: 'spin', label: 'Spin' }, { key: 'flash', label: 'Flash' }, { key: 'float', label: 'Float' }, { key: 'type', label: 'Typing' },
]
/** How long a moving story's video is, in seconds. */
export const VIDEO_SECONDS = 5

export type StoryLayer =
  | { id: string; kind: 'poster'; x: number; y: number; scale: number; rotation: number; motion?: Motion }
  | { id: string; kind: 'text'; x: number; y: number; scale: number; rotation: number; text: string; style: TextStyle; color: string; box: TextBox; align: TextAlign; size: number; motion?: Motion }
  | { id: string; kind: 'sticker'; x: number; y: number; scale: number; rotation: number; sticker: StickerKind; text: string; sub?: string; old?: string; color: string; motion?: Motion }
  /** A GIF from GIPHY (an animated WebP link), w x h in story pixels at scale 1. */
  | { id: string; kind: 'gif'; x: number; y: number; scale: number; rotation: number; src: string; w: number; h: number; title?: string; motion?: Motion }
  /** A drawn line: points in story pixels (x1, y1, x2, y2, ...). Drawn above everything else, as in Instagram. */
  | { id: string; kind: 'draw'; x: number; y: number; scale: number; rotation: number; points: number[]; color: string; width: number; pen: PenKind }

export type StoryDesign = { v: 1; bg: StoryBg; layers: StoryLayer[] }

export const STORY_W = 1080
export const STORY_H = 1920
/** What Instagram covers: the top bar (name, progress) and the reply box at the bottom. Kept clear in the editor. */
export const SAFE_TOP = 250
export const SAFE_BOTTOM = 340

/** The colour row under the text and background tools, as in Instagram. */
export const COLORS = ['#ffffff', '#000000', '#f97316', '#0b1f3a', '#2563eb', '#16a34a', '#facc15', '#ef4444', '#ec4899', '#a855f7', '#14b8a6', '#9ca3af']

/** How each text style is drawn. Arabic is drawn with the Arabic font of the same weight. */
export const TEXT_STYLES: Record<TextStyle, { label: string; font: string; arabic: string; weight: string; upper: boolean; spacing: number }> = {
  classic: { label: 'Classic', font: 'Inter, system-ui, sans-serif', arabic: 'Cairo, Tajawal, sans-serif', weight: '600', upper: false, spacing: 0 },
  modern: { label: 'Modern', font: 'Inter, system-ui, sans-serif', arabic: 'Tajawal, Cairo, sans-serif', weight: '500', upper: true, spacing: 6 },
  neon: { label: 'Neon', font: '"Pacifico", "Brush Script MT", cursive', arabic: 'Cairo, sans-serif', weight: '400', upper: false, spacing: 0 },
  typewriter: { label: 'Typewriter', font: '"Courier New", Courier, monospace', arabic: 'Tajawal, sans-serif', weight: '700', upper: false, spacing: 0 },
  strong: { label: 'Strong', font: 'Impact, "Arial Black", Inter, sans-serif', arabic: 'Cairo, sans-serif', weight: '900', upper: true, spacing: 1 },
}

/** The emoji in the sticker tray. */
export const EMOJI = ['🔥', '⚡', '💥', '✨', '⭐', '🎉', '🎁', '🛒', '💸', '💰', '🏷️', '📦', '🚚', '⏰', '⏳', '📍', '👉', '👇', '👆', '✅', '❤️', '🧡', '💙', '😍', '🤩', '😎', '🤯', '😱', '👀', '🙌', '👏', '💪', '🎮', '🕹️', '🖥️', '💻', '⌨️', '🖱️', '🎧', '🎤', '📱', '🔌', '🔋', '💡', '🛠️', '🚀', '🏆', '🥇', '💯', '🆕', '🆓', '🔝', '❄️', '🌙', '☀️', '🎄', '🕌', '🇪🇬']

/** True when something in the story moves, so it goes out as a short video instead of a picture. */
export const designMoves = (d: StoryDesign) => d.layers.some((l) => l.kind === 'gif' || (l.kind !== 'draw' && !!l.motion && l.motion !== 'none'))

export const hasArabic = (s: string) => /[؀-ۿ]/.test(s)

let n = 0
export const layerId = () => `l${Date.now().toString(36)}${(n++).toString(36)}`

/** A new design: the blurred poster behind, the poster itself in the middle, nothing else. */
export function startDesign(): StoryDesign {
  return { v: 1, bg: { kind: 'blur', color: '#0b1f3a', color2: '#f97316' }, layers: [{ id: layerId(), kind: 'poster', x: STORY_W / 2, y: 900, scale: 1, rotation: 0 }] }
}

/** A saved design, or a new one when the text is missing or broken. */
export function readDesign(text: string | undefined): StoryDesign {
  if (!text) return startDesign()
  try {
    const d = JSON.parse(text) as StoryDesign
    if (d && d.v === 1 && Array.isArray(d.layers) && d.bg) return d
  } catch {
    // An unreadable design starts again from the default.
  }
  return startDesign()
}

/** The text a layer shows, in capitals for the styles that use them (never for Arabic). */
export const shownText = (l: Extract<StoryLayer, { kind: 'text' }>) => (TEXT_STYLES[l.style].upper && !hasArabic(l.text) ? l.text.toUpperCase() : l.text)

// ---------- the engine's story editor webhooks (n8n "Static OS - Story editor") ----------
const NUDGE = import.meta.env.VITE_ENGINE_NUDGE_URL as string | undefined
const SAVE_URL = NUDGE?.replace(/static-os-nudge$/, 'static-os-story')
const ASSET_URL = NUDGE?.replace(/static-os-nudge$/, 'static-os-story-asset')
const VIDEO_URL = NUDGE?.replace(/static-os-nudge$/, 'static-os-story-video')

/** True when this build of the app can save designed stories (not in the demo). */
export const storySaving = (): boolean => !!SAVE_URL && !!auth

async function token(): Promise<string> {
  const user = auth?.currentUser
  if (!user) throw new Error('signed-out')
  return user.getIdToken()
}

const fileIdOf = (link: string) => (link.match(/\/d\/([\w-]+)/) ?? link.match(/[?&]id=([\w-]+)/))?.[1] ?? ''

/**
 * The poster as a picture the editor may draw and save: the browser cannot read Drive pictures into a canvas, so
 * the engine sends it (a JPEG up to 1600 px). Resolves to an object URL, or null when it could not be had.
 */
export async function loadPoster(posterUrl: string): Promise<string | null> {
  const id = fileIdOf(posterUrl)
  if (!ASSET_URL || !id) return null
  try {
    // A form post is a "simple" request: no extra round trip to ask the engine first.
    const res = await fetch(ASSET_URL, { method: 'POST', body: new URLSearchParams({ token: await token(), id }) })
    if (!res.ok) return null
    const blob = await res.blob()
    return blob.size > 1000 ? URL.createObjectURL(blob) : null
  } catch {
    return null
  }
}

/**
 * Sends a moving story: the video (MP4) and a still of it (JPEG, for the app's preview). The engine saves both and
 * puts them on the post; the story then goes out as a video. Resolves to the video's Drive link.
 */
export async function saveStoryVideo(postId: string, jpeg: string, video: Blob): Promise<string> {
  if (!VIDEO_URL) throw new Error('no-engine')
  const form = new FormData()
  form.append('token', await token())
  form.append('postId', postId)
  form.append('image', jpeg)
  form.append('video', video, 'story.mp4')
  // A multipart form is a "simple" request too.
  const res = await fetch(VIDEO_URL, { method: 'POST', body: form })
  const out = (await res.json().catch(() => ({}))) as { ok?: boolean; link?: string; video?: string; error?: string }
  if (!res.ok || !out.ok || !out.video) throw new Error(out.error || `engine ${res.status}`)
  return out.video
}

// ---------- GIPHY (the GIFs Instagram uses) ----------
const GIPHY_KEY = import.meta.env.VITE_GIPHY_KEY as string | undefined
export const giphyReady = () => !!GIPHY_KEY
export type Gif = { id: string; title: string; preview: string; src: string; w: number; h: number }
type GiphyImage = { url?: string; webp?: string; width?: string; height?: string; webp_size?: string }
/** GIPHY stickers (see-through GIFs, as in Instagram's GIF search): trending when the search is empty. */
// The free GIPHY key allows 100 searches an hour for the whole shop, so answers are kept: trending for an hour on
// this device, searches for this visit.
const gifCache = new Map<string, Gif[]>()
const TRENDING_KEY = 'pp-giphy-trending'
export async function searchGifs(q: string): Promise<Gif[]> {
  if (!GIPHY_KEY) return []
  const query = q.trim().toLowerCase()
  const hit = gifCache.get(query)
  if (hit) return hit
  if (!query) {
    try {
      const kept = JSON.parse(localStorage.getItem(TRENDING_KEY) || 'null') as { at: number; gifs: Gif[] } | null
      if (kept && Date.now() - kept.at < 3600_000) { gifCache.set('', kept.gifs); return kept.gifs }
    } catch { /* asks GIPHY instead */ }
  }
  const gifs = await askGiphy(query)
  gifCache.set(query, gifs)
  if (!query) try { localStorage.setItem(TRENDING_KEY, JSON.stringify({ at: Date.now(), gifs })) } catch { /* kept for this visit only */ }
  return gifs
}
async function askGiphy(q: string): Promise<Gif[]> {
  const path = q.trim() ? `search?q=${encodeURIComponent(q.trim())}&` : 'trending?'
  const res = await fetch(`https://api.giphy.com/v1/stickers/${path}api_key=${GIPHY_KEY}&limit=30&rating=g`)
  if (res.status === 429) throw new Error('giphy-limit')
  if (!res.ok) throw new Error(`GIPHY ${res.status}`)
  const out = (await res.json()) as { data: { id: string; title: string; images: Record<string, GiphyImage> }[] }
  return out.data.map((g) => {
    const big = g.images.original && Number(g.images.original.webp_size ?? 0) < 2_500_000 ? g.images.original : g.images.fixed_height
    const w = Number(big?.width ?? 200), h = Number(big?.height ?? 200)
    // At most 520 story pixels on its longer side to start with; it can be made bigger.
    const k = 520 / Math.max(w, h)
    return { id: g.id, title: g.title, preview: g.images.fixed_width_small?.webp || g.images.fixed_width_small?.url || '', src: big?.webp || big?.url || '', w: Math.round(w * k), h: Math.round(h * k) }
  }).filter((g) => g.src)
}

/** Sends the finished 1080x1920 JPEG (a data URL) to the engine, which saves it and puts it on the post. Resolves to its Drive link. */
export async function saveStoryPicture(postId: string, jpeg: string): Promise<string> {
  if (!SAVE_URL) throw new Error('no-engine')
  const res = await fetch(SAVE_URL, { method: 'POST', body: new URLSearchParams({ token: await token(), postId, image: jpeg }) })
  const out = (await res.json().catch(() => ({}))) as { ok?: boolean; link?: string; error?: string }
  if (!res.ok || !out.ok || !out.link) throw new Error(out.error || `engine ${res.status}`)
  return out.link
}
