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

export type StoryLayer =
  | { id: string; kind: 'poster'; x: number; y: number; scale: number; rotation: number }
  | { id: string; kind: 'text'; x: number; y: number; scale: number; rotation: number; text: string; style: TextStyle; color: string; box: TextBox; align: TextAlign; size: number }
  | { id: string; kind: 'sticker'; x: number; y: number; scale: number; rotation: number; sticker: StickerKind; text: string; sub?: string; old?: string; color: string }
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

/** Sends the finished 1080x1920 JPEG (a data URL) to the engine, which saves it and puts it on the post. Resolves to its Drive link. */
export async function saveStoryPicture(postId: string, jpeg: string): Promise<string> {
  if (!SAVE_URL) throw new Error('no-engine')
  const res = await fetch(SAVE_URL, { method: 'POST', body: new URLSearchParams({ token: await token(), postId, image: jpeg }) })
  const out = (await res.json().catch(() => ({}))) as { ok?: boolean; link?: string; error?: string }
  if (!res.ok || !out.ok || !out.link) throw new Error(out.error || `engine ${res.status}`)
  return out.link
}
