import Konva from 'konva'
import { useEffect, useState } from 'react'
import { Group, Image as KImage, Rect, Text } from 'react-konva'
import { hasOffer, itemName, priceOf, titleOf, toNumber } from '../data/logic'
import { EMOJI, giphyReady, hasArabic, layerId, searchGifs, STORY_H, STORY_W, type Gif, type StickerKind, type StoryLayer } from '../data/storyDesign'
import type { Post } from '../data/types'
import { t } from '../i18n'
import { Icon } from './ui'

export type StickerLayer = Extract<StoryLayer, { kind: 'sticker' }>

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
const LATIN = 'Inter, system-ui, sans-serif'
const ARABIC = 'Cairo, Tajawal, sans-serif'
const fontFor = (s: string) => (hasArabic(s) ? ARABIC : LATIN)
export const LOGO_URL = `${import.meta.env.BASE_URL}static-logo.png`

/** Black or white, whichever reads better on the colour. */
export const ink = (c: string) => {
  const h = c.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16))
  return r * 0.299 + g * 0.587 + b * 0.114 > 160 ? '#000000' : '#ffffff'
}

const measure = (text: string, fontSize: number, fontFamily: string, fontStyle = '700', width?: number) => {
  const n = new Konva.Text({ text, fontSize, fontFamily, fontStyle, lineHeight: 1.15, ...(width ? { width, wrap: 'word' } : {}) })
  return { w: n.width(), h: n.height() }
}
const money = (s: string) => {
  const v = s.trim()
  return !v ? '' : /egp|ج/i.test(v) ? v : `${v} EGP`
}

/** Which stickers can change colour (the others have their own fixed look). */
export const COLOURED: StickerKind[] = ['badge', 'price', 'product']
/** Which stickers have words the person can change. */
export const WORDED: StickerKind[] = ['badge', 'location', 'website', 'product', 'price']

/** The size of a sticker in story pixels, for centring it on its x / y. */
export function stickerSize(l: StickerLayer): { w: number; h: number } {
  switch (l.sticker) {
    case 'emoji': { const m = measure(l.text, 180, EMOJI_FONT, 'normal'); return { w: m.w, h: m.h } }
    case 'logo': return { w: 560, h: 170 }
    case 'badge': { const m = measure(hasArabic(l.text) ? l.text : l.text.toUpperCase(), 76, fontFor(l.text), '800'); return { w: m.w + 76, h: m.h + 44 } }
    case 'location':
    case 'website': { const m = measure(l.text, 50, fontFor(l.text), '800'); return { w: m.w + 128, h: m.h + 44 } }
    case 'product': {
      const name = measure(l.text, 46, fontFor(l.text), '700', 680)
      return { w: 760, h: 40 + Math.min(name.h, 46 * 1.15 * 3) + 18 + (l.sub ? 92 : 0) + (l.old ? 54 : 0) + 34 }
    }
    case 'price': { const m = measure(l.sub || l.text, 84, LATIN, '800'); return { w: Math.max(m.w, l.old ? measure(l.old, 44, LATIN, '600').w : 0) + 80, h: m.h + 44 + (l.old ? 54 : 0) } }
  }
}

