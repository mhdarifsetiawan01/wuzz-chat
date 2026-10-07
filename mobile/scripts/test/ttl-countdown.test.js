'use strict';
// Hitung mundur sisa masa aktif topik forum: pembulatan hari ke terdekat, jam/menit dipotong, tanggal tidak valid aman.
const assert = require('assert');
const { loadFresh } = require('./_harness');

const { ttlCountdown: t } = loadFresh(['utils/ttlCountdown.ts']);
const NOW = Date.UTC(2026, 9, 8, 2, 0, 0);
const at = (ms) => new Date(NOW + ms).toISOString();
const MIN = 60_000, H = 3_600_000, D = 86_400_000;

assert.strictEqual(t.formatTtlRemaining(at(7 * D - 5 * MIN), NOW), '7 hari lagi', 'topik 7 hari yang baru dibuat bukan "6 hari lagi"');
assert.strictEqual(t.formatTtlRemaining(at(31 * D), NOW), '31 hari lagi', 'satu bulan kalender Oktober = 31 hari');
assert.strictEqual(t.formatTtlRemaining(at(30 * D - 2 * MIN), NOW), '30 hari lagi');
assert.strictEqual(t.formatTtlRemaining(at(1 * D), NOW), '1 hari lagi');
assert.strictEqual(t.formatTtlRemaining(at(1 * D + 11 * H), NOW), '1 hari lagi');
assert.strictEqual(t.formatTtlRemaining(at(1 * D + 13 * H), NOW), '2 hari lagi');
assert.strictEqual(t.formatTtlRemaining(at(23 * H + 59 * MIN), NOW), '23 jam lagi', 'di bawah 24 jam memakai jam');
assert.strictEqual(t.formatTtlRemaining(at(3 * H + 30 * MIN), NOW), '3 jam lagi');
assert.strictEqual(t.formatTtlRemaining(at(40 * MIN), NOW), '40 menit lagi');
assert.strictEqual(t.formatTtlRemaining(at(10_000), NOW), '1 menit lagi', 'sisa kurang dari semenit tidak tampil "0 menit"');
assert.strictEqual(t.formatTtlRemaining(at(0), NOW), 'Kedaluwarsa');
assert.strictEqual(t.formatTtlRemaining(at(-5 * MIN), NOW), 'Kedaluwarsa');
assert.strictEqual(t.formatTtlRemaining('bukan-tanggal', NOW), 'Kedaluwarsa', 'tanggal tidak valid tidak boleh menampilkan NaN');
console.log('ttl-countdown: pembulatan hari, jam, menit, dan kasus tepi OK');
