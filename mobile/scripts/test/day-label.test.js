'use strict';
// Label pemisah tanggal chat: hari ini/kemarin/nama hari/tanggal, kunci hari lokal. Tanggal dibuat dari komponen lokal agar tidak bergantung zona waktu mesin.
const assert = require('assert');
const { loadFresh } = require('./_harness');

const { dayLabel } = loadFresh(['utils/dayLabel.ts']);
const { dayKey, formatDayLabel } = dayLabel;

const now = new Date(2026, 9, 4, 21, 0); // Minggu, 4 Okt 2026 21:00
const at = (y, m, d, h = 12) => new Date(y, m, d, h);

assert.strictEqual(formatDayLabel(at(2026, 9, 4, 0), now), 'Hari ini');
assert.strictEqual(formatDayLabel(at(2026, 9, 4, 23), now), 'Hari ini');
assert.strictEqual(formatDayLabel(at(2026, 9, 3, 23), now), 'Kemarin');
assert.strictEqual(formatDayLabel(at(2026, 9, 2), now), 'Jumat');
assert.strictEqual(formatDayLabel(at(2026, 8, 28), now), 'Senin'); // 6 hari lalu
assert.strictEqual(formatDayLabel(at(2026, 8, 27), now), '27 Sep'); // 7 hari lalu -> tanggal
assert.strictEqual(formatDayLabel(at(2026, 0, 5), now), '5 Jan');
assert.strictEqual(formatDayLabel(at(2025, 11, 31), now), '31 Des 2025');
assert.strictEqual(formatDayLabel('bukan tanggal', now), '');

assert.strictEqual(dayKey(at(2026, 9, 4, 0)), dayKey(at(2026, 9, 4, 23)));
assert.notStrictEqual(dayKey(at(2026, 9, 4, 23)), dayKey(at(2026, 9, 5, 0)));
assert.notStrictEqual(dayKey(at(2026, 8, 4)), dayKey(at(2026, 9, 4))); // bulan beda, hari sama
for (const bad of [undefined, null, '', 'xyz']) assert.strictEqual(dayKey(bad), null);

console.log('day-label: label hari, batas tengah malam, bulan/tahun berbeda, input tidak valid');