/** One sticker, drawn as Instagram would: centred on its own middle, so it turns and grows round it. */
export function StickerShape({ l, logo }: { l: StickerLayer; logo: HTMLImageElement | null }) {
  const { w, h } = stickerSize(l)
  switch (l.sticker) {
    case 'emoji':
      return <Text text={l.text} fontSize={180} fontFamily={EMOJI_FONT} lineHeight={1.15} />
    case 'logo':
      return (
        <Group>
          <Rect width={w} height={h} cornerRadius={h / 2} fill="#ffffff" shadowColor="#000" shadowBlur={24} shadowOpacity={0.25} />
          {logo && <KImage image={logo} x={40} y={25} width={480} height={110} />}
        </Group>
      )
    case 'badge': {
      const text = hasArabic(l.text) ? l.text : l.text.toUpperCase()
      return (
        <Group>
          <Rect width={w} height={h} cornerRadius={24} fill={l.color} shadowColor="#000" shadowBlur={20} shadowOpacity={0.25} />
          <Text text={text} x={38} y={22} fontSize={76} fontStyle="800" fontFamily={fontFor(l.text)} lineHeight={1.15} fill={ink(l.color)} />
        </Group>
      )
    }
    case 'location':
    case 'website': {
      // As Instagram's location and link stickers: white, with the words in colour after a small mark.
      const loc = l.sticker === 'location'
      return (
        <Group>
          <Rect width={w} height={h} cornerRadius={22} fill="#ffffff" shadowColor="#000" shadowBlur={20} shadowOpacity={0.22} />
          <Text text={loc ? '📍' : '🔗'} x={26} y={h / 2 - 30} fontSize={52} fontFamily={EMOJI_FONT} />
          <Text text={loc && !hasArabic(l.text) ? l.text.toUpperCase() : l.text} x={100} y={22} fontSize={50} fontStyle="800" fontFamily={fontFor(l.text)} lineHeight={1.15}
            {...(loc
              ? { fillLinearGradientStartPoint: { x: 0, y: 0 }, fillLinearGradientEndPoint: { x: w - 128, y: 0 }, fillLinearGradientColorStops: [0, '#8a3ab9', 0.55, '#e95950', 1, '#f59e0b'] }
              : { fill: '#1d6ef2' })} />
        </Group>
      )
    }
    case 'product': {
      const nameH = Math.min(measure(l.text, 46, fontFor(l.text), '700', 680).h, 46 * 1.15 * 3)
      const y = 40 + nameH + 18
      return (
        <Group>
          <Rect width={w} height={h} cornerRadius={36} fill="#ffffff" shadowColor="#000" shadowBlur={30} shadowOpacity={0.28} />
          <Rect width={14} height={h - 60} x={0} y={30} cornerRadius={7} fill={l.color} />
          <Text text={l.text} x={40} y={40} width={680} height={nameH} ellipsis wrap="word" fontSize={46} fontStyle="700" fontFamily={fontFor(l.text)} lineHeight={1.15} fill="#0b1f3a" />
          {l.old && <Text text={l.old} x={40} y={y} fontSize={44} fontStyle="600" fontFamily={LATIN} fill="#6b7280" textDecoration="line-through" />}
          {l.sub && <Text text={l.sub} x={40} y={y + (l.old ? 54 : 0)} fontSize={80} fontStyle="800" fontFamily={LATIN} fill={l.color} />}
        </Group>
      )
    }
    case 'price': {
      const top = l.old ? 54 : 0
      return (
        <Group>
          <Rect width={w} height={h} cornerRadius={30} fill={l.color} shadowColor="#000" shadowBlur={22} shadowOpacity={0.28} />
          {l.old && <Text text={l.old} x={40} y={22} fontSize={44} fontStyle="600" fontFamily={LATIN} fill={ink(l.color)} opacity={0.75} textDecoration="line-through" />}
          <Text text={l.sub || l.text} x={40} y={22 + top} fontSize={84} fontStyle="800" fontFamily={LATIN} lineHeight={1.15} fill={ink(l.color)} />
        </Group>
      )
    }
  }
}

type Pick = Omit<StickerLayer, 'id' | 'kind' | 'x' | 'y' | 'scale' | 'rotation'>

/** The stickers made from the post itself: its product, its price and its discount. */
function postStickers(post: Post): { label: string; make: Pick }[] {
  const name = post.items.map(itemName).filter(Boolean).join(' + ') || titleOf(post)
  const price = money(priceOf(post))
  const old = hasOffer(post) ? money(post.priceBefore) : ''
  const off = hasOffer(post) ? Math.round((1 - toNumber(post.priceAfter) / toNumber(post.priceBefore)) * 100) : 0
  const out: { label: string; make: Pick }[] = [{ label: t('Product'), make: { sticker: 'product', text: name, sub: price, old, color: '#f97316' } }]
  if (price) out.push({ label: t('Price'), make: { sticker: 'price', text: price, sub: price, old, color: '#f97316' } })
  if (off > 0) out.push({ label: `-${off}%`, make: { sticker: 'badge', text: `-${off}%`, color: '#ef4444' } })
  return out
}

