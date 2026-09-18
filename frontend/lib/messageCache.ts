// messageCache.ts — Client-Side Persistent Decrypted Message Store berbasis IndexedDB.
//
// Arsitektur "Cache-First":
// Setiap pesan yang berhasil didekripsi oleh browser disimpan secara persisten di sini,
// sehingga riwayat chat tetap dapat dibaca meskipun kunci kriptografi lawan bicara
// telah berubah (misal karena lawan bicara melakukan reset device).
//
// Konsisten dengan pola WhatsApp: plaintext tersimpan lokal di perangkat pengguna sendiri.
// Keamanan dijamin di level device (bukan di dalam browser storage layer).

const DB_NAME = 'wuzzchat_msg_db'
const DB_VERSION = 1
const STORE_NAME = 'messages'
const ROOM_IDX = 'by_room'

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

export interface CachedReplyTo {
  id: string
  content: string
  sender_id: string
  sender_display_name?: string
}

export interface CachedMessageRecord {
  id: string                    // message UUID (keyPath IndexedDB)
  room_id: string               // conversation ID (indexed)
  content: string               // PLAINTEXT — sudah terdekripsi
  sender_id: string
  sender_username?: string
  sender_display_name?: string
  sender_avatar_url?: string
  created_at: string
  status: string                // 'pending' | 'sent' | 'delivered' | 'read' | 'deleted'
  type: string                  // 'text' | 'image' | 'audio' | 'file'
  media_url?: string
  media_mime_type?: string
  media_file_name?: string
  media_size?: number
  reply_to?: CachedReplyTo
  reactions?: Record<string, string[]>
  cachedAt: number              // epoch ms — kapan record ini terakhir disimpan
}

// Status weight untuk mencegah downgrade (Milestone 4 anti-regression)
const STATUS_WEIGHT: Record<string, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  deleted: 99,
}

// ----------------------------------------------------------------
// DB Lifecycle
// ----------------------------------------------------------------

function openMsgDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('[MsgCache] IndexedDB tidak didukung di lingkungan ini.'))
      return
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        // Index untuk lookup cepat O(log n) per percakapan
        store.createIndex(ROOM_IDX, 'room_id', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// ----------------------------------------------------------------
// Read
// ----------------------------------------------------------------

/**
 * Mengambil semua pesan yang ter-cache untuk satu room, diurutkan ascending (terlama dulu).
 * Gunakan `limit` untuk membatasi jumlah yang diambil (default: tidak terbatas).
 */
export async function getCachedMessages(
  roomId: string,
  limit?: number
): Promise<CachedMessageRecord[]> {
  if (!roomId || typeof window === 'undefined') return []

  try {
    const db = await openMsgDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const index = store.index(ROOM_IDX)
      const request = index.getAll(IDBKeyRange.only(roomId))

      request.onsuccess = () => {
        db.close()
        const results = (request.result as CachedMessageRecord[]) || []
        // Urutkan ascending berdasarkan created_at (string ISO sort aman)
        results.sort((a, b) => a.created_at.localeCompare(b.created_at))
        resolve(limit ? results.slice(-limit) : results)
      }

      request.onerror = () => {
        db.close()
        resolve([])
      }
    })
  } catch (err) {
    console.warn('[MsgCache] Gagal membaca pesan dari IndexedDB:', err)
    return []
  }
}

/**
 * Mengambil timestamp (created_at ISO string) dari pesan terakhir yang tersimpan di cache.
 * Digunakan sebagai checkpoint `since` untuk delta offline sync saat reconnect.
 */
export async function getLastCachedMessageTimestamp(roomId: string): Promise<string | undefined> {
  const msgs = await getCachedMessages(roomId, 1)
  return msgs.length > 0 ? msgs[msgs.length - 1].created_at : undefined
}

// ----------------------------------------------------------------
// Write — Single Record
// ----------------------------------------------------------------

/**
 * Menyimpan atau memperbarui (upsert) satu record pesan ke IndexedDB.
 * Jika record sudah ada (by id), data akan di-overwrite sepenuhnya.
 */
export async function cacheMessage(msg: CachedMessageRecord): Promise<void> {
  if (!msg?.id || typeof window === 'undefined') return

  try {
    const db = await openMsgDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.put({ ...msg, cachedAt: Date.now() })
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      tx.oncomplete = () => db.close()
    })
  } catch (err) {
    console.warn('[MsgCache] Gagal menyimpan pesan ke IndexedDB:', err)
  }
}

// ----------------------------------------------------------------
// Write — Batch Upsert
// ----------------------------------------------------------------

/**
 * Menyimpan banyak pesan sekaligus dalam satu transaksi (efisien untuk sync awal).
 * Setiap record di-upsert; jika sudah ada, akan di-overwrite.
 */
export async function cacheMessages(msgs: CachedMessageRecord[]): Promise<void> {
  if (!msgs?.length || typeof window === 'undefined') return

  try {
    const db = await openMsgDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const now = Date.now()

      for (const msg of msgs) {
        if (msg?.id) {
          store.put({ ...msg, cachedAt: now })
        }
      }

      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        reject(tx.error)
      }
    })
  } catch (err) {
    console.warn('[MsgCache] Gagal batch menyimpan pesan ke IndexedDB:', err)
  }
}

// ----------------------------------------------------------------
// Write — Partial Update (Status Tanda Terima)
// ----------------------------------------------------------------

