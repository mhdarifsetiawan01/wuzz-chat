/**
 * Penyimpanan lokal kecil untuk Wuzz Grid: papan yang sedang dimainkan (agar bertahan setelah aplikasi
 * ditutup atau jaringan putus) dan zona waktu perangkat yang terakhir disinkronkan ke server.
 * Satu kunci per pengguna yang ditimpa tiap hari, sehingga tidak menumpuk.
 */

import { secureStorage } from './secureStorage';
import { Board, parseSavedBoard, serializeBoard } from '../utils/gameBoard';

/** SecureStore hanya menerima [A-Za-z0-9._-]. */
function safe(part: string): string {
  return part.replace(/[^A-Za-z0-9._-]/g, '_');
}

const boardKey = (userId: string) => `wuzz_game_board_${safe(userId)}`;
const tzKey = (userId: string) => `wuzz_game_tz_${safe(userId)}`;

export const gameStorage = {
  async loadBoard(userId: string, date: string, size: number): Promise<Board | null> {
    try {
      return parseSavedBoard(await secureStorage.getItem(boardKey(userId)), date, size);
    } catch {
      return null;
    }
  },

  async saveBoard(userId: string, date: string, cells: Board): Promise<void> {
    try {
      await secureStorage.setItem(boardKey(userId), serializeBoard(date, cells));
    } catch {
      // Gagal menyimpan tidak boleh mengganggu permainan.
    }
  },

  async clearBoard(userId: string): Promise<void> {
    try {
      await secureStorage.deleteItem(boardKey(userId));
    } catch {
      // abaikan
    }
  },

  async getSyncedTimezone(userId: string): Promise<string | null> {
    try {
      return await secureStorage.getItem(tzKey(userId));
    } catch {
      return null;
    }
  },

  async setSyncedTimezone(userId: string, tz: string): Promise<void> {
    try {
      await secureStorage.setItem(tzKey(userId), tz);
    } catch {
      // abaikan
    }
  },
};