const SHOP: { label: string; make: Pick }[] = [
  { label: 'Logo', make: { sticker: 'logo', text: 'Static', color: '#ffffff' } },
  { label: 'Location', make: { sticker: 'location', text: 'Al Bustan Mall · 10th floor', color: '#ffffff' } },
  { label: 'Website', make: { sticker: 'website', text: 'static-eg.com', color: '#ffffff' } },
  { label: 'SALE', make: { sticker: 'badge', text: 'Sale', color: '#ef4444' } },
  { label: 'NEW', make: { sticker: 'badge', text: 'New', color: '#2563eb' } },
  { label: 'عرض خاص', make: { sticker: 'badge', text: 'عرض خاص', color: '#f97316' } },
  { label: 'LIMITED OFFER', make: { sticker: 'badge', text: 'Limited offer', color: '#0b1f3a' } },
  { label: 'TODAY ONLY', make: { sticker: 'badge', text: 'Today only', color: '#facc15' } },
  { label: 'IN STOCK', make: { sticker: 'badge', text: 'In stock', color: '#16a34a' } },
  { label: 'شحن لكل مصر', make: { sticker: 'badge', text: 'شحن لكل مصر', color: '#14b8a6' } },
]

/** A new sticker layer in the middle of the story, a little turned for the badges as people do on the phone. */
export function newSticker(make: Pick): StickerLayer {
  return { id: layerId(), kind: 'sticker', x: STORY_W / 2, y: STORY_H / 2, scale: 1, rotation: make.sticker === 'badge' ? -6 : 0, ...make }
}

/** Moving stickers: the shop's own, ready to post as they are; every one can still be changed like any sticker. */
const MOVING: { label: string; make: () => StoryLayer }[] = [
  { label: '💓 SALE', make: () => ({ ...newSticker({ sticker: 'badge', text: 'Sale', color: '#ef4444' }), motion: 'pulse' }) },
  { label: '✨ NEW', make: () => ({ ...newSticker({ sticker: 'badge', text: 'New', color: '#2563eb' }), motion: 'flash' }) },
  { label: '🔥', make: () => ({ ...newSticker({ sticker: 'emoji', text: '🔥', color: '#ffffff' }), motion: 'wiggle' }) },
  { label: '⭐', make: () => ({ ...newSticker({ sticker: 'emoji', text: '⭐', color: '#ffffff' }), motion: 'spin' }) },
  { label: '👇', make: () => ({ ...newSticker({ sticker: 'emoji', text: '👇', color: '#ffffff' }), motion: 'bounce' }) },
  { label: '🎁 عرض خاص', make: () => ({ ...newSticker({ sticker: 'badge', text: 'عرض خاص', color: '#f97316' }), motion: 'wiggle' }) },
  { label: '⌨️ LIMITED OFFER', make: () => ({ id: layerId(), kind: 'text', x: STORY_W / 2, y: STORY_H / 2, scale: 1, rotation: 0, text: 'Limited offer', style: 'typewriter', color: '#ffffff', box: 'solid', align: 'center', size: 72, motion: 'type' }) },
  { label: '🌊 static-eg.com', make: () => ({ ...newSticker({ sticker: 'website', text: 'static-eg.com', color: '#ffffff' }), motion: 'float' }) },
]

