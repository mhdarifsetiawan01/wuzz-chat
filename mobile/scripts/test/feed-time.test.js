'use strict';
// Waktu relatif feed/komentar: kata penuh ("mnt/jam/hari"), tanggal absolut setelah 7 hari, input tidak valid.
const assert = require('assert');
const { loadFresh } = require('./_harness');

const { feedTime } = loadFresh(['utils/feedTime.ts']);
const { formatPostTime } = feedTime;

const now = Date.UTC(2026, 9, 4, 12, 0, 0);
const ago = (ms) => new Date(now - ms).toISOString();
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

assert.strictEqual(formatPostTime(ago(10 * 1000), now), 'Baru saja');
assert.strictEqual(formatPostTime(ago(5 * MIN), now), '5 mnt lalu');
assert.strictEqual(formatPostTime(ago(59 * MIN), now), '59 mnt lalu');
assert.strictEqual(formatPostTime(ago(HOUR), now), '1 jam lalu');
assert.strictEqual(formatPostTime(ago(23 * HOUR), now), '23 jam lalu');
assert.strictEqual(formatPostTime(ago(DAY), now), '1 hari lalu');
assert.strictEqual(formatPostTime(ago(4 * DAY), now), '4 hari lalu');
assert.strictEqual(formatPostTime(ago(6 * DAY + 23 * HOUR), now), '6 hari lalu');
assert.strictEqual(formatPostTime(ago(2 * 60 * 1000 * -1), now), 'Baru saja'); // jam server sedikit di depan klien
assert.strictEqual(formatPostTime('bukan tanggal', now), '');
assert.ok(!/\dh lalu|\dj lalu|\dm lalu/.test(formatPostTime(ago(3 * DAY), now)), 'tidak boleh memakai singkatan m/j/h');
// >= 7 hari: bukan lagi "x hari lalu"
assert.ok(!formatPostTime(ago(8 * DAY), now).includes('lalu'));

console.log('feed-time: mnt/jam/hari, batas 7 hari, jam klien tertinggal, input tidak valid');