/**
 * Memperbarui hanya field `status` pada satu record pesan yang sudah ada di cache.
 * Menggunakan anti-regression weight: status tidak akan di-downgrade
 * (misal dari 'read' → 'sent' tidak akan diizinkan).
 */
export async function updateCachedMessageStatus(
  msgId: string,
  newStatus: string
): Promise<void> {
  if (!msgId || typeof window === 'undefined') return

  try {
    const db = await openMsgDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const getReq = store.get(msgId)

      getReq.onsuccess = () => {
        const existing = getReq.result as CachedMessageRecord | undefined
        if (!existing) {
          db.close()
          resolve()
          return
        }

        const currentWeight = STATUS_WEIGHT[existing.status] ?? 0
        const newWeight = STATUS_WEIGHT[newStatus] ?? 0

        // Jangan downgrade (kecuali 'deleted' yang selalu menang)
        if (newStatus !== 'deleted' && newWeight <= currentWeight) {
          db.close()
          resolve()
          return
        }

        const updated: CachedMessageRecord = {
          ...existing,
          status: newStatus,
          cachedAt: Date.now(),
        }
        const putReq = store.put(updated)
        putReq.onsuccess = () => resolve()
        putReq.onerror = () => reject(putReq.error)
      }

      getReq.onerror = () => reject(getReq.error)
      tx.oncomplete = () => db.close()
    })
  } catch (err) {
    console.warn('[MsgCache] Gagal update status pesan di IndexedDB:', err)
  }
}

// ----------------------------------------------------------------
// Delete — Single Record
// ----------------------------------------------------------------

/**
 * Menghapus satu record pesan dari IndexedDB (digunakan untuk "Hapus untuk Saya").
 */
export async function deleteCachedMessage(msgId: string): Promise<void> {
  if (!msgId || typeof window === 'undefined') return

  try {
    const db = await openMsgDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.delete(msgId)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      tx.oncomplete = () => db.close()
    })
  } catch (err) {
    console.warn('[MsgCache] Gagal hapus pesan dari IndexedDB:', err)
  }
}

// ----------------------------------------------------------------
// Delete — All Messages in a Room
// ----------------------------------------------------------------

/**
 * Menghapus semua record pesan untuk satu room dari IndexedDB.
 * Digunakan saat user memilih "Hapus Percakapan" (cleared_at).
 */
export async function clearRoomCache(roomId: string): Promise<void> {
  if (!roomId || typeof window === 'undefined') return

  try {
    const db = await openMsgDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const index = store.index(ROOM_IDX)
      const cursorReq = index.openCursor(IDBKeyRange.only(roomId))
      const toDelete: string[] = []

      cursorReq.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor) {
          toDelete.push(cursor.value.id as string)
          cursor.continue()
        } else {
          // Hapus semua id yang dikumpulkan
          for (const id of toDelete) {
            store.delete(id)
          }
          resolve()
        }
      }

      cursorReq.onerror = () => reject(cursorReq.error)
      tx.oncomplete = () => db.close()
    })
  } catch (err) {
    console.warn('[MsgCache] Gagal clear room cache dari IndexedDB:', err)
  }
}

/**
 * Menghapus SELURUH record pesan di IndexedDB.
 * Dipanggil saat pengguna melakukan logout eksplisit dari perangkat
 * untuk mencegah kebocoran data di perangkat bersama (Shared Computer / Public PC).
 */
export async function clearAllMessageCache(): Promise<void> {
  if (typeof window === 'undefined' || !window.indexedDB) return

  try {
    const db = await openMsgDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const clearReq = store.clear()
      clearReq.onsuccess = () => resolve()
      clearReq.onerror = () => reject(clearReq.error)
      tx.oncomplete = () => db.close()
    })
  } catch (err) {
    console.warn('[MsgCache] Gagal membersihkan seluruh cache pesan:', err)
  }
}

// ----------------------------------------------------------------
// Utility — Konversi Message ke CachedMessageRecord
// ----------------------------------------------------------------

/**
 * Helper untuk mengkonversi objek Message dari state Redux/React
 * menjadi CachedMessageRecord yang siap disimpan ke IndexedDB.
 * Hanya menyimpan field yang relevan (bukan raw_content ciphertext).
 */
export function toCachedRecord(msg: {
  id: string
  room_id?: string
  conversation_id?: string
  content: string
  sender_id: string
  sender_username?: string
  sender_display_name?: string
  sender_avatar_url?: string
  created_at: string
  status?: string
  type?: string
  media_url?: string
  media_mime_type?: string
  media_file_name?: string
  media_size?: number
  reply_to?: { id: string; content: string; sender_id: string; sender_display_name?: string }
  reactions?: Record<string, string[]>
}): CachedMessageRecord {
  return {
    id: msg.id,
    room_id: msg.room_id || msg.conversation_id || '',
    content: msg.content,
    sender_id: msg.sender_id,
    sender_username: msg.sender_username,
    sender_display_name: msg.sender_display_name,
    sender_avatar_url: msg.sender_avatar_url,
    created_at: msg.created_at,
    status: msg.status || 'sent',
    type: msg.type || 'text',
    media_url: msg.media_url,
    media_mime_type: msg.media_mime_type,
    media_file_name: msg.media_file_name,
    media_size: msg.media_size,
    reply_to: msg.reply_to
      ? {
          id: msg.reply_to.id,
          content: msg.reply_to.content,
          sender_id: msg.reply_to.sender_id,
          sender_display_name: msg.reply_to.sender_display_name,
        }
      : undefined,
    reactions: msg.reactions,
    cachedAt: Date.now(),
  }
}
