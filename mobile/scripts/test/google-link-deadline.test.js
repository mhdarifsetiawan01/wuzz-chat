'use strict';
// Logika banner penautan Google: tingkat urgensi per sisa waktu, batas tepat, zona waktu, data rusak, dan penunda.
const assert = require('assert');
const { loadFresh } = require('./_harness');

const { googleLinkDeadline: g } = loadFresh(['utils/googleLinkDeadline.ts']);

const DAY = 24 * 60 * 60 * 1000;
const deadline = '2026-12-31T16:59:59Z'; // 23:59:59 WIB
const dl = new Date(deadline).getTime();
const at = (msBefore) => new Date(dl - msBefore);
const state = (msBefore, linked) => g.getLinkDeadlineState(deadline, linked, at(msBefore));

// Tanpa pengumuman: sudah tertaut, tanpa tenggat, tenggat rusak.
for (const s of [
  g.getLinkDeadlineState(deadline, true, at(10 * DAY)),
  g.getLinkDeadlineState(undefined, false, at(10 * DAY)),
  g.getLinkDeadlineState(null, undefined, at(10 * DAY)),
  g.getLinkDeadlineState('', false, at(10 * DAY)),
  g.getLinkDeadlineState('bukan-tanggal', false, at(10 * DAY)),
]) {
  assert.strictEqual(s.urgency, 'none');
  assert.strictEqual(s.message, '');
  assert.strictEqual(s.dismissible, false);
}
// google_linked belum diketahui (undefined) + ada tenggat = tetap diumumkan (server hanya mengirim untuk akun belum tertaut).
assert.notStrictEqual(g.getLinkDeadlineState(deadline, undefined, at(10 * DAY)).urgency, 'none');

// Tingkat per sisa hari, termasuk batas tepat.
const table = [
  [60 * DAY, 'info', 7 * DAY, true],
  [31 * DAY - 1000, 'info', 7 * DAY, true], // masih > 30 hari penuh? ceil(30.99..)=31
  [30 * DAY, 'info', 3 * DAY, true], // tepat 30 hari = 30 -> 3 hari
  [8 * DAY, 'info', 3 * DAY, true],
  [7 * DAY, 'warning', 1 * DAY, true],
  [3 * DAY, 'warning', 1 * DAY, true],
  [2 * DAY, 'urgent', 0, false],
  [1 * DAY + 1000, 'urgent', 0, false],
];
for (const [before, urgency, snooze, dismissible] of table) {
  const s = state(before, false);
  assert.strictEqual(s.urgency, urgency, `sisa ${before / DAY} hari harus ${urgency}, dapat ${s.urgency}`);
  assert.strictEqual(s.snoozeMs, snooze, `snooze untuk sisa ${before / DAY} hari`);
  assert.strictEqual(s.dismissible, dismissible);
}
// > 30 hari penuh memakai snooze 7 hari; tepat 30 hari memakai 3 hari (batas dibulatkan ke atas).
assert.strictEqual(state(31 * DAY, false).snoozeMs, 7 * DAY);
assert.strictEqual(state(30 * DAY, false).snoozeMs, 3 * DAY);

// Kurang dari 24 jam: pesan khusus, tidak bisa ditutup.
const lastDay = state(23 * 60 * 60 * 1000, false);
assert.strictEqual(lastDay.urgency, 'urgent');
assert.ok(/24 jam/.test(lastDay.message));
assert.strictEqual(lastDay.dismissible, false);

// Sudah lewat (tepat saat tenggat dan sesudahnya): expired, tanpa janji pembekuan.
for (const after of [0, 1, DAY, 90 * DAY]) {
  const s = g.getLinkDeadlineState(deadline, false, new Date(dl + after));
  assert.strictEqual(s.urgency, 'expired');
  assert.strictEqual(s.dismissible, false);
  assert.strictEqual(s.daysLeft, 0);
  assert.ok(!/bekukan|dibekukan|dihapus/i.test(s.message), 'pesan tidak boleh menjanjikan pembekuan/penghapusan yang belum ada');
}

// Pesan memuat tanggal dan sisa hari (tanggal menurut zona waktu perangkat, jadi diuji lewat fungsi format).
const s10 = state(10 * DAY, false);
assert.ok(s10.message.includes(g.formatDeadlineDate(new Date(deadline))), s10.message);
assert.ok(s10.message.includes('10 hari lagi'), s10.message);
assert.strictEqual(g.formatDeadlineDate(new Date(2026, 11, 31, 12)), '31 Des 2026');
assert.strictEqual(g.formatDeadlineDate(new Date(2026, 4, 5, 12)), '5 Mei 2026');

// Penunda: nilai rusak dianggap tidak ada; hanya berlaku sampai waktunya.
const now = new Date(2026, 9, 6, 12);
assert.strictEqual(g.parseSnoozeUntil(null), null);
assert.strictEqual(g.parseSnoozeUntil(''), null);
assert.strictEqual(g.parseSnoozeUntil('abc'), null);
assert.strictEqual(g.parseSnoozeUntil('-5'), null);
assert.strictEqual(g.parseSnoozeUntil('0'), null);
assert.strictEqual(g.parseSnoozeUntil(String(now.getTime() + 1000)), now.getTime() + 1000);
assert.strictEqual(g.isSnoozed(null, now), false);
assert.strictEqual(g.isSnoozed(now.getTime() + 1000, now), true);
assert.strictEqual(g.isSnoozed(now.getTime(), now), false, 'tepat pada batas tunda = sudah tidak tertunda');
assert.strictEqual(g.isSnoozed(now.getTime() - 1, now), false);

// Nama kunci aman untuk SecureStore dan terpisah per akun.
assert.ok(/^[A-Za-z0-9._-]+$/.test(g.snoozeStorageKey('8b8095d7-a721-482f-8e3c-f3413047f379')));
assert.ok(/^[A-Za-z0-9._-]+$/.test(g.snoozeStorageKey('user@x/y z')));
assert.notStrictEqual(g.snoozeStorageKey('a'), g.snoozeStorageKey('b'));

console.log('google-link-deadline: tingkat urgensi, batas tepat, expired tanpa janji pembekuan, penunda, nama kunci aman');
