import Konva from 'konva'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Group, Image as KImage, Label, Layer, Line, Rect, Stage, Tag, Text, Transformer } from 'react-konva'
import { backend } from '../data/store'
import { titleOf } from '../data/logic'
import { COLORS, designMoves, MOTIONS, saveStoryVideo, VIDEO_SECONDS, type Motion, hasArabic, layerId, readDesign, SAFE_BOTTOM, SAFE_TOP, saveStoryPicture, loadPoster, shownText, STORY_H, STORY_W, storySaving, TEXT_STYLES, type StoryBg, type StoryDesign, type PenKind, type StoryLayer, type TextStyle } from '../data/storyDesign'
import type { Post } from '../data/types'
import { t } from '../i18n'
import { COLOURED, ink, LOGO_URL, StickerShape, stickerSize, StickerTray, WORDED } from './StoryStickers'
import { Icon } from './ui'

// Two fingers on a sticker while it is being dragged resize and turn it.
Konva.hitOnDragEnabled = true

type TextLayer = Extract<StoryLayer, { kind: 'text' }>
type DrawLayer = Extract<StoryLayer, { kind: 'draw' }>

// The editor's fonts, loaded only when it opens (the rest of the app uses the phone's own fonts).
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Cairo:wght@600;800&family=Inter:wght@500;600;700;800&family=Pacifico&family=Tajawal:wght@500;700&display=swap'
function useEditorFonts(): number {
  const [ready, setReady] = useState(0)
  useEffect(() => {
    if (!document.querySelector(`link[href="${FONT_CSS}"]`)) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = FONT_CSS
      document.head.appendChild(link)
    }
    const wanted = ['800 40px Inter', '700 40px Inter', '600 40px Cairo', '800 40px Cairo', '500 40px Tajawal', '700 40px Tajawal', '40px Pacifico', '600 40px Inter', '500 40px Inter']
    let live = true
    Promise.all(wanted.map((f) => document.fonts.load(f, 'Aa ب').catch(() => []))).then(() => live && setReady((n) => n + 1))
    return () => { live = false }
  }, [])
  return ready
}

function useImage(url: string | null): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!url) { setImg(null); return }
    const i = new window.Image()
    i.onload = () => setImg(i)
    i.src = url
  }, [url])
  return img
}

/** How a text layer is drawn: its font, fill, box and size (measured, so it can be centred on its x / y). */
function textLook(l: TextLayer) {
  const s = TEXT_STYLES[l.style]
  const arabic = hasArabic(l.text)
  const fontFamily = arabic ? s.arabic : s.font
  const fontStyle = arabic && s.weight === '400' ? '700' : s.weight
  const text = shownText(l) || ' '
  // Spaced letters are drawn one by one, which breaks Arabic joining: Arabic is never spaced.
  const spacing = arabic ? 0 : s.spacing
  const padding = l.box === 'none' ? 0 : Math.round(l.size * 0.35)
  const probe = new Konva.Text({ text, fontFamily, fontStyle, fontSize: l.size, letterSpacing: spacing, lineHeight: 1.2 })
  const width = Math.min(probe.width(), 900) + padding * 2
  const fill = l.box === 'solid' ? ink(l.color) : l.color
  const height = new Konva.Text({ text, fontFamily, fontStyle, fontSize: l.size, letterSpacing: spacing, lineHeight: 1.2, width: width - padding * 2, wrap: 'word' }).height() + padding * 2
  return { text, fontFamily, fontStyle, padding, width, height, fill, spacing, neon: l.style === 'neon', align: arabic && l.align === 'center' ? 'center' : l.align }
}

/** The background: the poster blurred and darkened over the whole story, a colour, or two colours. */
function Background({ bg, poster }: { bg: StoryBg; poster: HTMLImageElement | null }) {
  const ref = useRef<Konva.Image>(null)
  const small = useMemo(() => {
    if (!poster) return null
    // Cover a 270x480 canvas with the poster; it is blurred and drawn 4 times larger (fast, and soft enough).
    const c = document.createElement('canvas')
    c.width = 270
    c.height = 480
    const k = Math.max(270 / poster.width, 480 / poster.height)
    c.getContext('2d')?.drawImage(poster, (270 - poster.width * k) / 2, (480 - poster.height * k) / 2, poster.width * k, poster.height * k)
    return c
  }, [poster])
  useEffect(() => {
    const node = ref.current
    if (!node || !small) return
    node.cache({ pixelRatio: 1 })
    node.getLayer()?.batchDraw()
  }, [small, bg.kind])
  if (bg.kind === 'blur' && small) {
    return (
      <Group listening={false}>
        <Rect width={STORY_W} height={STORY_H} fill="#0b1f3a" />
        <KImage ref={ref} image={small} width={270} height={480} scaleX={4} scaleY={4} filters={[Konva.Filters.Blur, Konva.Filters.Brighten]} blurRadius={36} brightness={-0.3} />
      </Group>
    )
  }
  if (bg.kind === 'gradient') {
    return <Rect listening={false} width={STORY_W} height={STORY_H} fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: STORY_W, y: STORY_H }} fillLinearGradientColorStops={[0, bg.color, 1, bg.color2]} />
  }
  return <Rect listening={false} width={STORY_W} height={STORY_H} fill={bg.kind === 'blur' ? '#0b1f3a' : bg.color} />
}

