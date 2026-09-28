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
import { Conversation, Message, normalizeReactions } from '../api/types';

const DB_NAME = 'wuzzchat.db';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

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
      `);

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
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.raw_json) as Conversation;
        if (parsed && parsed.id) {
          conversations.push(parsed);
        }
      } catch (err) {
        // Skip corrupted row gracefully
      }
    }

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
export async function saveStoredConversations(
  userId: string,
  conversations: Conversation[]
): Promise<void> {
  if (!userId || !conversations || conversations.length === 0) return;

  try {
    const db = await getDatabase();

    await db.withTransactionAsync(async () => {
      for (const c of conversations) {
        const convId = c.id || c.room_id;
        if (!convId) continue;

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

        await db.runAsync(
          `INSERT OR REPLACE INTO local_conversations (
            user_id, id, type, name, avatar_url, last_message, 
            last_message_at, unread_count, is_pinned, peer_id, 
            peer_public_key, updated_at, raw_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  } catch (error) {
    console.warn('[sqliteStorage] Failed to saveStoredConversations:', error);
  }
}

/**
 * Optimistically updates the pinned state of a conversation in local SQLite.
 */
export async function updateStoredConversationPin(
  userId: string,
  roomId: string,
  isPinned: boolean
): Promise<void> {
  if (!userId || !roomId) return;

  try {
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
}

/**
 * Optimistically updates the unread count of a conversation in local SQLite.
 * Updates both the unread_count indexed column and the embedded raw_json.
 */
export async function updateStoredConversationUnread(
  userId: string,
  roomId: string,
  unreadCount = 0
): Promise<void> {
  if (!userId || !roomId) return;

  try {
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
 * Prunes older messages in a specific room exceeding keepLimit (default: MAX_LOCAL_MESSAGES_PER_ROOM).
 * Efficiently retains the latest messages ordered by created_at DESC and removes the rest.
 * Runs incremental vacuum if rows were pruned to immediately return reclaimed pages to OS.
 * Returns the number of pruned rows.
 */
export async function pruneRoomMessages(
  userId: string,
  roomId: string,
  keepLimit: number = MAX_LOCAL_MESSAGES_PER_ROOM
): Promise<number> {
  if (!userId || !roomId || keepLimit <= 0) return 0;

  try {
    const db = await getDatabase();
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
    if (changes > 0) {
      try {
        await db.runAsync(`PRAGMA incremental_vacuum;`);
      } catch {
        // ignore incremental_vacuum error if not applicable
      }
    }

    return changes;
  } catch (error) {
    console.warn('[sqliteStorage] Failed to pruneRoomMessages:', error);
    return 0;
  }
}

/**
 * Persists an array of messages to local SQLite for a specific room.
 * Uses a single transaction to maintain maximum thermal and battery efficiency.
 */
export async function saveStoredMessages(
  userId: string,
  roomId: string,
  messages: Message[]
): Promise<void> {
  if (!userId || !roomId || !messages || messages.length === 0) return;

  try {
    const db = await getDatabase();

    await db.withTransactionAsync(async () => {
      for (const m of messages) {
        if (!m.id) continue;

        const createdAt = m.created_at || m.timestamp || new Date().toISOString();
        const safeReactions = normalizeReactions(m.reactions);
        const safeMsg = { ...m, reactions: safeReactions };
        const rawJson = JSON.stringify(safeMsg);

        await db.runAsync(
          `INSERT OR REPLACE INTO local_messages (
            user_id, id, room_id, sender_id, sender_nickname, 
            content, type, status, reply_to_id, media_url, 
            local_media_uri, created_at, raw_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

    // Non-blocking background pruning to enforce MAX_LOCAL_MESSAGES_PER_ROOM retention cap
    pruneRoomMessages(userId, roomId, MAX_LOCAL_MESSAGES_PER_ROOM).catch(() => {});
  } catch (error) {
    console.warn('[sqliteStorage] Failed to saveStoredMessages:', error);
  }
}

/**
 * Clears all cached conversations and messages for a specific user.
 * Used during logout to guarantee user isolation and privacy protection.
 */
export async function clearUserCache(userId: string): Promise<void> {
  if (!userId) return;

  try {
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      await db.runAsync(`DELETE FROM local_conversations WHERE user_id = ?`, [userId]);
      await db.runAsync(`DELETE FROM local_messages WHERE user_id = ?`, [userId]);
      await db.runAsync(`DELETE FROM local_call_logs WHERE user_id = ?`, [userId]);
    });
  } catch (error) {
    console.warn('[sqliteStorage] Failed to clearUserCache:', error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Local Call Logs Storage (M-Mobile-8.20)
// ─────────────────────────────────────────────────────────────────────────────

export interface LocalCallRecord {
  id: string;
  user_id: string;
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
export async function saveCallRecord(record: LocalCallRecord): Promise<void> {
  if (!record || !record.id || !record.user_id) return;

  try {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT OR REPLACE INTO local_call_logs (
        id, user_id, peer_id, peer_username, peer_display_name,
        call_type, duration_seconds, created_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.user_id,
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
export async function clearCallHistory(userId: string): Promise<void> {
  if (!userId) return;

  try {
    const db = await getDatabase();
    await db.runAsync(`DELETE FROM local_call_logs WHERE user_id = ?`, [userId]);
  } catch (error) {
    console.warn('[sqliteStorage] Failed to clearCallHistory:', error);
  }
}

/**
 * Delete a specific call record by its primary key ID.
 */
export async function deleteCallRecord(recordId: string): Promise<void> {
  if (!recordId) return;

  try {
    const db = await getDatabase();
    await db.runAsync(`DELETE FROM local_call_logs WHERE id = ?`, [recordId]);
  } catch (error) {
    console.warn('[sqliteStorage] Failed to deleteCallRecord:', error);
  }
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
export async function clearMessageCacheOnly(userId: string): Promise<void> {
  if (!userId) return;

  try {
    const db = await getDatabase();
    await db.runAsync(`DELETE FROM local_messages WHERE user_id = ?`, [userId]);
    try {
      await db.runAsync(`PRAGMA incremental_vacuum;`);
    } catch {
      try {
        await db.runAsync(`VACUUM;`);
      } catch {
        // ignore vacuum fallback error
      }
    }
  } catch (error) {
    console.warn('[sqliteStorage] Failed to clearMessageCacheOnly:', error);
  }
}


