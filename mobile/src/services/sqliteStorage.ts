/**
 * WuzzChat Mobile - SQLite Local Storage Service
 * Milestone M-Mobile-8.18: Offline-First Persistent Storage Layer
 * 
 * Performance & Thermal Protections:
 * - SQLite WAL Mode (PRAGMA journal_mode = WAL) to eliminate read/write locks & disk I/O thrashing.
 * - PRAGMA synchronous = NORMAL to avoid repetitive costly hardware fsync (prevents battery drain & device overheating).
 * - Multi-user isolation scoped by user_id to prevent data leakage across accounts.
 * - Transactional batching via withTransactionAsync.
 */

import * as SQLite from 'expo-sqlite';
import { createExclusiveQueue } from './exclusiveQueue';
import { Conversation, Message, normalizeReactions, FeedPost, FriendItem } from '../api/types';

const DB_NAME = 'wuzzchat.db';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Seluruh operasi tulis berjalan satu per satu lewat antrean ini (koneksi SQLite tunggal).
 * Lihat exclusiveQueue.ts. Tidak reentrant: fungsi bergembok jangan `await` fungsi bergembok lain;
 * gunakan helper internal tanpa gembok (mis. sweepOversizedRooms, compactDatabase).
 */
const runExclusive = createExclusiveQueue();


/**
 * Tanda tangan konten terakhir yang DITULIS (atau dimuat) per pesan: key `${userId}:${roomId}` -> (messageId -> hash).
 * Dipakai saveStoredMessages untuk melewati penulisan data identik. Sebelumnya setiap rekonsiliasi riwayat menulis ulang
 * seluruh jendela pesan (50 baris x beberapa kali per pembukaan chat) walau tidak ada yang berubah.
 * Harus dikosongkan setiap kali baris dihapus di luar jalur ini (pruning, pembersihan cache) agar tidak ada penulisan
 * yang salah dilewati.
 */
const persistedMessageSignatures = new Map<string, Map<string, number>>();
const MAX_SIGNATURES_PER_ROOM = 2000;

function signatureRoomKey(userId: string, roomId: string): string {
  return `${userId}:${roomId}`;
}

/** JSON dengan kunci terurut agar urutan properti objek tidak memengaruhi tanda tangan. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Hash 53-bit (cyrb53): cukup untuk membedakan versi sebuah pesan; bukan untuk keamanan. */
function hash53(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function messageSignature(message: Message): number {
  return hash53(canonicalJson({ ...message, reactions: normalizeReactions(message.reactions) }));
}

/**
 * Sama seperti persistedMessageSignatures, untuk daftar percakapan: userId -> (conversationId -> hash).
 * Daftar disimpan ulang pada setiap refresh (cold start 2x, setiap kembali ke daftar) walau tidak ada yang berubah.
 * Dikosongkan saat baris percakapan diubah di luar jalur saveStoredConversations atau dihapus.
 */
const persistedConversationSignatures = new Map<string, Map<string, number>>();

function conversationSignature(conversation: Conversation): number {
  return hash53(canonicalJson(conversation));
}

function forgetConversationSignature(userId: string, roomId: string): void {
  persistedConversationSignatures.get(userId)?.delete(roomId);
}

function forgetRoomSignatures(userId: string, roomId: string): void {
  persistedMessageSignatures.delete(signatureRoomKey(userId, roomId));
}

/**
 * Initializes and returns the singleton SQLite database instance.
 * Applies performance PRAGMAs and creates required tables and indexes.
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      const db = await SQLite.openDatabaseAsync(DB_NAME);

      // Performance & Thermal Hardening PRAGMAs:
      // WAL mode permits concurrent reads and non-blocking writes.
      // synchronous = NORMAL reduces NAND flash write wear and CPU spikes.
      await db.execAsync(`
        PRAGMA auto_vacuum = INCREMENTAL;
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA foreign_keys = ON;
        PRAGMA journal_size_limit = 1048576;

        CREATE TABLE IF NOT EXISTS local_conversations (
          user_id TEXT NOT NULL,
          id TEXT NOT NULL,
          type TEXT,
          name TEXT,
          avatar_url TEXT,
          last_message TEXT,
          last_message_at TEXT,
          unread_count INTEGER DEFAULT 0,
          is_pinned INTEGER DEFAULT 0,
          peer_id TEXT,
          peer_public_key TEXT,
          updated_at TEXT,
          raw_json TEXT NOT NULL,
          PRIMARY KEY (user_id, id)
        );

        CREATE INDEX IF NOT EXISTS idx_conv_user_sort 
        ON local_conversations(user_id, is_pinned DESC, updated_at DESC);

        CREATE TABLE IF NOT EXISTS local_messages (
          user_id TEXT NOT NULL,
          id TEXT NOT NULL,
          room_id TEXT NOT NULL,
          sender_id TEXT NOT NULL,
          sender_nickname TEXT,
          content TEXT,
          type TEXT DEFAULT 'text',
          status TEXT DEFAULT 'sent',
          reply_to_id TEXT,
          media_url TEXT,
          local_media_uri TEXT,
          created_at TEXT NOT NULL,
          raw_json TEXT NOT NULL,
          PRIMARY KEY (user_id, id)
        );

        CREATE INDEX IF NOT EXISTS idx_msg_user_room_created 
        ON local_messages(user_id, room_id, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_msg_user_room_media 
        ON local_messages(user_id, room_id, type, created_at DESC);

        CREATE TABLE IF NOT EXISTS local_call_logs (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          room_id TEXT,
          peer_id TEXT NOT NULL,
          peer_username TEXT,
          peer_display_name TEXT,
          call_type TEXT NOT NULL,
          duration_seconds INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL,
          status TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_call_user_created 
        ON local_call_logs(user_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS local_feed_posts (
          user_id TEXT NOT NULL,
          feed_tab TEXT NOT NULL DEFAULT 'latest',
          id TEXT NOT NULL,
          tenant_id TEXT,
          content TEXT,
          media_urls TEXT,
          post_type TEXT,
          is_pinned INTEGER DEFAULT 0,
          metadata TEXT,
          likes_count INTEGER DEFAULT 0,
          comments_count INTEGER DEFAULT 0,
          is_liked INTEGER DEFAULT 0,
          author_id TEXT,
          author_username TEXT,
          author_display_name TEXT,
          author_avatar_url TEXT,
          author_role TEXT,
          author_is_verified INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT,
          raw_json TEXT NOT NULL,
          PRIMARY KEY (user_id, feed_tab, id)
        );

        CREATE INDEX IF NOT EXISTS idx_feed_tab_sort 
        ON local_feed_posts(user_id, feed_tab, is_pinned DESC, created_at DESC);

        CREATE TABLE IF NOT EXISTS local_friends (
          user_id TEXT NOT NULL,
          id TEXT NOT NULL,
          username TEXT NOT NULL,
          display_name TEXT NOT NULL,
          avatar_url TEXT,
          status_message TEXT,
          bio TEXT,
          role TEXT,
          is_verified INTEGER DEFAULT 0,
          is_private_account INTEGER DEFAULT 0,
          connection_id TEXT NOT NULL,
          connected_at TEXT NOT NULL,
          raw_json TEXT NOT NULL,
          PRIMARY KEY (user_id, id)
        );

        CREATE INDEX IF NOT EXISTS idx_friends_user_connected 
        ON local_friends(user_id, connected_at DESC);
      `);

      // Safe schema migration for local_call_logs.room_id (backward-compatibility)
      try {
        await db.runAsync('ALTER TABLE local_call_logs ADD COLUMN room_id TEXT;');
      } catch {
        // Column already exists, safe to ignore
      }

      // Safe schema migration for local_feed_posts.feed_tab
      try {
        await db.runAsync("ALTER TABLE local_feed_posts ADD COLUMN feed_tab TEXT NOT NULL DEFAULT 'latest';");
      } catch {
        // Column already exists, safe to ignore
      }

      dbInstance = db;
      return db;
    } catch (error) {
      console.warn('[sqliteStorage] Failed to initialize SQLite database:', error);
      initPromise = null;
      throw error;
    }
  })();

  return initPromise;
}

/**
 * Retrieve cached conversations from local SQLite for a specific user.
 * Ordered by pinned conversations first, then latest updated_at descending.
 * Safe fallback: returns empty array on failure.
 */
export async function getStoredConversations(userId: string): Promise<Conversation[]> {
  if (!userId) return [];

  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ raw_json: string }>(
      `SELECT raw_json FROM local_conversations 
       WHERE user_id = ? 
       ORDER BY is_pinned DESC, updated_at DESC 
       LIMIT 100`,
      [userId]
    );

    const conversations: Conversation[] = [];
    const signatures = persistedConversationSignatures.get(userId) ?? new Map<string, number>();
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.raw_json) as Conversation;
        if (parsed && parsed.id) {
          conversations.push(parsed);
          signatures.set(parsed.id, conversationSignature(parsed));
        }
      } catch (err) {
        // Skip corrupted row gracefully
      }
    }

    persistedConversationSignatures.set(userId, signatures);
    return conversations;
  } catch (error) {
    console.warn('[sqliteStorage] Failed to getStoredConversations:', error);
    return [];
  }
}

