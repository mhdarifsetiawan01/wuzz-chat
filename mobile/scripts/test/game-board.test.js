'use strict';
// Logika papan Wuzz Grid: ketukan sel, konflik (baris/kolom/wilayah/sentuhan diagonal), batas wilayah,
// ukuran sel untuk layar kecil, format waktu, teks bagikan, dan pemulihan papan tersimpan.
const assert = require('assert');
const { loadFresh } = require('./_harness');

const { gameBoard: g } = loadFresh(['utils/gameBoard.ts']);

// Peta 6x6 contoh (setiap wilayah terhubung).
const regions = [
  [0, 0, 1, 1, 1, 1],
  [0, 2, 2, 1, 1, 1],
  [0, 2, 3, 3, 4, 4],
  [0, 2, 3, 5, 5, 4],
  [0, 2, 3, 5, 5, 4],
  [0, 2, 3, 3, 4, 4],
];

// --- ketukan: kosong -> X -> bintang -> kosong, papan asli tidak berubah
let b = g.emptyBoard(6);
assert.strictEqual(b.length, 6);
assert.ok(b.every((row) => row.length === 6 && row.every((m) => m === 0)));
const b1 = g.tapCell(b, 2, 3);
assert.strictEqual(b1[2][3], g.MARK_X);
assert.strictEqual(b[2][3], g.MARK_EMPTY, 'papan asli tidak boleh dimutasi');
const b2 = g.tapCell(b1, 2, 3);
assert.strictEqual(b2[2][3], g.MARK_STAR);
assert.strictEqual(g.tapCell(b2, 2, 3)[2][3], g.MARK_EMPTY);
assert.strictEqual(g.tapCell(b, 99, 0), b, 'ketukan di luar grid diabaikan');

const star = (cells) => {
  let board = g.emptyBoard(6);
  for (const [r, c] of cells) board = g.tapCell(g.tapCell(board, r, c), r, c);
  return board;
};

// --- konflik
assert.strictEqual(g.hasConflict(g.findConflicts(star([[0, 0]]), regions)), false, 'satu bintang tidak konflik');
let cf = g.findConflicts(star([[0, 0], [0, 4]]), regions);
assert.ok(cf[0][0] && cf[0][4], 'sebaris');
cf = g.findConflicts(star([[0, 0], [4, 0]]), regions);
assert.ok(cf[0][0] && cf[4][0], 'sekolom');
cf = g.findConflicts(star([[0, 2], [1, 3]]), regions);
assert.ok(cf[0][2] && cf[1][3], 'bersentuhan diagonal');
cf = g.findConflicts(star([[0, 2], [1, 2]]), regions);
assert.ok(cf[0][2] && cf[1][2], 'bersentuhan tegak');
cf = g.findConflicts(star([[0, 0], [3, 0]]), regions);
assert.ok(cf[0][0] && cf[3][0], 'sewilayah (sekolom juga)');
cf = g.findConflicts(star([[0, 0], [2, 4]]), regions);
assert.strictEqual(g.hasConflict(cf), false, 'dua bintang jauh berbeda wilayah tidak konflik');
assert.strictEqual(cf[1][1], false, 'sel non-bintang tidak pernah ditandai');
// dua bintang sewilayah tetapi beda baris/kolom/tidak bersentuhan
cf = g.findConflicts(star([[0, 2], [1, 5]]), regions);
assert.ok(cf[0][2] && cf[1][5], 'sewilayah (wilayah 1)');

// --- siap dikirim: harus 6 bintang tanpa konflik. Solusi: kolom per baris
const solution = [1, 3, 5, 0, 2, 4];
// periksa solusi contoh memang sah menurut peta ini; bila tidak, gunakan pencarian
function solve(size, regs) {
  const cols = [];
  const colUsed = new Set();
  const regUsed = new Set();
  function run(r) {
    if (r === size) return true;
    for (let c = 0; c < size; c++) {
      if (colUsed.has(c)) continue;
      if (r > 0 && Math.abs(c - cols[r - 1]) <= 1) continue;
      if (regUsed.has(regs[r][c])) continue;
      cols[r] = c; colUsed.add(c); regUsed.add(regs[r][c]);
      if (run(r + 1)) return true;
      colUsed.delete(c); regUsed.delete(regs[r][c]);
    }
    return false;
  }
  return run(0) ? cols.slice() : null;
}
const sol = solve(6, regions);
if (sol) {
  const full = star(sol.map((c, r) => [r, c]));
  assert.strictEqual(g.isSubmittable(full, regions), true, 'solusi lengkap siap dikirim');
  assert.deepStrictEqual(g.boardToPlacement(full), sol);
  const almost = star(sol.slice(0, 5).map((c, r) => [r, c]));
  assert.strictEqual(g.isSubmittable(almost, regions), false, 'kurang satu bintang');
  assert.strictEqual(g.boardToPlacement(almost)[5], -1, 'baris kosong => -1');
}
assert.strictEqual(g.isSubmittable(g.emptyBoard(6), regions), false);

