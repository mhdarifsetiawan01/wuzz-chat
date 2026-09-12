// mediaCache.ts — Client-Side Offline Media Storage berbasis Browser IndexedDB.
// Memungkinkan file gambar, dokumen, dan audio tetap dapat dibuka secara instan dan offline
// bahkan setelah file fisik di server telah dihapus (WhatsApp Store-and-Forward Lifecycle).

const DB_NAME = 'wuzzchat_media_db'
const DB_VERSION = 1
const STORE_NAME = 'media_blobs'

interface CachedMediaRecord {
  url: string
  blob: Blob
  mimeType: string
  fileName?: string
  size: number
  cachedAt: number
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB tidak didukung di lingkungan ini.'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'url' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Mengambil Blob media dari IndexedDB lokal.
 */
export async function getCachedMediaBlob(url: string): Promise<Blob | null> {
  if (!url || typeof window === 'undefined') return null
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(url)

      request.onsuccess = () => {
        const record = request.result as CachedMediaRecord | undefined
        if (record && record.blob) {
          resolve(record.blob)
        } else {
          resolve(null)
        }
      }

      request.onerror = () => resolve(null)
    })
  } catch (err) {
    console.warn('[MediaCache] Gagal membaca dari IndexedDB:', err)
    return null
  }
}

/**
 * Menyimpan Blob media ke IndexedDB lokal.
 */
export async function setCachedMediaBlob(
  url: string,
  blob: Blob,
  mimeType: string = 'application/octet-stream',
  fileName?: string
): Promise<void> {
  if (!url || !blob || typeof window === 'undefined') return
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)

      const record: CachedMediaRecord = {
        url,
        blob,
        mimeType: mimeType || blob.type || 'application/octet-stream',
        fileName,
        size: blob.size,
        cachedAt: Date.now(),
      }

      const request = store.put(record)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } catch (err) {
    console.warn('[MediaCache] Gagal menyimpan ke IndexedDB:', err)
  }
}

/**
 * Mengambil statistik penggunaan cache lokal (jumlah file & total bytes).
 */
export async function getMediaCacheStats(): Promise<{ count: number; totalBytes: number }> {
  if (typeof window === 'undefined') return { count: 0, totalBytes: 0 }
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.openCursor()

      let count = 0
      let totalBytes = 0

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor) {
          count++
          totalBytes += cursor.value.size || 0
          cursor.continue()
        } else {
          resolve({ count, totalBytes })
        }
      }

      request.onerror = () => resolve({ count: 0, totalBytes: 0 })
    })
  } catch {
    return { count: 0, totalBytes: 0 }
  }
}

/**
 * Menghapus seluruh file yang tersimpan di IndexedDB cache.
 */
export async function clearMediaCache(): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.clear()

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } catch (err) {
    console.warn('[MediaCache] Gagal membersihkan IndexedDB:', err)
  }
}