/**
 * Persists an array of conversations to local SQLite for a specific user.
 * Wrapped in a single transaction to minimize disk I/O and device heating.
 */
export function saveStoredConversations(
  userId: string,
  conversations: Conversation[]
): Promise<void> {
  return runExclusive(async () => {
    if (!userId || !conversations || conversations.length === 0) return;

    try {
      const db = await getDatabase();

      // Hanya tulis percakapan yang baru atau berubah (lihat persistedConversationSignatures)
      const signatures = persistedConversationSignatures.get(userId) ?? new Map<string, number>();
      const pending: { c: Conversation; convId: string; signature: number }[] = [];
      for (const c of conversations) {
        const convId = c.id || c.room_id;
        if (!convId) continue;
        const signature = conversationSignature(c);
        if (signatures.get(convId) === signature) continue;
        pending.push({ c, convId, signature });
      }
      if (pending.length === 0) return;

      await db.withTransactionAsync(async () => {
        for (const { c, convId } of pending) {
          const isPinned = c.is_pinned || c.pinned ? 1 : 0;
          const lastMsg =
            typeof c.last_message === 'string'
              ? c.last_message
              : c.last_message?.content || '';
          const lastMsgAt =
            typeof c.last_message === 'object'
              ? c.last_message?.timestamp || c.last_message?.created_at || ''
              : '';
          const updatedAt = c.updated_at || lastMsgAt || new Date().toISOString();
          const rawJson = JSON.stringify(c);

          // UPSERT (bukan INSERT OR REPLACE): perbarui baris di tempat tanpa hapus-sisip entri indeks
          await db.runAsync(
            `INSERT INTO local_conversations (
              user_id, id, type, name, avatar_url, last_message, 
              last_message_at, unread_count, is_pinned, peer_id, 
              peer_public_key, updated_at, raw_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, id) DO UPDATE SET
              type = excluded.type,
              name = excluded.name,
              avatar_url = excluded.avatar_url,
              last_message = excluded.last_message,
              last_message_at = excluded.last_message_at,
              unread_count = excluded.unread_count,
              is_pinned = excluded.is_pinned,
              peer_id = excluded.peer_id,
              peer_public_key = excluded.peer_public_key,
              updated_at = excluded.updated_at,
              raw_json = excluded.raw_json`,
            [
              userId,
              convId,
              c.type || 'direct',
              c.name || c.title || '',
              c.avatar_url || c.peer_avatar_url || '',
              lastMsg,
              lastMsgAt,
              c.unread_count || 0,
              isPinned,
              c.peer_id || '',
              c.peer_public_key || '',
              updatedAt,
              rawJson,
            ]
          );
        }
      });

      // Catat setelah commit berhasil; bila transaksi gagal, tetap dianggap belum tertulis
      for (const { convId, signature } of pending) signatures.set(convId, signature);
      persistedConversationSignatures.set(userId, signatures);
    } catch (error) {
      console.warn('[sqliteStorage] Failed to saveStoredConversations:', error);
    }
  });
}