// --- batas wilayah
let bd = g.cellBorders(regions, 0, 0);
assert.deepStrictEqual(bd, { top: true, left: true, right: false, bottom: false });
bd = g.cellBorders(regions, 0, 1);
assert.deepStrictEqual(bd, { top: true, left: false, right: true, bottom: true });
bd = g.cellBorders(regions, 5, 5);
assert.deepStrictEqual(bd, { top: false, left: false, right: true, bottom: true });

// --- label wilayah: satu per wilayah, di sel pertama (baris dulu)
const labels = g.regionLabelCells(regions);
assert.strictEqual(labels.size, 6);
assert.strictEqual(labels.get('0,0'), 1);
assert.strictEqual(labels.get('0,2'), 2);
assert.strictEqual(labels.get('1,1'), 3);
assert.strictEqual(labels.get('2,2'), 4);
assert.strictEqual(labels.get('2,4'), 5);
assert.strictEqual(labels.get('3,3'), 6);

// --- ukuran sel: layar 9x9 di HP kecil tetap bulat dan pas; maksimum dibatasi
assert.strictEqual(g.computeCellSize(320 - 32, 9), 32);
assert.strictEqual(g.computeCellSize(360, 9), 40);
assert.strictEqual(g.computeCellSize(1000, 6), 52, 'tablet: dibatasi maksimum');
assert.strictEqual(g.computeCellSize(0, 9), 0);
assert.strictEqual(g.computeCellSize(100, 0), 0);
assert.ok(g.computeCellSize(288, 9) * 9 <= 288, 'tidak melebihi lebar tersedia');

// --- format waktu
assert.strictEqual(g.formatDuration(0), '0:00');
assert.strictEqual(g.formatDuration(5_000), '0:05');
assert.strictEqual(g.formatDuration(102_000), '1:42');
assert.strictEqual(g.formatDuration(3_723_000), '1:02:03');
assert.strictEqual(g.formatDuration(-5), '0:00');
assert.strictEqual(g.formatDuration(NaN), '0:00');

// --- teks bagikan tanpa spoiler
assert.strictEqual(g.buildShareText(12, 102_000, 4), 'Wuzz Grid #12 · 1:42 · 🔥4');
assert.strictEqual(g.buildShareText(1, 59_000, 0), 'Wuzz Grid #1 · 0:59');
assert.strictEqual(g.buildShareText(0, 59_000, 2), 'Wuzz Grid · 0:59 · 🔥2', 'nomor kosong tidak boleh menjadi #0/#undefined');
assert.strictEqual(g.buildShareText(undefined, 59_000, 0), 'Wuzz Grid · 0:59');

// --- penyimpanan lokal
const raw = g.serializeBoard('2026-10-26', star([[0, 0]]));
const back = g.parseSavedBoard(raw, '2026-10-26', 6);
assert.ok(back && back[0][0] === g.MARK_STAR);
assert.strictEqual(g.parseSavedBoard(raw, '2026-10-27', 6), null, 'beda tanggal ditolak');
assert.strictEqual(g.parseSavedBoard(raw, '2026-10-26', 7), null, 'beda ukuran ditolak');
assert.strictEqual(g.parseSavedBoard(null, '2026-10-26', 6), null);
assert.strictEqual(g.parseSavedBoard('{bukan json', '2026-10-26', 6), null);
assert.strictEqual(g.parseSavedBoard(JSON.stringify({ date: '2026-10-26', cells: [[9]] }), '2026-10-26', 6), null);
const bad = JSON.parse(raw);
bad.cells[2][2] = 7;
assert.strictEqual(g.parseSavedBoard(JSON.stringify(bad), '2026-10-26', 6), null, 'nilai sel tidak sah ditolak');

console.log('game-board: ketukan, konflik 4 jenis, batas wilayah, ukuran sel, waktu, bagikan, simpan/pulihkan');
