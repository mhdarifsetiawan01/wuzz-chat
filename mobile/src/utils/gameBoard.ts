/**
 * Logika murni papan Wuzz Grid (tanpa React Native): tanda sel, deteksi konflik, bentuk wilayah,
 * ukuran sel, format waktu, dan serialisasi untuk penyimpanan lokal.
 * Aturan sama dengan backend (internal/game): satu bintang per baris, kolom, dan wilayah,
 * dan tidak ada dua bintang yang bersentuhan (termasuk diagonal). Validasi final tetap di server.
 */

/** 0 = kosong, 1 = tanda X (catatan pemain), 2 = bintang. */
export type CellMark = 0 | 1 | 2;
export type Board = CellMark[][];

export const MARK_EMPTY: CellMark = 0;
export const MARK_X: CellMark = 1;
export const MARK_STAR: CellMark = 2;

export const MIN_GRID_SIZE = 6;
export const MAX_GRID_SIZE = 9;

export function emptyBoard(size: number): Board {
  return Array.from({ length: size }, () => Array<CellMark>(size).fill(MARK_EMPTY));
}

/** Ketuk: kosong -> X -> bintang -> kosong. */
export function cycleMark(mark: CellMark): CellMark {
  if (mark === MARK_EMPTY) return MARK_X;
  if (mark === MARK_X) return MARK_STAR;
  return MARK_EMPTY;
}

/** Mengembalikan papan baru dengan sel (r, c) diketuk; papan asli tidak diubah. */
export function tapCell(board: Board, r: number, c: number): Board {
  if (!board[r] || board[r][c] === undefined) return board;
  return board.map((row, i) => (i === r ? row.map((m, j) => (j === c ? cycleMark(m) : m)) : row));
}

export function starCount(board: Board): number {
  let n = 0;
  for (const row of board) for (const m of row) if (m === MARK_STAR) n++;
  return n;
}

/**
 * Menandai bintang yang melanggar aturan: sebaris, sekolom, sewilayah dengan bintang lain,
 * atau bersentuhan (8 arah). Hasilnya matriks boolean; sel non-bintang selalu false.
 */
export function findConflicts(board: Board, regions: number[][]): boolean[][] {
  const size = board.length;
  const out = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const stars: Array<[number, number]> = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) if (board[r][c] === MARK_STAR) stars.push([r, c]);
  }
  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      const [r1, c1] = stars[i];
      const [r2, c2] = stars[j];
      const clash =
        r1 === r2 ||
        c1 === c2 ||
        regions[r1][c1] === regions[r2][c2] ||
        (Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1);
      if (clash) {
        out[r1][c1] = true;
        out[r2][c2] = true;
      }
    }
  }
  return out;
}

export function hasConflict(conflicts: boolean[][]): boolean {
  return conflicts.some((row) => row.some(Boolean));
}

/** Papan siap dikirim: bintang sebanyak ukuran grid dan tidak ada konflik. */
export function isSubmittable(board: Board, regions: number[][]): boolean {
  return starCount(board) === board.length && !hasConflict(findConflicts(board, regions));
}

/** Placement untuk API: kolom bintang per baris, -1 untuk baris tanpa bintang. */
export function boardToPlacement(board: Board): number[] {
  return board.map((row) => row.indexOf(MARK_STAR));
}

export interface CellBorders {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

/** True pada sisi yang berbatasan dengan wilayah lain atau tepi grid (untuk garis tebal). */
export function cellBorders(regions: number[][], r: number, c: number): CellBorders {
  const size = regions.length;
  const id = regions[r][c];
  return {
    top: r === 0 || regions[r - 1][c] !== id,
    bottom: r === size - 1 || regions[r + 1][c] !== id,
    left: c === 0 || regions[r][c - 1] !== id,
    right: c === size - 1 || regions[r][c + 1] !== id,
  };
}

/**
 * Sel pertama (kiri-atas, baris dulu) tiap wilayah => nomor wilayah (id + 1) ditulis di sel itu,
 * sehingga wilayah bisa dibedakan tanpa bergantung pada warna (pengguna buta warna).
 */
export function regionLabelCells(regions: number[][]): Map<string, number> {
  const seen = new Set<number>();
  const out = new Map<string, number>();
  for (let r = 0; r < regions.length; r++) {
    for (let c = 0; c < regions[r].length; c++) {
      const id = regions[r][c];
      if (!seen.has(id)) {
        seen.add(id);
        out.set(`${r},${c}`, id + 1);
      }
    }
  }
  return out;
}

/** Ukuran sel (dp, bilangan bulat) agar grid pas di lebar yang tersedia. */
export function computeCellSize(availableWidth: number, size: number, maxCell = 52): number {
  if (size <= 0 || availableWidth <= 0) return 0;
  return Math.max(1, Math.min(maxCell, Math.floor(availableWidth / size)));
}

/** 102000 -> "1:42"; 3723000 -> "1:02:03". Masukan tidak valid -> "0:00". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

/** Teks bagikan tanpa spoiler: "Wuzz Grid #12 · 1:42 · 🔥4" (streak disembunyikan bila 0). */
export function buildShareText(number: number, durationMs: number, streak: number): string {
  const parts = [`Wuzz Grid #${number}`, formatDuration(durationMs)];
  if (streak > 0) parts.push(`🔥${streak}`);
  return parts.join(' · ');
}

// ─── Penyimpanan lokal ───────────────────────────────────────────────────────

export interface SavedBoard {
  date: string;
  cells: Board;
}

export function serializeBoard(date: string, cells: Board): string {
  return JSON.stringify({ date, cells } satisfies SavedBoard);
}

/** Membaca papan tersimpan; null bila rusak, beda tanggal, atau beda ukuran dari puzzle saat ini. */
export function parseSavedBoard(raw: string | null, date: string, size: number): Board | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SavedBoard>;
    if (parsed.date !== date || !Array.isArray(parsed.cells) || parsed.cells.length !== size) return null;
    for (const row of parsed.cells) {
      if (!Array.isArray(row) || row.length !== size) return null;
      for (const m of row) if (m !== 0 && m !== 1 && m !== 2) return null;
    }
    return parsed.cells as Board;
  } catch {
    return null;
  }
}