/**
 * Optimistically updates the pinned state of a conversation in local SQLite.
 */
export function updateStoredConversationPin(
  userId: string,
  roomId: string,
  isPinned: boolean
): Promise<void> {
  return runExclusive(async () => {
    if (!userId || !roomId) return;

    try {
      forgetConversationSignature(userId, roomId);
      const db = await getDatabase();
      await db.runAsync(
        `UPDATE local_conversations 
         SET is_pinned = ? 
         WHERE user_id = ? AND id = ?`,
        [isPinned ? 1 : 0, userId, roomId]
      );
    } catch (error) {
      console.warn('[sqliteStorage] Failed to updateStoredConversationPin:', error);
    }
  });
}

/**
 * Optimistically updates the unread count of a conversation in local SQLite.
 * Updates both the unread_count indexed column and the embedded raw_json.
 */
export function updateStoredConversationUnread(
  userId: string,
  roomId: string,
  unreadCount = 0
): Promise<void> {
  return runExclusive(async () => {
    if (!userId || !roomId) return;

    try {
      forgetConversationSignature(userId, roomId);
      const db = await getDatabase();
      const row = await db.getFirstAsync<{ raw_json: string }>(
        `SELECT raw_json FROM local_conversations WHERE user_id = ? AND id = ?`,
        [userId, roomId]
      );

      let newRawJson: string | null = null;
      if (row?.raw_json) {
        try {
          const parsed = JSON.parse(row.raw_json);
          parsed.unread_count = unreadCount;
          newRawJson = JSON.stringify(parsed);
        } catch {
          // ignore JSON parse error
        }
      }

      if (newRawJson) {
        await db.runAsync(
          `UPDATE local_conversations 
           SET unread_count = ?, raw_json = ? 
           WHERE user_id = ? AND id = ?`,
          [unreadCount, newRawJson, userId, roomId]
        );
      } else {
        await db.runAsync(
          `UPDATE local_conversations 
           SET unread_count = ? 
           WHERE user_id = ? AND id = ?`,
          [unreadCount, userId, roomId]
        );
      }
    } catch (error) {
      console.warn('[sqliteStorage] Failed to updateStoredConversationUnread:', error);
    }
  });
}

/**
 * Retrieve cached messages for a room from local SQLite.
 * Returns messages in chronological order (oldest to newest) for timeline display.
 */
export async function getStoredMessages(
  userId: string,
  roomId: string,
  limit = 50
): Promise<Message[]> {
  if (!userId || !roomId) return [];

  try {
    const db = await getDatabase();
    // Query newest first to apply limit, then reverse in memory for timeline display
    const rows = await db.getAllAsync<{ raw_json: string }>(
      `SELECT raw_json FROM local_messages 
       WHERE user_id = ? AND room_id = ? 
       ORDER BY created_at DESC 
       LIMIT ?`,
      [userId, roomId, limit]
    );

    const messages: Message[] = [];
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.raw_json) as Message;
        if (parsed && parsed.id) {
          parsed.reactions = normalizeReactions(parsed.reactions);
          messages.push(parsed);
        }
      } catch (err) {
        // Skip corrupted row
      }
    }

    // Yang baru dimuat PERSIS yang ada di SQLite: catat tanda tangannya agar rekonsiliasi berikutnya tidak menulis ulang
    if (messages.length > 0) {
      const key = signatureRoomKey(userId, roomId);
      const sigs = persistedMessageSignatures.get(key) ?? new Map<string, number>();
      for (const m of messages) sigs.set(m.id, messageSignature(m));
      persistedMessageSignatures.set(key, sigs);
    }

    // Chronological sort: oldest to newest
    return messages.reverse();
  } catch (error) {
    console.warn('[sqliteStorage] Failed to getStoredMessages:', error);
    return [];
  }
}

/**
 * Milestone M-Mobile-8.30: Retrieve media and attachment messages for a room.
 * Filters messages that have a valid media_url or local_media_uri, ordered by created_at DESC.
 * Optionally filters by mediaType ('image' | 'video' | 'file').
 */
export async function getRoomMediaMessages(
  userId: string,
  roomId: string,
  mediaType?: 'image' | 'video' | 'file'
): Promise<Message[]> {
  if (!userId || !roomId) return [];

  try {
    const db = await getDatabase();
    let query = `
      SELECT raw_json FROM local_messages 
      WHERE user_id = ? AND room_id = ? 
        AND (media_url IS NOT NULL OR local_media_uri IS NOT NULL)
    `;
    const params: any[] = [userId, roomId];

    if (mediaType === 'image') {
      query += ` AND (type = 'image' OR media_url LIKE '%.jpg%' OR media_url LIKE '%.jpeg%' OR media_url LIKE '%.png%' OR media_url LIKE '%.webp%' OR media_url LIKE '%.gif%')`;
    } else if (mediaType === 'video') {
      query += ` AND (type = 'video' OR media_url LIKE '%.mp4%' OR media_url LIKE '%.mov%' OR media_url LIKE '%.webm%')`;
    } else if (mediaType === 'file') {
      query += ` AND (type = 'file' OR type = 'audio' OR (type != 'image' AND type != 'video'))`;
    }

    query += ` ORDER BY created_at DESC`;

    const rows = await db.getAllAsync<{ raw_json: string }>(query, params);

    const messages: Message[] = [];
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.raw_json) as Message;
        if (parsed && parsed.id) {
          parsed.reactions = normalizeReactions(parsed.reactions);
          messages.push(parsed);
        }
      } catch (err) {
        // Skip corrupted row
      }
    }

    return messages;
  } catch (error) {
    console.warn('[sqliteStorage] Failed to getRoomMediaMessages:', error);
    return [];
  }
}

