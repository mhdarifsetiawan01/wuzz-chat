/**
 * WuzzChat Game Harian (Wuzz Grid) API.
 * Kontrak sisi server: backend/internal/api/game_handler.go dan docs/plans/archived/28-10-2026-backlog-selesai/DAILY_GAME_WUZZ_GRID.md.
 * Server tidak pernah mengirim solusi; waktu penyelesaian dihitung server dari started_at.
 */

import { apiClient } from './client';

export type GameAttemptStatus = 'playing' | 'solved' | 'suspicious';

export interface GamePuzzle {
  /** Tanggal kalender lokal pengguna (YYYY-MM-DD) pemilik puzzle ini. */
  date: string;
  size: number;
  /** regions[baris][kolom] = nomor wilayah 0..size-1 */
  regions: number[][];
  seed: number;
}

export interface GameAttempt {
  puzzle_date: string;
  started_at: string;
  solved_at?: string;
  duration_ms: number;
  mistakes: number;
  status: GameAttemptStatus;
}

export interface GameStreak {
  current: number;
  best: number;
  freezes_available: number;
  last_solved_date?: string;
}

export interface GameToday {
  /** false = fitur dimatikan server; kartu harus disembunyikan. */
  enabled: boolean;
  puzzle?: GamePuzzle;
  number?: number;
  attempt?: GameAttempt;
  streak?: GameStreak;
  /** Jam pengingat harian (HH:MM, waktu perangkat), diatur server. */
  reminder_time?: string;
}

export interface GameSubmitResult {
  solved: boolean;
  attempt: GameAttempt;
  streak?: GameStreak;
}

export interface GameSettings {
  leaderboard_public: boolean;
  reminder_enabled: boolean;
  /** true = hasil disembunyikan dari papan Teman dan Grup milik orang lain (papan Publik punya opt-in sendiri). */
  hide_from_social: boolean;
  timezone: string;
}

export type GameBoardScope = 'friends' | 'group' | 'public';
export type GameBoardPeriod = 'day' | 'week';

export interface GameBoardEntry {
  rank: number;
  user_id: string;
  username: string;
  /** Kosong pada papan publik (hanya @username yang ditampilkan). */
  display_name: string;
  avatar_url?: string;
  /** Periode hari: selalu 1. Periode minggu: jumlah hari yang diselesaikan. */
  solved_days: number;
  /** Periode hari: waktu penyelesaian. Periode minggu: total waktu hari-hari itu. */
  duration_ms: number;
  is_me: boolean;
}

export interface GameLeaderboard {
  scope: GameBoardScope;
  period: GameBoardPeriod;
  from: string;
  to: string;
  entries: GameBoardEntry[];
  my_rank?: number;
}

export const gameApi = {
  /** GET /api/game/today */
  async getToday(): Promise<GameToday> {
    return apiClient<GameToday>('/api/game/today', { method: 'GET' });
  },

  /** POST /api/game/today/start — idempoten; started_at dicatat server. */
  async start(): Promise<GameToday> {
    return apiClient<GameToday>('/api/game/today/start', { method: 'POST' });
  },

  /** POST /api/game/today/submit — placement[baris] = kolom bintang, -1 bila kosong. */
  async submit(placement: number[]): Promise<GameSubmitResult> {
    return apiClient<GameSubmitResult>('/api/game/today/submit', {
      method: 'POST',
      body: JSON.stringify({ placement }),
    });
  },

  /** GET /api/game/leaderboard — papan skor teman atau grup (hanya penyelesaian sah; blokir dihormati server). */
  async getLeaderboard(params: {
    scope: GameBoardScope;
    period: GameBoardPeriod;
    groupId?: string;
  }): Promise<GameLeaderboard> {
    const q = new URLSearchParams({ scope: params.scope, period: params.period });
    if (params.groupId) q.append('group_id', params.groupId);
    return apiClient<GameLeaderboard>(`/api/game/leaderboard?${q.toString()}`, { method: 'GET' });
  },

  /** GET /api/game/settings */
  async getSettings(): Promise<GameSettings> {
    return apiClient<GameSettings>('/api/game/settings', { method: 'GET' });
  },

  /** PUT /api/game/settings — field yang tidak dikirim tidak diubah. */
  async updateSettings(input: Partial<GameSettings>): Promise<GameSettings> {
    return apiClient<GameSettings>('/api/game/settings', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },
};
