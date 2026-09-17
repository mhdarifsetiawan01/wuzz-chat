// imageCompressor.ts — Client-side Image Compression Engine (WhatsApp-style)
// Mengompresi gambar otomatis sebelum diunggah ke server untuk menghemat bandwidth & storage.

const STORAGE_KEY = 'wuzz_compress_images'

/**
 * Mengecek apakah fitur kompresi gambar client aktif (Default: true).
 */
export function isImageCompressionEnabled(): boolean {
  if (typeof window === 'undefined') return true
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === null) return true // Default ON
  return saved !== 'false'
}

/**
 * Mengubah status aktif kompresi gambar (bisa dimatikan kapan saja oleh user).
 */
export function setImageCompressionEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false')
}

interface CompressionOptions {
  maxDimension?: number // Dimensi maksimal lebar/tinggi (default 1600px)
  quality?: number      // Kualitas WebP/JPEG (default 0.82)
}

/**
 * Mengompresi file gambar jika fitur aktif dan ukuran > 150 KB.
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  // Jika kompresi dimatikan oleh user atau bukan tipe gambar, kembalikan file asli
  if (!isImageCompressionEnabled()) {
    return file
  }

  const { maxDimension = 1600, quality = 0.82 } = options

  // Jangan sentuh SVG, GIF animasi, atau file non-gambar
  if (!file.type.startsWith('image/') || file.type.includes('svg') || file.type.includes('gif')) {
    return file
  }

  // Jika ukuran file sangat kecil (< 150 KB), tidak perlu dikompres
  if (file.size < 150 * 1024) {
    return file
  }

  try {
    const bitmap = await createImageBitmap(file)
    let { width, height } = bitmap

    // Hitung aspect ratio scaling jika melebihi maxDimension
    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = Math.round((height * maxDimension) / width)
        width = maxDimension
      } else {
        width = Math.round((width * maxDimension) / height)
        height = maxDimension
      }
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return file
    }

    // Gambar ke canvas
    ctx.drawImage(bitmap, 0, 0, width, height)

    // Tentukan output format: prioritaskan webp jika didukung browser
    const outputType = 'image/webp'

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), outputType, quality)
    })

    if (!blob || blob.size >= file.size) {
      // Jika hasil kompresi ternyata tidak lebih kecil dari file asli, gunakan file asli
      return file
    }

    // Ganti ekstensi nama file menjadi .webp jika berhasil dikompres ke webp
    let newName = file.name
    const dotIndex = newName.lastIndexOf('.')
    if (dotIndex !== -1) {
      newName = newName.substring(0, dotIndex) + '.webp'
    } else {
      newName += '.webp'
    }

    return new File([blob], newName, {
      type: outputType,
      lastModified: Date.now(),
    })
  } catch (err) {
    console.warn('[ImageCompressor] Gagal mengompresi gambar, menggunakan file asli:', err)
    return file
  }
}

/**
 * Mengompresi dan memotong gambar avatar menjadi persegi simetris (1:1)
 * Menghasilkan Data URL WebP sangat ringan (< 15KB) untuk profil pengguna.
 */
export async function compressAvatarToDataUrl(
  file: File,
  size = 160,
  quality = 0.85
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = size
          canvas.height = size
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            resolve(e.target?.result as string)
            return
          }

          // Center-crop ke square
          const minDim = Math.min(img.width, img.height)
          const sx = (img.width - minDim) / 2
          const sy = (img.height - minDim) / 2

          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size)

          // Coba toDataURL WebP
          let dataUrl = canvas.toDataURL('image/webp', quality)
          if (!dataUrl.startsWith('data:image/webp')) {
            dataUrl = canvas.toDataURL('image/jpeg', quality)
          }
          resolve(dataUrl)
        } catch (err) {
          reject(err)
        }
      }
      img.onerror = reject
      img.src = e.target?.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