/**
 * Retention cap constant: maximum local messages preserved per room in SQLite.
 * Balances offline readability with storage footprint and query performance.
 */
export const MAX_LOCAL_MESSAGES_PER_ROOM = 500;

/**
 * Histeresis pruning pada jalur tulis: baru memangkas bila jumlah pesan room melebihi
 * keepLimit + PRUNE_SLACK, lalu memangkas kembali ke keepLimit. Tanpa ini, room yang sudah
 * penuh menjalankan DELETE + vacuum pada SETIAP pesan masuk.
 */
export const PRUNE_SLACK = 50;

/** Batas halaman per panggilan incremental_vacuum di jalur panas agar tidak menahan lock tulis lama. */
const HOT_PATH_VACUUM_PAGES = 100;

/**
 * Membebaskan halaman kosong ke OS. WAJIB lewat execAsync (sqlite3_exec): PRAGMA incremental_vacuum
 * membebaskan satu halaman per langkah eksekusi, sedangkan runAsync hanya melangkah SEKALI
 * sehingga hanya 1 halaman yang kembali. Tidak berefek bila auto_vacuum bukan INCREMENTAL.
 */
async function freeUnusedPages(db: SQLite.SQLiteDatabase, maxPages?: number): Promise<void> {
  const arg = maxPages && maxPages > 0 ? `(${Math.floor(maxPages)})` : '';
  await db.execAsync(`PRAGMA incremental_vacuum${arg};`);
}

/**
 * Hapus pesan lama sebuah room hingga tersisa keepLimit terbaru. Mengembalikan jumlah baris terhapus.
 * Tidak mengembalikan halaman ke OS; pemanggil yang memutuskan kapan.
 */
async function deleteOldRoomMessages(
  db: SQLite.SQLiteDatabase,
  userId: string,
  roomId: string,
  keepLimit: number
): Promise<number> {
  const result = await db.runAsync(
    `DELETE FROM local_messages 
     WHERE user_id = ? AND room_id = ? 
       AND id NOT IN (
         SELECT id FROM local_messages 
         WHERE user_id = ? AND room_id = ? 
         ORDER BY created_at DESC 
         LIMIT ?
       )`,
    [userId, roomId, userId, roomId, keepLimit]
  );
  const changes = result.changes || 0;
  if (changes > 0) forgetRoomSignatures(userId, roomId);
  return changes;
}

/**
 * Prunes older messages in a specific room exceeding keepLimit (default: MAX_LOCAL_MESSAGES_PER_ROOM).
 * Efficiently retains the latest messages ordered by created_at DESC and removes the rest.
 * Dengan slack > 0, pemangkasan dilewati selama jumlah pesan <= keepLimit + slack (jalur tulis).
 * Returns the number of pruned rows.
 */
export function pruneRoomMessages(
  userId: string,
  roomId: string,
  keepLimit: number = MAX_LOCAL_MESSAGES_PER_ROOM,
  slack: number = 0
): Promise<number> {
  return runExclusive(async () => {
    if (!userId || !roomId || keepLimit <= 0) return 0;

    try {
      const db = await getDatabase();

      if (slack > 0) {
        const row = await db.getFirstAsync<{ count: number }>(
          `SELECT COUNT(*) as count FROM local_messages WHERE user_id = ? AND room_id = ?`,
          [userId, roomId]
        );
        if ((row?.count || 0) <= keepLimit + slack) return 0;
      }

      const changes = await deleteOldRoomMessages(db, userId, roomId, keepLimit);
      if (changes > 0) {
        try {
          await freeUnusedPages(db, HOT_PATH_VACUUM_PAGES);
        } catch {
          // incremental_vacuum tidak berlaku bila auto_vacuum belum INCREMENTAL; abaikan
        }
      }

      return changes;
    } catch (error) {
      console.warn('[sqliteStorage] Failed to pruneRoomMessages:', error);
      return 0;
    }
  });
}

/** Pangkas semua room yang melebihi keepLimit + PRUNE_SLACK. Tanpa gembok; dipakai pemanggil bergembok. */
async function sweepOversizedRooms(
  db: SQLite.SQLiteDatabase,
  userId: string,
  keepLimit: number
): Promise<number> {
  const rooms = await db.getAllAsync<{ room_id: string }>(
    `SELECT room_id FROM local_messages 
     WHERE user_id = ? 
     GROUP BY room_id 
     HAVING COUNT(*) > ?`,
    [userId, keepLimit + PRUNE_SLACK]
  );

  let total = 0;
  for (const { room_id } of rooms) {
    total += await deleteOldRoomMessages(db, userId, room_id, keepLimit);
  }
  return total;
}

/**
 * Memangkas SEMUA room milik user yang melebihi keepLimit + PRUNE_SLACK. Dipakai saat maintenance
 * agar room lama (mis. dari versi sebelum cap ada, atau tidak pernah dibuka lagi) ikut terpangkas.
 * Mengembalikan total baris terhapus.
 */
export function pruneOversizedRooms(
  userId: string,
  keepLimit: number = MAX_LOCAL_MESSAGES_PER_ROOM
): Promise<number> {
  if (!userId || keepLimit <= 0) return Promise.resolve(0);

  return runExclusive(async () => {
    try {
      const db = await getDatabase();
      return await sweepOversizedRooms(db, userId, keepLimit);
    } catch (error) {
      console.warn('[sqliteStorage] Failed to pruneOversizedRooms:', error);
      return 0;
    }
  });
}