/** Where a moving layer is at `t` seconds: changes made to its inner group only. */
function applyMotion(node: Konva.Node, motion: Motion, t: number) {
  const g = node as Konva.Group
  const wave = (period: number) => Math.sin((2 * Math.PI * t) / period)
  g.scale({ x: 1, y: 1 }); g.rotation(0); g.y(0); g.opacity(1)
  if (motion === 'pulse') { const k = 1 + 0.09 * (wave(0.9) + 1) / 2; g.scale({ x: k, y: k }) }
  else if (motion === 'bounce') g.y(-46 * Math.abs(Math.sin((Math.PI * t) / 0.7)))
  else if (motion === 'wiggle') g.rotation(9 * wave(0.45))
  else if (motion === 'spin') g.rotation((360 * t) / 2.5)
  else if (motion === 'flash') g.opacity(t % 0.8 < 0.5 ? 1 : 0.12)
  else if (motion === 'float') g.y(22 * wave(2))
}

/** What the browser's ImageDecoder gives (WebCodecs; not yet in every TypeScript library). */
type FrameImage = { image: CanvasImageSource & { close(): void; duration: number | null } }
type Decoder = { tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null }; decode(o: { frameIndex: number }): Promise<FrameImage>; close(): void }
type DecoderMaker = new (o: { data: ArrayBuffer; type: string }) => Decoder

/**
 * A GIF as a canvas that shows the right frame for the moment: its frames are read once (ImageDecoder), then
 * `draw(t)` paints the frame for `t` seconds. Browsers without ImageDecoder get the GIF picture itself, which plays
 * while it is in the page (kept hidden there).
 */
export type GifPlayer = { image: CanvasImageSource; draw: (t: number) => void }
async function makeGif(src: string, box: HTMLDivElement): Promise<{ player: GifPlayer; stop: () => void }> {
  const Maker = (window as unknown as { ImageDecoder?: DecoderMaker }).ImageDecoder
  if (Maker) {
    try {
      const res = await fetch(src)
      const data = await res.arrayBuffer()
      const dec = new Maker({ data, type: res.headers.get('content-type') || (/\.gif/i.test(src) ? 'image/gif' : 'image/webp') })
      await dec.tracks.ready
      const count = Math.min(dec.tracks.selectedTrack?.frameCount ?? 1, 150)
      const frames: { bmp: ImageBitmap; until: number }[] = []
      let total = 0
      for (let i = 0; i < count; i++) {
        const f = await dec.decode({ frameIndex: i })
        total += Math.max(0.02, (f.image.duration ?? 100000) / 1e6)
        frames.push({ bmp: await createImageBitmap(f.image), until: total })
        f.image.close()
      }
      dec.close()
      const canvas = document.createElement('canvas')
      canvas.width = frames[0]?.bmp.width ?? 1
      canvas.height = frames[0]?.bmp.height ?? 1
      const ctx = canvas.getContext('2d')
      let last = -1
      const draw = (t: number) => {
        const at = total ? t % total : 0
        const i = Math.max(0, frames.findIndex((f) => at < f.until))
        if (i === last || !ctx) return
        last = i
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(frames[i].bmp, 0, 0)
      }
      draw(0)
      return { player: { image: canvas, draw }, stop: () => frames.forEach((f) => f.bmp.close()) }
    } catch {
      // Falls back to the picture below.
    }
  }
  const img = new window.Image()
  img.crossOrigin = 'anonymous'
  img.src = src
  box.appendChild(img)
  await img.decode().catch(() => undefined)
  return { player: { image: img, draw: () => undefined }, stop: () => img.remove() }
}

function useGifs(srcs: string[], box: HTMLDivElement | null): Record<string, GifPlayer> {
  const [players, setPlayers] = useState<Record<string, GifPlayer>>({})
  const key = [...new Set(srcs)].sort().join('|')
  useEffect(() => {
    if (!box) return
    let live = true
    const stops: (() => void)[] = []
    for (const src of key ? key.split('|') : []) {
      makeGif(src, box).then(({ player, stop }) => {
        stops.push(stop)
        if (live) setPlayers((m) => ({ ...m, [src]: player }))
        else stop()
      })
    }
    return () => { live = false; stops.forEach((s) => s()) }
  }, [key, box])
  return players
}

/** The best video kind this browser can record: MP4 (Instagram and Facebook take it as it is), else nothing. */
function videoType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  return ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.42E01F', 'video/mp4;codecs=avc1', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
}

const GRADIENTS: [string, string][] = [['#0b1f3a', '#f97316'], ['#f97316', '#ec4899'], ['#2563eb', '#a855f7'], ['#16a34a', '#14b8a6'], ['#000000', '#374151'], ['#facc15', '#ef4444']]

/**
 * The story editor, as in Instagram: the 9:16 story with the poster on it, text in Instagram's styles, and a
 * background. Done saves the 1080x1920 picture; the engine posts that picture as the post's story.
 */
