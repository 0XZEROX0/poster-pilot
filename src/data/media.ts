import { auth } from './firebase'
import type { PostMedia } from './types'

// Photos and videos for text, photo and video posts go to Google Drive (AI Designs / Uploads), not to Firebase:
// Firebase Storage needs the paid plan. The engine's "Static OS - Upload post media" workflow hands out a Drive
// upload link; the browser sends the file there itself (a big video never passes through the engine's computer),
// and then asks the engine to check the file and share it by link, so Facebook and Instagram can fetch it.

const NUDGE = import.meta.env.VITE_ENGINE_NUDGE_URL as string | undefined
const MEDIA_URL = NUDGE?.replace(/static-os-nudge$/, 'static-os-media')

/** True when this build of the app can upload photos and videos (not in the demo). */
export const mediaUploads = (): boolean => !!MEDIA_URL && !!auth

export const MAX_PHOTOS = 10
const PHOTO_MB = 30
const VIDEO_MB = 300
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const VIDEO_TYPES = ['video/mp4', 'video/quicktime']
/** Instagram takes photos from 4:5 (tall) to 1.91:1 (wide). Others are padded with white to the nearest one. */
const IG_TALLEST = 4 / 5
const IG_WIDEST = 1.91
/** Photos are sent at most this wide or tall (Instagram shows 1080, Facebook up to 2048). */
const LONG_SIDE = 2048

export type MediaProblem = 'type' | 'size' | 'short' | 'long' | 'failed' | 'no-engine'

/** What is wrong with a file before it is sent, or '' when it can go. */
export function checkFile(file: File): MediaProblem | '' {
  const type = file.type.toLowerCase()
  if (PHOTO_TYPES.includes(type)) return file.size <= PHOTO_MB * 1024 * 1024 ? '' : 'size'
  if (VIDEO_TYPES.includes(type)) return file.size <= VIDEO_MB * 1024 * 1024 ? '' : 'size'
  return 'type'
}

export const isVideoFile = (file: File) => VIDEO_TYPES.includes(file.type.toLowerCase())

/** A video's length in seconds (0 when the browser cannot tell). */
export function videoSeconds(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.preload = 'metadata'
    const done = (s: number) => { URL.revokeObjectURL(url); resolve(Number.isFinite(s) ? s : 0) }
    v.onloadedmetadata = () => done(v.duration)
    v.onerror = () => done(0)
    v.src = url
  })
}

/**
 * A photo as a JPEG (Instagram takes only JPEG), at most LONG_SIDE wide or tall. For Instagram, a photo taller than
 * 4:5 or wider than 1.91:1 gets white bars so nothing is cut off.
 */
export async function preparePhoto(file: File, forInstagram: boolean): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, LONG_SIDE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale)
  let cw = w, ch = h
  if (forInstagram) {
    const ratio = w / h
    if (ratio < IG_TALLEST) cw = Math.round(h * IG_TALLEST)
    else if (ratio > IG_WIDEST) ch = Math.round(w / IG_WIDEST)
  }
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const g = canvas.getContext('2d')
  if (!g) throw new Error('canvas')
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, cw, ch)
  g.drawImage(bitmap, Math.round((cw - w) / 2), Math.round((ch - h) / 2), w, h)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
  if (!blob) throw new Error('jpeg')
  return blob
}

async function ask(fields: Record<string, string>): Promise<Record<string, unknown>> {
  const user = auth?.currentUser
  if (!MEDIA_URL || !user) throw new Error('no-engine')
  // A form post is a "simple" request: the browser does not ask the engine first.
  const res = await fetch(MEDIA_URL, { method: 'POST', body: new URLSearchParams({ token: await user.getIdToken(), ...fields }) })
  const out = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || out.ok !== true) throw new Error(String(out.error || `engine ${res.status}`))
  return out
}

/** Sends the file to the Drive upload link, telling how far it got (0 to 1). Resolves to the new file's id. */
function put(url: string, body: Blob, type: string, onProgress: (share: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', type)
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total) }
    xhr.onload = () => {
      try {
        const id = (JSON.parse(xhr.responseText) as { id?: string }).id
        if (xhr.status >= 200 && xhr.status < 300 && id) resolve(id)
        else reject(new Error(`drive ${xhr.status}`))
      } catch {
        reject(new Error(`drive ${xhr.status}`))
      }
    }
    xhr.onerror = () => reject(new Error('drive'))
    xhr.send(body)
  })
}

/**
 * Uploads one photo or video for a post: photos are made JPEG first (padded for Instagram when it goes there).
 * Resolves to the file as the post keeps it.
 */
export async function uploadMedia(file: File, forInstagram: boolean, onProgress: (share: number) => void): Promise<PostMedia> {
  const video = isVideoFile(file)
  const body: Blob = video ? file : await preparePhoto(file, forInstagram)
  const type = video ? file.type.toLowerCase() : 'image/jpeg'
  const name = video ? file.name : file.name.replace(/\.[^.]+$/, '') + '.jpg'
  const start = await ask({ op: 'start', name, type, size: String(body.size) })
  const id = await put(String(start.url), body, type, onProgress)
  const done = await ask({ op: 'finish', id })
  return { id: String(done.id || id), type: video ? 'video' : 'image', ...(Number(done.w) ? { w: Number(done.w) } : {}), ...(Number(done.h) ? { h: Number(done.h) } : {}) }
}