/** GIPHY search: trending GIF stickers first, then what the person types (English or Arabic). */
function GifSearch({ onPick }: { onPick: (l: StoryLayer) => void }) {
  const [q, setQ] = useState('')
  const [asked, setAsked] = useState('')
  const [gifs, setGifs] = useState<Gif[] | null>(null)
  const [problem, setProblem] = useState('')
  // Searches only when the person presses Search (or Enter): the GIPHY key allows 100 searches an hour.
  useEffect(() => {
    let live = true
    searchGifs(asked).then((g) => { if (live) { setGifs(g); setProblem('') } }).catch((e) => {
      if (!live) return
      const why = e instanceof Error ? e.message : String(e)
      setProblem(why === 'giphy-limit' ? t('GIPHY is busy: the shop used its 100 GIF searches for this hour. Try again later.') : why)
    })
    return () => { live = false }
  }, [asked])
  const pick = (g: Gif) => onPick({ id: layerId(), kind: 'gif', x: STORY_W / 2, y: STORY_H / 2, scale: 1, rotation: 0, src: g.src, w: g.w, h: g.h, title: g.title })
  return (
    <div className="se-gifs">
      <form className="se-gif-form" onSubmit={(e) => { e.preventDefault(); setAsked(q) }}>
        <input className="se-words" type="search" dir="auto" placeholder={t('Search GIPHY')} value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit" className="se-style on">{t('Search')}</button>
      </form>
      {problem && <p className="se-hint">{problem}</p>}
      <div className="se-gif-grid">
        {(gifs ?? []).map((g) => <button key={g.id} type="button" onClick={() => pick(g)} aria-label={g.title}><img src={g.preview} alt="" loading="lazy" /></button>)}
      </div>
      <p className="se-powered">Powered by GIPHY</p>
    </div>
  )
}

/** The sticker tray, as in Instagram: the shop's and the post's stickers, moving ones, GIFs, then emoji. */
export function StickerTray({ post, onPick, onClose }: { post: Post; onPick: (l: StoryLayer) => void; onClose: () => void }) {
  const pick = (make: Pick) => onPick(newSticker(make))
  const [tab, setTab] = useState<'stickers' | 'gifs'>('stickers')
  return (
    <div className="se-tray-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="se-tray" role="dialog" aria-label={t('Stickers')}>
        <div className="se-tray-head">
          <div className="se-tabs">
            <button type="button" className={`se-style${tab === 'stickers' ? ' on' : ''}`} onClick={() => setTab('stickers')}>{t('Stickers')}</button>
            <button type="button" className={`se-style${tab === 'gifs' ? ' on' : ''}`} onClick={() => setTab('gifs')}>GIF</button>
          </div>
          <button type="button" className="se-round" onClick={onClose} aria-label={t('Close')}><Icon name="close" /></button>
        </div>
        <div className="se-tray-body">
          {tab === 'gifs' ? (giphyReady() ? <GifSearch onPick={onPick} /> : <p className="se-hint">{t('GIF search starts once the GIPHY key is added to the app.')}</p>) : <>
          <div className="se-chips">
            {[...postStickers(post), ...SHOP].map((s) => (
              <button key={s.label} type="button" className={`se-chip se-chip-${s.make.sticker}`} style={COLOURED.includes(s.make.sticker) ? { background: s.make.color, color: ink(s.make.color) } : undefined} onClick={() => pick(s.make)} dir="auto">
                {s.make.sticker === 'logo' ? <img src={LOGO_URL} alt="Static" /> : s.make.sticker === 'location' ? `📍 ${t('Location')}` : s.make.sticker === 'website' ? '🔗 static-eg.com' : s.make.sticker === 'product' ? `🛒 ${s.label}` : s.make.sticker === 'price' ? `🏷️ ${s.label}` : s.label}
              </button>
            ))}
          </div>
          <b className="se-tray-title">{t('Moving')}</b>
          <div className="se-chips">
            {MOVING.map((m) => <button key={m.label} type="button" className="se-chip se-chip-moving" onClick={() => onPick(m.make())} dir="auto">{m.label}</button>)}
          </div>
          <div className="se-emoji">
            {EMOJI.map((e) => <button key={e} type="button" onClick={() => pick({ sticker: 'emoji', text: e, color: '#ffffff' })} aria-label={e}>{e}</button>)}
          </div>
          </>}
        </div>
      </div>
    </div>
  )
}