export default function StoryEditor({ post, onClose }: { post: Post; onClose: () => void }) {
  const fonts = useEditorFonts()
  const [design, setDesignState] = useState<StoryDesign>(() => {
    const d = readDesign(post.storyDesign)
    if (post.storyDesign) return d
    // A new design gets the shop's website and address under the poster, as text that can be moved or removed.
    return { ...d, layers: [...d.layers, { id: layerId(), kind: 'text', x: STORY_W / 2, y: 1500, scale: 1, rotation: 0, text: 'static-eg.com', style: 'strong', color: '#ffffff', box: 'none', align: 'center', size: 64 }, { id: layerId(), kind: 'text', x: STORY_W / 2, y: 1575, scale: 1, rotation: 0, text: 'Al Bustan Mall · 10th floor', style: 'classic', color: '#ffffff', box: 'none', align: 'center', size: 40 }] }
  })
  const [posterUrl, setPosterUrl] = useState<string | null>(null)
  const [posterState, setPosterState] = useState<'loading' | 'ok' | 'missing'>('loading')
  const poster = useImage(posterUrl)
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<TextLayer | null>(null)
  const [tool, setTool] = useState<'' | 'bg' | 'draw' | 'stickers'>('')
  const [pen, setPen] = useState<{ pen: PenKind; color: string; width: number }>({ pen: 'pen', color: '#ffffff', width: 14 })
  const [line, setLine] = useState<number[] | null>(null)
  const [binHot, setBinHot] = useState(false)
  const [guides, setGuides] = useState({ v: false, h: false })
  const logo = useImage(LOGO_URL)
  // Undo and redo: the designs before and after this one.
  const designRef = useRef(design)
  const past = useRef<StoryDesign[]>([])
  const future = useRef<StoryDesign[]>([])
  const [steps, setSteps] = useState({ back: 0, forward: 0 })
  const pinch = useRef<{ dist: number; angle: number; scale: number; rotation: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState('')
  const [dirty, setDirty] = useState(false)
  // While a moving story is recorded: the story is drawn at video size (720x1280) for 5 seconds.
  const [recording, setRecording] = useState(false)
  const [gifBox, setGifBox] = useState<HTMLDivElement | null>(null)
  const gifs = useGifs(design.layers.flatMap((l) => (l.kind === 'gif' ? [l.src] : [])), gifBox)
  const clock = useRef(0)
  const gifsRef = useRef(gifs)
  useEffect(() => { gifsRef.current = gifs }, [gifs])

  const stageRef = useRef<Konva.Stage>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ w: 270, h: 480 })

  // The poster comes through the engine (Drive pictures cannot be drawn into a picture that is then saved).
  useEffect(() => {
    let live = true
    let made = ''
    if (!post.posterUrl) { setPosterState('missing'); return }
    loadPoster(post.posterUrl).then((u) => {
      if (!live) { if (u) URL.revokeObjectURL(u); return }
      made = u ?? ''
      setPosterUrl(u)
      setPosterState(u ? 'ok' : 'missing')
    })
    return () => { live = false; if (made) URL.revokeObjectURL(made) }
  }, [post.posterUrl])

  // The story fills the space it has, at 9:16.
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const fit = () => {
      const r = el.getBoundingClientRect()
      const h = Math.max(240, Math.min(r.height, (r.width * 16) / 9))
      setView({ w: Math.round((h * 9) / 16), h: Math.round(h) })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Escape closes the text being typed, else the editor; the body does not scroll behind it.
  const escape = useRef<() => void>(() => {})
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Kept from the post's panel underneath, which would close too.
      e.stopImmediatePropagation()
      escape.current()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  useEffect(() => {
    const tr = trRef.current
    const stage = stageRef.current
    if (!tr || !stage) return
    const node = selected ? stage.findOne(`#${selected}`) : null
    tr.nodes(node ? [node] : [])
    tr.getLayer()?.batchDraw()
  }, [selected, design, fonts, poster])

  const change = (fn: (d: StoryDesign) => StoryDesign) => {
    const next = fn(designRef.current)
    past.current = [...past.current.slice(-59), designRef.current]
    future.current = []
    designRef.current = next
    setDesignState(next)
    setSteps({ back: past.current.length, forward: 0 })
    setDirty(true)
  }
  const step = (back: boolean) => {
    const from = back ? past : future
    const to = back ? future : past
    const next = from.current[from.current.length - 1]
    if (!next) return
    from.current = from.current.slice(0, -1)
    to.current = [...to.current, designRef.current]
    designRef.current = next
    setDesignState(next)
    setSteps({ back: past.current.length, forward: future.current.length })
    setSelected(null)
    setDirty(true)
  }
  const patchLayer = (id: string, patch: Partial<StoryLayer>) => change((d) => ({ ...d, layers: d.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as StoryLayer) : l)) }))
  const removeLayer = (id: string) => {
    change((d) => ({ ...d, layers: d.layers.filter((l) => l.id !== id) }))
    setSelected(null)
  }
  const toFront = (id: string) => change((d) => ({ ...d, layers: [...d.layers.filter((l) => l.id !== id), ...d.layers.filter((l) => l.id === id)] }))

  const newText = () => {
    setTool('')
    setSelected(null)
    setEditing({ id: '', kind: 'text', x: STORY_W / 2, y: STORY_H / 2, scale: 1, rotation: 0, text: '', style: 'classic', color: '#ffffff', box: 'none', align: 'center', size: 72 })
  }
  const finishText = () => {
    const e = editing
    setEditing(null)
    if (!e) return
    if (!e.text.trim()) { if (e.id) removeLayer(e.id); return }
    if (e.id) patchLayer(e.id, e)
    else {
      const id = layerId()
      change((d) => ({ ...d, layers: [...d.layers, { ...e, id }] }))
      setSelected(id)
    }
  }

  const VIDEO_W = 720
  const stageW = recording ? VIDEO_W : view.w
  const scale = stageW / STORY_W
  const moving = designMoves(design)

  // Moving layers and GIFs play all the time in the editor, so the person sees what the video will show.
  useEffect(() => {
    if (!moving) return
    let raf = 0
    clock.current = performance.now()
    const frame = (now: number) => {
      const stage = stageRef.current
      const t = (now - clock.current) / 1000
      if (stage) {
        for (const l of designRef.current.layers) {
          if (l.kind === 'draw' || !l.motion || l.motion === 'none') continue
          const node = stage.findOne(`#${l.id}-m`)
          if (!node) continue
          if (l.motion === 'type' && l.kind === 'text') {
            const tx = (node as Konva.Group).findOne('Text') as Konva.Text | undefined
            const full = shownText(l)
            tx?.text(full.slice(0, Math.max(1, Math.ceil(full.length * Math.min(1, (t % 3) / 1.8)))))
          } else applyMotion(node, l.motion, t)
        }
        for (const g of Object.values(gifsRef.current)) g.draw(t)
        stage.getLayers()[0]?.batchDraw()
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      // Back to still: every layer where it was set, with all its words.
      const stage = stageRef.current
      for (const l of designRef.current.layers) {
        const node = l.kind === 'draw' ? null : stage?.findOne(`#${l.id}-m`)
        if (!node) continue
        applyMotion(node, 'none', 0)
        if (l.kind === 'text') ((node as Konva.Group).findOne('Text') as Konva.Text | undefined)?.text(shownText(l) || ' ')
      }
      stage?.getLayers()[0]?.batchDraw()
    }
  }, [moving, design])
  const addSticker = (l: StoryLayer) => {
    change((d) => ({ ...d, layers: [...d.layers, l] }))
    setTool('')
    setSelected(l.id)
  }

  // Drawing: a line follows the finger; it becomes a layer when the finger lifts.
  const storyPoint = () => {
    const p = stageRef.current?.getPointerPosition()
    return p ? [Math.round(p.x / scale), Math.round(p.y / scale)] : null
  }
  const drawStart = () => { if (tool === 'draw') { const p = storyPoint(); if (p) setLine(p) } }
  const drawMove = () => { if (tool === 'draw' && line) { const p = storyPoint(); if (p) setLine([...line, ...p]) } }
  const drawEnd = () => {
    if (tool !== 'draw' || !line) return
    const points = line.length === 2 ? [...line, line[0] + 1, line[1] + 1] : line
    setLine(null)
    change((d) => ({ ...d, layers: [...d.layers, { id: layerId(), kind: 'draw', x: 0, y: 0, scale: 1, rotation: 0, points, ...pen }] }))
  }

  // Two fingers: resize and turn the selected layer, as on Instagram.
  const touchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const ts = e.evt.touches
    const node = selected ? stageRef.current?.findOne(`#${selected}`) : null
    if (ts.length !== 2 || !node) return
    e.evt.preventDefault()
    if (node.isDragging()) node.stopDrag()
    const dx = ts[1].clientX - ts[0].clientX, dy = ts[1].clientY - ts[0].clientY
    const dist = Math.hypot(dx, dy), angle = (Math.atan2(dy, dx) * 180) / Math.PI
    if (!pinch.current) { pinch.current = { dist, angle, scale: node.scaleX(), rotation: node.rotation() }; return }
    const k = Math.max(0.15, Math.min(6, (pinch.current.scale * dist) / pinch.current.dist))
    node.scale({ x: k, y: k })
    node.rotation(pinch.current.rotation + angle - pinch.current.angle)
    node.getLayer()?.batchDraw()
  }
  const touchEnd = () => {
    const node = selected ? stageRef.current?.findOne(`#${selected}`) : null
    if (pinch.current && node && selected) patchLayer(selected, { scale: node.scaleX(), rotation: node.rotation() })
    pinch.current = null
  }

  // While dragging: snap to the middle lines and show them, and light the bin when the finger is over it.
  const BIN = { x: () => view.w / 2, y: () => view.h - 56, r: 46 }
  const dragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    const n = e.target
    const v = Math.abs(n.x() - STORY_W / 2) < 14, h = Math.abs(n.y() - STORY_H / 2) < 14
    if (v) n.x(STORY_W / 2)
    if (h) n.y(STORY_H / 2)
    if (v !== guides.v || h !== guides.h) setGuides({ v, h })
    const p = stageRef.current?.getPointerPosition()
    const hot = !!p && Math.hypot(p.x - BIN.x(), p.y - BIN.y()) < BIN.r
    if (hot !== binHot) setBinHot(hot)
  }
  const selectedLayer = design.layers.find((l) => l.id === selected)

  /** Records the story as it moves, 5 seconds at 30 frames a second, 720x1280 MP4. */
  async function record(): Promise<Blob> {
    const type = videoType()
    if (!type) throw new Error('no-video')
    setRecording(true)
    // Two frames: the stage is redrawn at video size first.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))
    const stage = stageRef.current
    if (!stage) throw new Error('no-stage')
    const layers = stage.getLayers()
    const ratio = layers[0]?.getCanvas().getPixelRatio() ?? 1
    layers.forEach((l) => { l.getCanvas().setPixelRatio(1); l.batchDraw() })
    const out = document.createElement('canvas')
    out.width = VIDEO_W
    out.height = Math.round((VIDEO_W * STORY_H) / STORY_W)
    const ctx = out.getContext('2d')
    if (!ctx) throw new Error('no-canvas')
    const rec = new MediaRecorder(out.captureStream(30), { mimeType: type, videoBitsPerSecond: 6_000_000 })
    const parts: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data)
    const done = new Promise<Blob>((resolve) => { rec.onstop = () => resolve(new Blob(parts, { type: 'video/mp4' })) })
    clock.current = performance.now()
    rec.start(250)
    await new Promise<void>((resolve) => {
      const frame = () => {
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, out.width, out.height)
        for (const l of layers) ctx.drawImage(l.getNativeCanvasElement(), 0, 0, out.width, out.height)
        if (performance.now() - clock.current >= VIDEO_SECONDS * 1000) resolve()
        else requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    })
    rec.stop()
    const video = await done
    layers.forEach((l) => { l.getCanvas().setPixelRatio(ratio); l.batchDraw() })
    return video
  }

  async function save() {
    const stage = stageRef.current
    if (!stage) return
    setSaving(true)
    setProblem('')
    setSelected(null)
    setDragging(false)
    // Wait one frame so the handles round the selected layer are gone from the picture.
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    try {
      trRef.current?.nodes([])
      const text = JSON.stringify(design)
      if (moving) {
        const video = await record()
        const jpeg = stageRef.current?.toDataURL({ mimeType: 'image/jpeg', quality: 0.9, pixelRatio: STORY_W / VIDEO_W }) ?? ''
        setRecording(false)
        if (storySaving()) {
          await saveStoryVideo(post.id, jpeg, video)
          await backend.updatePost(post.id, { storyDesign: text })
        } else await backend.updatePost(post.id, { storyDesign: text, storyImage: jpeg, storyVideo: URL.createObjectURL(video) })
        onClose()
        return
      }
      const jpeg = stage.toDataURL({ mimeType: 'image/jpeg', quality: 0.9, pixelRatio: STORY_W / view.w })
      if (storySaving()) {
        await saveStoryPicture(post.id, jpeg)
        await backend.updatePost(post.id, { storyDesign: text })
      } else {
        // The demo keeps the picture in the browser.
        await backend.updatePost(post.id, { storyDesign: text, storyImage: jpeg })
      }
      onClose()
    } catch (e) {
      setRecording(false)
      const why = e instanceof Error ? e.message : String(e)
      setProblem(/no-video/.test(why) ? t('This browser cannot make the video. Open the app in Chrome or Safari to save a moving story.') : /tainted|insecure/i.test(why) ? t('The poster could not be used in the picture. Try again in a minute.') : `${t('Not saved')}: ${why}`)
      setSaving(false)
    }
  }

  const close = () => {
    if (dirty && !window.confirm(t('Close without saving the story?'))) return
    onClose()
  }
  useEffect(() => { escape.current = () => (editing ? finishText() : tool ? setTool('') : selected ? setSelected(null) : close()) })

  return createPortal(
    <div className="se" role="dialog" aria-modal="true" aria-label={t('Story editor')}>
      <header className="se-top">
        <button type="button" className="se-round" onClick={close} aria-label={t('Close')}><Icon name="close" /></button>
        {tool === 'draw' ? (
          <div className="se-tools se-pens">
            {(['pen', 'marker', 'neon', 'eraser'] as const).map((k) => <button key={k} type="button" className={`se-style${pen.pen === k ? ' on' : ''}`} onClick={() => setPen({ ...pen, pen: k })}>{t(PEN_LABEL[k])}</button>)}
          </div>
        ) : (
        <div className="se-tools">
          <button type="button" className="se-round" onClick={() => step(true)} disabled={!steps.back} aria-label={t('Undo')} title={t('Undo')}><span className="se-flip"><Icon name="redo" /></span></button>
          <button type="button" className="se-round" onClick={() => step(false)} disabled={!steps.forward} aria-label={t('Redo the step')} title={t('Redo the step')}><Icon name="redo" /></button>
          <button type="button" className="se-round" onClick={() => { setSelected(null); setTool('draw') }} aria-label={t('Draw')} title={t('Draw')}><Icon name="edit" /></button>
          <button type="button" className="se-round" onClick={() => { setSelected(null); setTool('stickers') }} aria-label={t('Stickers')} title={t('Stickers')}><svg className="icon" width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 12.5V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h5.5zM20 12.5 12.5 20M20 12.5h-4.5a3 3 0 0 0-3 3V20M8.5 9.5h.01M14.5 9.5h.01M8.5 13.5c1 1 2.2 1.4 3.5 1.2" /></svg></button>
          <button type="button" className={`se-round${tool === 'bg' ? ' on' : ''}`} onClick={() => { setSelected(null); setTool(tool === 'bg' ? '' : 'bg') }} aria-label={t('Background')} title={t('Background')}><Icon name="image" /></button>
          <button type="button" className="se-round se-aa" onClick={newText} aria-label={t('Add text')} title={t('Add text')}>Aa</button>
        </div>
        )}
        {tool === 'draw'
          ? <button type="button" className="se-done" onClick={() => setTool('')}>{t('Done')}</button>
          : <button type="button" className="se-done" onClick={save} disabled={saving || posterState === 'loading'}>{saving ? t('Saving…') : moving ? `${t('Done')} ▶` : t('Done')}</button>}
      </header>

      <div className="se-stage" ref={boxRef}>
        <div className="se-canvas" style={{ width: view.w, height: view.h }}>
          <Stage ref={stageRef} width={stageW} height={Math.round((stageW * STORY_H) / STORY_W)} scaleX={scale} scaleY={scale}
            style={recording ? { transform: `scale(${view.w / VIDEO_W})`, transformOrigin: '0 0' } : undefined}
            onMouseDown={(e) => { if (tool !== 'draw' && (e.target === e.target.getStage() || e.target.name() === 'bg')) { setSelected(null); setTool('') } }}
            onTouchStart={(e) => { if (tool !== 'draw' && e.evt.touches.length === 1 && (e.target === e.target.getStage() || e.target.name() === 'bg')) { setSelected(null); setTool('') } }}
            onPointerDown={drawStart} onPointerMove={drawMove} onPointerUp={drawEnd} onPointerLeave={drawEnd}
            onTouchMove={touchMove} onTouchEnd={touchEnd}>
            <Layer>
              <Background bg={design.bg} poster={poster} />
              <Rect name="bg" width={STORY_W} height={STORY_H} fill="rgba(0,0,0,0)" />
              {design.layers.filter((l) => l.kind !== 'draw').map((l) => {
                const common = {
                  id: l.id, x: l.x, y: l.y, scaleX: l.scale, scaleY: l.scale, rotation: l.rotation, draggable: tool !== 'draw' && !recording, listening: tool !== 'draw',
                  onMouseDown: () => setSelected(l.id), onTouchStart: () => setSelected(l.id),
                  onDragStart: () => { setSelected(l.id); setDragging(true) },
                  onDragMove: dragMove,
                  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
                    setDragging(false)
                    setGuides({ v: false, h: false })
                    if (binHot) { setBinHot(false); removeLayer(l.id) } else patchLayer(l.id, { x: e.target.x(), y: e.target.y() })
                  },
                  onTransformEnd: (e: Konva.KonvaEventObject<Event>) => { const n = e.target; patchLayer(l.id, { x: n.x(), y: n.y(), scale: n.scaleX(), rotation: n.rotation() }) },
                  ...(l.kind === 'text' ? { onDblClick: () => setEditing(l), onDblTap: () => setEditing(l) } : {}),
                }
                let body: ReactNode = null
                if (l.kind === 'poster') {
                  const w = 960
                  const h = poster ? (w * poster.height) / poster.width : 960
                  body = (
                    <Group offsetX={w / 2} offsetY={h / 2}>
                      {poster
                        ? <KImage image={poster} width={w} height={h} cornerRadius={18} shadowColor="#000" shadowBlur={40} shadowOpacity={0.35} />
                        : (
                          <>
                            <Rect width={w} height={h} cornerRadius={18} fill="#ffffff" opacity={0.92} />
                            <Text width={w} height={h} align="center" verticalAlign="middle" padding={60} text={posterState === 'loading' ? t('Loading the poster…') : titleOf(post)} fontSize={56} fontStyle="700" fontFamily="Inter, Cairo, sans-serif" fill="#0b1f3a" />
                          </>
                        )}
                    </Group>
                  )
                } else if (l.kind === 'sticker') {
                  const sz = stickerSize(l)
                  body = <Group offsetX={sz.w / 2} offsetY={sz.h / 2}><StickerShape l={l} logo={logo} /></Group>
                } else if (l.kind === 'gif') {
                  const img = gifs[l.src]?.image
                  body = img
                    ? <KImage image={img} width={l.w} height={l.h} offsetX={l.w / 2} offsetY={l.h / 2} />
                    : <Rect width={l.w} height={l.h} offsetX={l.w / 2} offsetY={l.h / 2} cornerRadius={20} fill="rgba(255,255,255,0.25)" />
                } else if (l.kind === 'text') {
                  const k = textLook(l)
                  body = (
                    <Label offsetX={k.width / 2} offsetY={k.height / 2}>
                      <Tag fill={l.box === 'none' ? undefined : l.color} opacity={l.box === 'soft' ? 0.75 : 1} cornerRadius={Math.round(l.size * 0.3)} />
                      <Text text={k.text} fontFamily={k.fontFamily} fontStyle={k.fontStyle} fontSize={l.size} lineHeight={1.2} letterSpacing={k.spacing} padding={k.padding}
                        width={k.width} align={k.align} wrap="word" fill={k.neon ? '#ffffff' : k.fill}
                        shadowColor={k.neon ? l.color : '#000000'} shadowBlur={k.neon ? 28 : l.box === 'none' ? 10 : 0} shadowOpacity={k.neon ? 1 : 0.35} />
                    </Label>
                  )
                }
                // The inner group is what moves (pulse, spin and so on), so the layer's own place and size stay as set.
                return <Group key={l.id} {...common}><Group id={`${l.id}-m`}>{body}</Group></Group>
              })}
              <Transformer ref={trRef} rotateEnabled keepRatio enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
                anchorSize={14} anchorCornerRadius={7} borderStroke="#ffffff" anchorStroke="#ffffff" anchorFill="#f97316" rotateAnchorOffset={36}
                boundBoxFunc={(old, next) => (next.width < 30 || next.height < 20 ? old : next)} />
            </Layer>
            {/* Drawings sit above everything, and the eraser only rubs out drawing, as in Instagram. */}
            <Layer listening={false}>
              {design.layers.filter((l): l is DrawLayer => l.kind === 'draw').map((l) => <Stroke key={l.id} points={l.points} pen={l.pen} color={l.color} width={l.width} />)}
              {line && <Stroke points={line.length === 2 ? [...line, line[0] + 1, line[1] + 1] : line} {...pen} />}
            </Layer>
          </Stage>
          {dragging && <>
            <div className="se-safe se-safe-top" style={{ height: SAFE_TOP * scale }} />
            <div className="se-safe se-safe-bottom" style={{ height: SAFE_BOTTOM * scale }} />
            {guides.v && <div className="se-guide se-guide-v" />}
            {guides.h && <div className="se-guide se-guide-h" />}
            <div className={`se-bin${binHot ? ' hot' : ''}`} style={{ left: BIN.x(), top: BIN.y() }} aria-hidden="true"><Icon name="trash" /></div>
          </>}
          {posterState === 'missing' && post.posterUrl && storySaving() && <p className="se-note">{t('The poster could not be loaded. Check that the engine is on.')}</p>}
        </div>
      </div>

      <footer className="se-bottom">
        {problem && <p className="se-problem" dir="auto">{problem}</p>}
        {tool === 'bg' && (
          <div className="se-row" role="group" aria-label={t('Background')}>
            <button type="button" className={`se-swatch se-blur${design.bg.kind === 'blur' ? ' on' : ''}`} onClick={() => change((d) => ({ ...d, bg: { ...d.bg, kind: 'blur' } }))} title={t('Blurred poster')} aria-label={t('Blurred poster')} />
            {GRADIENTS.map(([a, b]) => (
              <button key={a + b} type="button" className={`se-swatch${design.bg.kind === 'gradient' && design.bg.color === a && design.bg.color2 === b ? ' on' : ''}`} style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} onClick={() => change((d) => ({ ...d, bg: { kind: 'gradient', color: a, color2: b } }))} aria-label={`${a} ${b}`} />
            ))}
            {COLORS.map((c) => (
              <button key={c} type="button" className={`se-swatch${design.bg.kind === 'color' && design.bg.color === c ? ' on' : ''}`} style={{ background: c }} onClick={() => change((d) => ({ ...d, bg: { ...d.bg, kind: 'color', color: c } }))} aria-label={c} />
            ))}
          </div>
        )}
        {tool === 'draw' && (
          <>
            <div className="se-row">
              {COLORS.map((c) => <button key={c} type="button" className={`se-dot${pen.color === c ? ' on' : ''}`} style={{ background: c }} onClick={() => setPen({ ...pen, color: c, pen: pen.pen === 'eraser' ? 'pen' : pen.pen })} aria-label={c} />)}
            </div>
            <label className="se-width"><span>{t('Size')}</span><input type="range" min={4} max={60} value={pen.width} onChange={(e) => setPen({ ...pen, width: +e.target.value })} /></label>
          </>
        )}
        {!tool && selectedLayer?.kind === 'sticker' && WORDED.includes(selectedLayer.sticker) && (
          <input className="se-words" dir="auto" value={selectedLayer.sticker === 'price' ? selectedLayer.sub ?? '' : selectedLayer.text} aria-label={t('Sticker words')}
            onChange={(e) => patchLayer(selectedLayer.id, selectedLayer.sticker === 'price' ? { sub: e.target.value } : { text: e.target.value })} />
        )}
        {!tool && selectedLayer?.kind === 'sticker' && COLOURED.includes(selectedLayer.sticker) && (
          <div className="se-row">
            {COLORS.map((c) => <button key={c} type="button" className={`se-dot${selectedLayer.color === c ? ' on' : ''}`} style={{ background: c }} onClick={() => patchLayer(selectedLayer.id, { color: c })} aria-label={c} />)}
          </div>
        )}
        {!tool && selectedLayer && selectedLayer.kind !== 'draw' && (
          <div className="se-row se-motions" role="group" aria-label={t('Motion')}>
            {MOTIONS.filter((m) => m.key !== 'type' || selectedLayer.kind === 'text').map((m) => (
              <button key={m.key} type="button" className={`se-style${(selectedLayer.motion ?? 'none') === m.key ? ' on' : ''}`} onClick={() => patchLayer(selectedLayer.id, { motion: m.key })}>{t(m.label)}</button>
            ))}
          </div>
        )}
        {!tool && selectedLayer && (
          <div className="se-row">
            {selectedLayer.kind === 'text' && <button type="button" className="se-pill" onClick={() => setEditing(selectedLayer)}><Icon name="edit" size={18} />{t('Edit text')}</button>}
            <button type="button" className="se-pill" onClick={() => toFront(selectedLayer.id)}>{t('Bring to front')}</button>
            <button type="button" className="se-pill" onClick={() => patchLayer(selectedLayer.id, { rotation: 0, ...(selectedLayer.kind === 'poster' ? { x: STORY_W / 2, scale: 1 } : {}) })}>{t('Straighten')}</button>
            <button type="button" className="se-pill danger" onClick={() => removeLayer(selectedLayer.id)}><Icon name="trash" size={18} />{t('Remove')}</button>
          </div>
        )}
        {!tool && !selectedLayer && <p className="se-hint">{t('Drag to move, or to the bin to remove. Tap something to resize or turn it (or use two fingers). Double-tap text to change it.')}</p>}
      </footer>

      <div className="se-gif-box" ref={setGifBox} aria-hidden="true" />
      {recording && <div className="se-recording">{t('Making the video…')}</div>}
      {editing && <TextEntry value={editing} onChange={setEditing} onDone={finishText} />}
      {tool === 'stickers' && <StickerTray post={post} onPick={addSticker} onClose={() => setTool('')} />}
    </div>,
    document.body,
  )
}

