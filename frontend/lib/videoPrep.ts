// Pemeriksaan video di browser sebelum diunggah: durasi, ukuran, dan pembuatan thumbnail JPEG.
// Batas harus sama dengan backend (MAX_VIDEO_UPLOAD_MB, MAX_VIDEO_DURATION_SEC, thumbnail <= 512 KB);
// backend tetap memvalidasi ulang saat menerbitkan tiket unggah.

export const VIDEO_DEFAULT_MAX_BYTES = 25 * 1024 * 1024
export const VIDEO_DEFAULT_MAX_DURATION_SEC = 60
export const VIDEO_THUMB_MAX_BYTES = 512 * 1024

export class VideoPrepError extends Error {}

export interface InspectedVideo {
  durationSec: number
  thumb: Blob
}

export function isVideoFile(file: File): boolean {
  if (file.type.toLowerCase().startsWith('video/')) return true
  return /\.(mp4|mov|m4v|webm)$/i.test(file.name)
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', quality))
}

export async function inspectVideo(
  file: File,
  limits: { maxBytes?: number; maxDurationSec?: number } = {}
): Promise<InspectedVideo> {
  const maxBytes = limits.maxBytes ?? VIDEO_DEFAULT_MAX_BYTES
  const maxDuration = limits.maxDurationSec ?? VIDEO_DEFAULT_MAX_DURATION_SEC

  if (file.size > maxBytes) {
    throw new VideoPrepError(
      `Video terlalu besar (${(file.size / 1024 / 1024).toFixed(1)} MB). Maksimal ${Math.round(maxBytes / 1024 / 1024)} MB.`
    )
  }

  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'metadata'
  video.src = url

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new VideoPrepError('Video tidak dapat dibaca. Coba format MP4.')), 15000)
      video.onloadedmetadata = () => {
        clearTimeout(timer)
        resolve()
      }
      video.onerror = () => {
        clearTimeout(timer)
        reject(new VideoPrepError('Format video tidak didukung browser ini. Coba format MP4 (H.264).'))
      }
    })

    const durationSec = video.duration
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      throw new VideoPrepError('Durasi video tidak terbaca. Coba video lain.')
    }
    if (durationSec > maxDuration) {
      throw new VideoPrepError(`Video terlalu panjang. Durasi maksimal ${maxDuration} detik.`)
    }

    // Ambil bingkai awal sebagai thumbnail
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new VideoPrepError('Gagal membuat pratinjau video.')), 15000)
      video.onseeked = () => {
        clearTimeout(timer)
        resolve()
      }
      video.onerror = () => {
        clearTimeout(timer)
        reject(new VideoPrepError('Gagal membuat pratinjau video.'))
      }
      video.currentTime = Math.min(0.1, durationSec / 2)
    })

    const scale = Math.min(1, 640 / (video.videoWidth || 640))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round((video.videoWidth || 640) * scale))
    canvas.height = Math.max(1, Math.round((video.videoHeight || 360) * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new VideoPrepError('Gagal membuat pratinjau video.')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    for (const quality of [0.7, 0.5, 0.3]) {
      const blob = await canvasToJpeg(canvas, quality)
      if (blob && blob.size > 0 && blob.size <= VIDEO_THUMB_MAX_BYTES) {
        return { durationSec, thumb: blob }
      }
    }
    throw new VideoPrepError('Gagal membuat pratinjau video. Coba video lain.')
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}

// Format "m:ss" untuk label durasi.
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

// Thumbnail video diturunkan dari URL video (<kunci>.mp4 -> <kunci>.thumb.jpg), sama seperti backend/mobile.
export function getVideoThumbnailUrl(videoUrl?: string | null): string | null {
  if (!videoUrl || !/^https?:\/\//i.test(videoUrl)) return null
  const clean = videoUrl.split(/[?#]/)[0]
  const m = clean.match(/\.(mp4|mov|m4v|webm)$/i)
  if (!m) return null
  return clean.slice(0, clean.length - m[0].length) + '.thumb.jpg'
}