/**
 * Mengembalikan seluruh ruang kosong ke OS dan merapikan file WAL.
 * - auto_vacuum sudah INCREMENTAL: cukup incremental_vacuum penuh.
 * - Belum (DB dibuat sebelum M-Mobile-8.29; PRAGMA auto_vacuum pada DB lama tidak berefek tanpa VACUUM):
 *   set INCREMENTAL lalu VACUUM sekali. Hasilnya permanen, sehingga selanjutnya jalur cepat.
 * Hanya dipanggil dari dalam gembok tulis (runExclusive), jadi tidak bertabrakan dengan transaksi tulis lain;
 * VACUUM tetap bisa gagal (mis. disk penuh) dan pemanggil menangkap error lalu mencoba lagi nanti.
 */
async function compactDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ auto_vacuum: number }>(`PRAGMA auto_vacuum;`);
  if (row?.auto_vacuum === 2) {
    await freeUnusedPages(db);
  } else {
    await db.execAsync(`PRAGMA auto_vacuum = INCREMENTAL; VACUUM;`);
  }
  await db.execAsync(`PRAGMA wal_checkpoint(TRUNCATE);`);
}

export interface StorageMaintenanceResult {
  prunedRows: number;
  compacted: boolean;
}

/**
 * Maintenance penyimpanan lokal: pangkas room yang melebihi cap lalu kompaksi bila perlu
 * (selalu pada DB yang belum INCREMENTAL, atau bila ada baris terpangkas). Aman dipanggil berulang
 * dan tidak pernah melempar error. Panggil tertunda setelah startup, bukan di jalur kritis.
 */
export function runStorageMaintenance(userId: string): Promise<StorageMaintenanceResult> {
  const result: StorageMaintenanceResult = { prunedRows: 0, compacted: false };
  if (!userId) return Promise.resolve(result);

  // Satu gembok untuk seluruh maintenance: VACUUM butuh koneksi tanpa transaksi lain yang terbuka
  return runExclusive(async () => {
    try {
      const db = await getDatabase();
      result.prunedRows = await sweepOversizedRooms(db, userId, MAX_LOCAL_MESSAGES_PER_ROOM);

      const row = await db.getFirstAsync<{ auto_vacuum: number }>(`PRAGMA auto_vacuum;`);
      if (result.prunedRows > 0 || row?.auto_vacuum !== 2) {
        await compactDatabase(db);
        result.compacted = true;
      } else {
        // Tanpa kompaksi pun, kembalikan file WAL ke ukuran kecil: tanpa ini WAL bertahan di ±4 MB
        // (ambang auto-checkpoint 1000 halaman) dan tidak pernah menyusut sendiri.
        await db.execAsync(`PRAGMA wal_checkpoint(TRUNCATE);`);
      }
    } catch (error) {
      // Dicoba lagi pada maintenance berikutnya
      console.warn('[sqliteStorage] Storage maintenance incomplete:', error);
    }
    return result;
  });
}

/**
 * Persists an array of messages to local SQLite for a specific room.
 * Uses a single transaction to maintain maximum thermal and battery efficiency.
 */
export function saveStoredMessages(
  userId: string,
  roomId: string,
  messages: Message[]
): Promise<void> {
  return runExclusive(async () => {
    if (!userId || !roomId || !messages || messages.length === 0) return false;

    try {
      const db = await getDatabase();

      // Hanya tulis pesan yang baru atau berubah sejak terakhir ditulis/dimuat (lihat persistedMessageSignatures)
      const roomKey = signatureRoomKey(userId, roomId);
      const signatures = persistedMessageSignatures.get(roomKey) ?? new Map<string, number>();
      const pending: { message: Message; rawJson: string; signature: number }[] = [];

      for (const m of messages) {
        if (!m.id) continue;
        const safeMsg = { ...m, reactions: normalizeReactions(m.reactions) };
        const signature = messageSignature(m);
        if (signatures.get(m.id) === signature) continue;
        pending.push({ message: m, rawJson: JSON.stringify(safeMsg), signature });
      }
      if (pending.length === 0) return false;

      await db.withTransactionAsync(async () => {
        for (const { message: m, rawJson } of pending) {
          const createdAt = m.created_at || m.timestamp || new Date().toISOString();

          // UPSERT (bukan INSERT OR REPLACE): memperbarui baris di tempat tanpa hapus-sisip entri indeks,
          // jauh lebih sedikit halaman yang ditulis ke WAL saat hanya status/reaksi yang berubah.
          await db.runAsync(
            `INSERT INTO local_messages (
              user_id, id, room_id, sender_id, sender_nickname, 
              content, type, status, reply_to_id, media_url, 
              local_media_uri, created_at, raw_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, id) DO UPDATE SET
              room_id = excluded.room_id,
              sender_id = excluded.sender_id,
              sender_nickname = excluded.sender_nickname,
              content = excluded.content,
              type = excluded.type,
              status = excluded.status,
              reply_to_id = excluded.reply_to_id,
              media_url = excluded.media_url,
              local_media_uri = excluded.local_media_uri,
              created_at = excluded.created_at,
              raw_json = excluded.raw_json`,
            [
              userId,
              m.id,
              roomId,
              m.sender_id || '',
              m.nickname || m.from || '',
              m.content || '',
              m.type || 'text',
              m.status || 'sent',
              m.reply_to?.id || null,
              m.media_url || null,
              (m as any).local_media_uri || null,
              createdAt,
              rawJson,
            ]
          );
        }
      });

      // Catat setelah commit berhasil; bila transaksi gagal, pesan tetap dianggap belum tertulis
      if (signatures.size > MAX_SIGNATURES_PER_ROOM) signatures.clear();
      for (const { message, signature } of pending) signatures.set(message.id, signature);
      persistedMessageSignatures.set(roomKey, signatures);
      return true;
    } catch (error) {
      console.warn('[sqliteStorage] Failed to saveStoredMessages:', error);
      return false;
    }
  }).then((saved) => {
    // Pruning dijadwalkan SETELAH gembok dilepas (antrean tidak reentrant); tidak menahan pemanggil
    if (saved) {
      pruneRoomMessages(userId, roomId, MAX_LOCAL_MESSAGES_PER_ROOM, PRUNE_SLACK).catch(() => {});
    }
  });
}