const PEN_LABEL: Record<PenKind, string> = { pen: 'Pen', marker: 'Marker', neon: 'Neon', eraser: 'Eraser' }

/** One drawn line: a pen, a see-through marker, a glowing neon line, or the eraser. */
function Stroke({ points, pen, color, width }: { points: number[]; pen: PenKind; color: string; width: number }) {
  const base = { points, lineCap: 'round' as const, lineJoin: 'round' as const, tension: 0.35 }
  if (pen === 'eraser') return <Line {...base} stroke="#000" strokeWidth={width * 2} globalCompositeOperation="destination-out" />
  if (pen === 'marker') return <Line {...base} stroke={color} strokeWidth={width * 2.2} opacity={0.55} lineCap="square" />
  if (pen === 'neon') return <Line {...base} stroke="#ffffff" strokeWidth={width} shadowColor={color} shadowBlur={width * 2.2} shadowOpacity={1} />
  return <Line {...base} stroke={color} strokeWidth={width} />
}

/** Typing text, as in Instagram: the story dims, the text is typed in the middle with its style, colour and box. */
function TextEntry({ value, onChange, onDone }: { value: TextLayer; onChange: (l: TextLayer) => void; onDone: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  const s = TEXT_STYLES[value.style]
  const arabic = hasArabic(value.text)
  const set = (patch: Partial<TextLayer>) => onChange({ ...value, ...patch })
  const nextBox = { none: 'solid', solid: 'soft', soft: 'none' } as const
  const nextAlign = { center: 'left', left: 'right', right: 'center' } as const
  return (
    <div className="se-type" onClick={(e) => e.target === e.currentTarget && onDone()}>
      <header className="se-top">
        <button type="button" className="se-round" onClick={() => set({ align: nextAlign[value.align] })} aria-label={t('Align')} title={t('Align')}>
          <Icon name={value.align === 'center' ? 'rows' : value.align === 'left' ? 'left' : 'right'} />
        </button>
        <button type="button" className={`se-round${value.box !== 'none' ? ' on' : ''}`} onClick={() => set({ box: nextBox[value.box] })} aria-label={t('Text box')} title={t('Text box')}>
          <span className="se-a-box">A</span>
        </button>
        <button type="button" className="se-done" onClick={onDone}>{t('Done')}</button>
      </header>
      <div className="se-type-mid">
        <input className="se-size" type="range" min={28} max={180} value={value.size} onChange={(e) => set({ size: +e.target.value })} aria-label={t('Text size')} />
        <textarea ref={ref} dir="auto" rows={3} value={value.text} onChange={(e) => set({ text: e.target.value })} placeholder={t('Type…')}
          style={{
            fontFamily: arabic ? s.arabic : s.font, fontWeight: Number(arabic && s.weight === '400' ? '700' : s.weight), textTransform: s.upper && !arabic ? 'uppercase' : 'none',
            letterSpacing: s.spacing / 2, textAlign: value.align, fontSize: Math.max(18, Math.min(56, value.size / 2.2)),
            color: value.style === 'neon' ? '#fff' : value.box === 'solid' ? ink(value.color) : value.color,
            background: value.box === 'none' ? 'transparent' : value.color, opacity: 1,
            textShadow: value.style === 'neon' ? `0 0 12px ${value.color}, 0 0 4px ${value.color}` : 'none',
          }} />
      </div>
      <div className="se-type-foot">
        <div className="se-row se-styles">
          {(Object.keys(TEXT_STYLES) as TextStyle[]).map((k) => (
            <button key={k} type="button" className={`se-style${value.style === k ? ' on' : ''}`} style={{ fontFamily: TEXT_STYLES[k].font, fontWeight: Number(TEXT_STYLES[k].weight) }} onClick={() => set({ style: k })}>{t(TEXT_STYLES[k].label)}</button>
          ))}
        </div>
        <div className="se-row">
          {COLORS.map((c) => <button key={c} type="button" className={`se-dot${value.color === c ? ' on' : ''}`} style={{ background: c }} onClick={() => set({ color: c })} aria-label={c} />)}
        </div>
      </div>
    </div>
  )
}