/**
 * Menghapus satu pesan dari SQLite (mis. "hapus untuk saya"). Tanpa ini baris tetap ada dan muncul lagi saat hidrasi
 * cold start. Tanda tangannya dilupakan agar penyimpanan ulang pesan yang sama benar-benar menulis.
 */
export function deleteStoredMessage(userId: string, roomId: string, messageId: string): Promise<void> {
  return runExclusive(async () => {
    if (!userId || !messageId) return;

    try {
      const db = await getDatabase();
      await db.runAsync(`DELETE FROM local_messages WHERE user_id = ? AND id = ?`, [userId, messageId]);
      persistedMessageSignatures.get(signatureRoomKey(userId, roomId))?.delete(messageId);
    } catch (error) {
      console.warn('[sqliteStorage] Failed to deleteStoredMessage:', error);
    }
  });
}

/**
 * Clears all cached conversations and messages for a specific user.
 * Used during logout to guarantee user isolation and privacy protection.
 */
export function clearUserCache(userId: string): Promise<void> {
  return runExclusive(async () => {
    if (!userId) return;

    try {
      const db = await getDatabase();
      await db.withTransactionAsync(async () => {
        await db.runAsync(`DELETE FROM local_conversations WHERE user_id = ?`, [userId]);
        await db.runAsync(`DELETE FROM local_messages WHERE user_id = ?`, [userId]);
        await db.runAsync(`DELETE FROM local_call_logs WHERE user_id = ?`, [userId]);
        await db.runAsync(`DELETE FROM local_friends WHERE user_id = ?`, [userId]);
      });
      persistedMessageSignatures.clear();
      persistedConversationSignatures.delete(userId);
    } catch (error) {
      console.warn('[sqliteStorage] Failed to clearUserCache:', error);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Local Call Logs Storage (M-Mobile-8.20)
// ─────────────────────────────────────────────────────────────────────────────

export interface LocalCallRecord {
  id: string;
  user_id: string;
  room_id?: string;
  peer_id: string;
  peer_username: string;
  peer_display_name: string;
  call_type: 'incoming' | 'outgoing' | 'missed';
  duration_seconds: number;
  created_at: number;
  status: string;
}

/**
 * Save or update a call log record in local SQLite.
 */
export function saveCallRecord(record: LocalCallRecord): Promise<void> {
  return runExclusive(async () => {
    if (!record || !record.id || !record.user_id) return;

    try {
      const db = await getDatabase();
      await db.runAsync(
        `INSERT OR REPLACE INTO local_call_logs (
          id, user_id, room_id, peer_id, peer_username, peer_display_name,
          call_type, duration_seconds, created_at, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.user_id,
          record.room_id || '',
          record.peer_id,
          record.peer_username || '',
          record.peer_display_name || '',
          record.call_type,
          record.duration_seconds || 0,
          record.created_at || Date.now(),
          record.status || 'completed',
        ]
      );
    } catch (error) {
      console.warn('[sqliteStorage] Failed to saveCallRecord:', error);
    }
  });
}

/**
 * Retrieve call history records for a specific user, sorted from newest to oldest.
 */
export async function getCallHistory(
  userId: string,
  limit: number = 100
): Promise<LocalCallRecord[]> {
  if (!userId) return [];

  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<LocalCallRecord>(
      `SELECT * FROM local_call_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      [userId, limit]
    );
    return rows || [];
  } catch (error) {
    console.warn('[sqliteStorage] Failed to getCallHistory:', error);
    return [];
  }
}

/**
 * Clears all call history for a specific user.
 */
export function clearCallHistory(userId: string): Promise<void> {
  return runExclusive(async () => {
    if (!userId) return;

    try {
      const db = await getDatabase();
      await db.runAsync(`DELETE FROM local_call_logs WHERE user_id = ?`, [userId]);
    } catch (error) {
      console.warn('[sqliteStorage] Failed to clearCallHistory:', error);
    }
  });
}

/**
 * Delete a specific call record by its primary key ID.
 */
export function deleteCallRecord(recordId: string): Promise<void> {
  return runExclusive(async () => {
    if (!recordId) return;

    try {
      const db = await getDatabase();
      await db.runAsync(`DELETE FROM local_call_logs WHERE id = ?`, [recordId]);
    } catch (error) {
      console.warn('[sqliteStorage] Failed to deleteCallRecord:', error);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage Inspection & Maintenance (M-Mobile-8.21)
// ─────────────────────────────────────────────────────────────────────────────

export interface StorageStats {
  conversationCount: number;
  messageCount: number;
  callLogCount: number;
  estimatedSizeBytes: number;
}

/**
 * Retrieves aggregate storage stats for the active user.
 */
export async function getStorageStats(userId: string): Promise<StorageStats> {
  if (!userId) {
    return { conversationCount: 0, messageCount: 0, callLogCount: 0, estimatedSizeBytes: 0 };
  }

  try {
    const db = await getDatabase();
    const convRow = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM local_conversations WHERE user_id = ?`,
      [userId]
    );
    const msgRow = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM local_messages WHERE user_id = ?`,
      [userId]
    );
    const callRow = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM local_call_logs WHERE user_id = ?`,
      [userId]
    );

    let estimatedSize = 0;
    try {
      const pageCountRow = await db.getFirstAsync<{ page_count: number }>(`PRAGMA page_count;`);
      const pageSizeRow = await db.getFirstAsync<{ page_size: number }>(`PRAGMA page_size;`);
      if (pageCountRow && pageSizeRow) {
        estimatedSize = (pageCountRow.page_count || 0) * (pageSizeRow.page_size || 4096);
      }
    } catch {
      estimatedSize = ((msgRow?.count || 0) * 500) + ((convRow?.count || 0) * 300);
    }

    return {
      conversationCount: convRow?.count || 0,
      messageCount: msgRow?.count || 0,
      callLogCount: callRow?.count || 0,
      estimatedSizeBytes: estimatedSize,
    };
  } catch (error) {
    console.warn('[sqliteStorage] Failed to getStorageStats:', error);
    return { conversationCount: 0, messageCount: 0, callLogCount: 0, estimatedSizeBytes: 0 };
  }
}

/**
 * Clears only cached messages for a specific user.
 * Preserves conversations list and call history so UI remains intact.
 */
export function clearMessageCacheOnly(userId: string): Promise<void> {
  return runExclusive(async () => {
    if (!userId) return;

    try {
      const db = await getDatabase();
      await db.runAsync(`DELETE FROM local_messages WHERE user_id = ?`, [userId]);
      persistedMessageSignatures.clear();
      try {
        await compactDatabase(db);
      } catch (compactError) {
        // Pesan sudah terhapus; kompaksi gagal hanya berarti ruang dikembalikan nanti
        console.warn('[sqliteStorage] Compaction after clearMessageCacheOnly failed:', compactError);
      }
    } catch (error) {
      console.warn('[sqliteStorage] Failed to clearMessageCacheOnly:', error);
    }
  });
}

/**
 * Retrieves cached Community Social Feed posts for a specific user.
 * Sorted by is_pinned DESC, created_at DESC for instant (< 50ms) rendering.
 */
export async function getStoredFeedPosts(
  userId: string,
  tab: string = 'latest',
  limit: number = 30
): Promise<FeedPost[]> {
  if (!userId) return [];

  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ raw_json: string }>(
      `SELECT raw_json FROM local_feed_posts 
       WHERE user_id = ? AND feed_tab = ? 
       ORDER BY is_pinned DESC, created_at DESC 
       LIMIT ?`,
      [userId, tab, limit]
    );

    const posts: FeedPost[] = [];
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.raw_json) as FeedPost;
        if (parsed && parsed.id) {
          posts.push(parsed);
        }
      } catch {
        // Skip corrupted row gracefully
      }
    }

    return posts;
  } catch (error) {
    console.warn('[sqliteStorage] Failed to getStoredFeedPosts:', error);
    return [];
  }
}

/**
 * Persists an array of Community Social Feed posts to SQLite with Auto-Pruning.
 * Keeps memory/disk storage footprint strictly capped at max 50 posts per tab (< 200 KB).
 */
export function saveStoredFeedPosts(
  userId: string,
  posts: FeedPost[],
  tab: string = 'latest'
): Promise<void> {
  return runExclusive(async () => {
    if (!userId || !posts || posts.length === 0) return;

    try {
      const db = await getDatabase();

      await db.withTransactionAsync(async () => {
        for (const p of posts) {
          if (!p.id) continue;

          const isPinned = p.is_pinned ? 1 : 0;
          const isLiked = p.is_liked ? 1 : 0;
          const authorVerified = p.author?.is_verified ? 1 : 0;
          const mediaUrls = JSON.stringify(p.media_urls || []);
          const metadata = JSON.stringify(p.metadata || {});
          const rawJson = JSON.stringify(p);

          await db.runAsync(
            `INSERT OR REPLACE INTO local_feed_posts (
              user_id, feed_tab, id, tenant_id, content, media_urls, post_type,
              is_pinned, metadata, likes_count, comments_count, is_liked,
              author_id, author_username, author_display_name,
              author_avatar_url, author_role, author_is_verified,
              created_at, updated_at, raw_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              userId,
              tab,
              p.id,
              p.tenant_id || 'default',
              p.content || '',
              mediaUrls,
              p.post_type || 'standard',
              isPinned,
              metadata,
              p.likes_count || 0,
              p.comments_count || 0,
              isLiked,
              p.author?.id || '',
              p.author?.username || '',
              p.author?.display_name || '',
              p.author?.avatar_url || '',
              p.author?.role || '',
              authorVerified,
              p.created_at || new Date().toISOString(),
              p.updated_at || new Date().toISOString(),
              rawJson,
            ]
          );
        }

        // Rolling Window Pruning Cap: keep maximum 50 posts per tab per user
        await db.runAsync(
          `DELETE FROM local_feed_posts 
           WHERE user_id = ? AND feed_tab = ? 
           AND id NOT IN (
             SELECT id FROM local_feed_posts 
             WHERE user_id = ? AND feed_tab = ? 
             ORDER BY is_pinned DESC, created_at DESC 
             LIMIT 50
           )`,
          [userId, tab, userId, tab]
        );
      });
    } catch (error) {
      console.warn('[sqliteStorage] Failed to saveStoredFeedPosts:', error);
    }
  });
}

/**
 * Optimistically updates the like state and count for a feed post in SQLite.
 */
export function updateStoredFeedPostLike(
  userId: string,
  postId: string,
  isLiked: boolean,
  likesCount: number
): Promise<void> {
  return runExclusive(async () => {
    if (!userId || !postId) return;

    try {
      const db = await getDatabase();
      // Also update raw_json so subsequent getStoredFeedPosts reflect the change
      const row = await db.getFirstAsync<{ raw_json: string }>(
        `SELECT raw_json FROM local_feed_posts WHERE user_id = ? AND id = ?`,
        [userId, postId]
      );

      let updatedRawJson = '';
      if (row?.raw_json) {
        try {
          const parsed = JSON.parse(row.raw_json) as FeedPost;
          parsed.is_liked = isLiked;
          parsed.likes_count = likesCount;
          updatedRawJson = JSON.stringify(parsed);
        } catch {
          // ignore JSON parse error
        }
      }

      if (updatedRawJson) {
        await db.runAsync(
          `UPDATE local_feed_posts 
           SET is_liked = ?, likes_count = ?, raw_json = ? 
           WHERE user_id = ? AND id = ?`,
          [isLiked ? 1 : 0, likesCount, updatedRawJson, userId, postId]
        );
      } else {
        await db.runAsync(
          `UPDATE local_feed_posts 
           SET is_liked = ?, likes_count = ? 
           WHERE user_id = ? AND id = ?`,
          [isLiked ? 1 : 0, likesCount, userId, postId]
        );
      }
    } catch (error) {
      console.warn('[sqliteStorage] Failed to updateStoredFeedPostLike:', error);
    }
  });
}

/**
 * Updates the comments count for a feed post in SQLite.
 */
export function updateStoredFeedPostCommentsCount(
  userId: string,
  postId: string,
  commentsCount: number
): Promise<void> {
  return runExclusive(async () => {
    if (!userId || !postId) return;

    try {
      const db = await getDatabase();
      const row = await db.getFirstAsync<{ raw_json: string }>(
        `SELECT raw_json FROM local_feed_posts WHERE user_id = ? AND id = ?`,
        [userId, postId]
      );

      if (row?.raw_json) {
        try {
          const parsed = JSON.parse(row.raw_json) as FeedPost;
          parsed.comments_count = commentsCount;
          const updatedRawJson = JSON.stringify(parsed);

          await db.runAsync(
            `UPDATE local_feed_posts 
             SET comments_count = ?, raw_json = ? 
             WHERE user_id = ? AND id = ?`,
            [commentsCount, updatedRawJson, userId, postId]
          );
          return;
        } catch {
          // fallback to column update
        }
      }

      await db.runAsync(
        `UPDATE local_feed_posts SET comments_count = ? WHERE user_id = ? AND id = ?`,
        [commentsCount, userId, postId]
      );
    } catch (error) {
      console.warn('[sqliteStorage] Failed to updateStoredFeedPostCommentsCount:', error);
    }
  });
}

/**
 * Removes a deleted feed post from SQLite storage.
 */
export function deleteStoredFeedPost(
  userId: string,
  postId: string
): Promise<void> {
  return runExclusive(async () => {
    if (!userId || !postId) return;

    try {
      const db = await getDatabase();
      await db.runAsync(
        `DELETE FROM local_feed_posts WHERE user_id = ? AND id = ?`,
        [userId, postId]
      );
    } catch (error) {
      console.warn('[sqliteStorage] Failed to deleteStoredFeedPost:', error);
    }
  });
}

/**
 * Clears cached feed posts for a specific user.
 */
export function clearFeedPosts(userId: string): Promise<void> {
  return runExclusive(async () => {
    if (!userId) return;

    try {
      const db = await getDatabase();
      await db.runAsync(`DELETE FROM local_feed_posts WHERE user_id = ?`, [userId]);
    } catch (error) {
      console.warn('[sqliteStorage] Failed to clearFeedPosts:', error);
    }
  });
}

/**
 * =========================================================================
 * Local Friends Storage Operations (Milestone M-Mobile-10)
 * =========================================================================
 */

/**
 * Persists an array of FriendItem objects in local SQLite database.
 * Uses transactional batching for zero UI stutter / 60 FPS performance.
 */
export function saveLocalFriends(
  userId: string,
  friends: FriendItem[]
): Promise<void> {
  return runExclusive(async () => {
    if (!userId || !friends || friends.length === 0) return;

    try {
      const db = await getDatabase();
      await db.withTransactionAsync(async () => {
        for (const friend of friends) {
          await db.runAsync(
            `INSERT OR REPLACE INTO local_friends (
              user_id, id, username, display_name, avatar_url,
              status_message, bio, role, is_verified, is_private_account,
              connection_id, connected_at, raw_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              userId,
              friend.id,
              friend.username,
              friend.display_name,
              friend.avatar_url || null,
              friend.status_message || null,
              friend.bio || null,
              friend.role || null,
              friend.is_verified ? 1 : 0,
              friend.is_private_account ? 1 : 0,
              friend.connection_id,
              friend.connected_at,
              JSON.stringify(friend),
            ]
          );
        }
      });
    } catch (error) {
      console.warn('[sqliteStorage] Failed to saveLocalFriends:', error);
    }
  });
}

/**
 * Retrieves cached friends list for a user, sorted by connection timestamp descending.
 */
export async function getLocalFriends(
  userId: string,
  limit = 100,
  offset = 0
): Promise<FriendItem[]> {
  if (!userId) return [];

  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ raw_json: string }>(
      `SELECT raw_json FROM local_friends 
       WHERE user_id = ? 
       ORDER BY connected_at DESC 
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );

    return rows.map((r) => JSON.parse(r.raw_json) as FriendItem);
  } catch (error) {
    console.warn('[sqliteStorage] Failed to getLocalFriends:', error);
    return [];
  }
}

/**
 * Removes a specific friend from local cache upon unfriend event.
 */
export function removeLocalFriend(
  userId: string,
  friendId: string
): Promise<void> {
  return runExclusive(async () => {
    if (!userId || !friendId) return;

    try {
      const db = await getDatabase();
      await db.runAsync(
        `DELETE FROM local_friends WHERE user_id = ? AND id = ?`,
        [userId, friendId]
      );
    } catch (error) {
      console.warn('[sqliteStorage] Failed to removeLocalFriend:', error);
    }
  });
}

/**
 * Clears all cached friends for a specific user.
 */
export function clearLocalFriends(userId: string): Promise<void> {
  return runExclusive(async () => {
    if (!userId) return;

    try {
      const db = await getDatabase();
      await db.runAsync(`DELETE FROM local_friends WHERE user_id = ?`, [userId]);
    } catch (error) {
      console.warn('[sqliteStorage] Failed to clearLocalFriends:', error);
    }
  });
}



