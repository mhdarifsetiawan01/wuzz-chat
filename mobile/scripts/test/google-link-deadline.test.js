'use strict';
// Logika banner penautan Google: tingkat urgensi per sisa hari KALENDER, batas tepat, wording, data rusak, dan penunda.
// Zona waktu dikunci ke WIB agar hasil sama di mesin mana pun (perhitungan hari kalender memakai zona waktu perangkat).
process.env.TZ = 'Asia/Jakarta';
const assert = require('assert');
const { loadFresh } = require('./_harness');

const { googleLinkDeadline: g } = loadFresh(['utils/googleLinkDeadline.ts']);
assert.strictEqual(new Date('2026-10-30T16:59:59Z').getHours(), 23, 'TZ harus WIB (UTC+7) untuk uji ini');

const DAY = 24 * 60 * 60 * 1000;
const DEADLINE = '2026-10-30T16:59:59Z'; // 30 Okt 2026 23:59:59 WIB (tenggat produksi nyata)
const wib = (y, m, d, hh = 8, mm = 0) => new Date(Date.UTC(y, m - 1, d, hh - 7, mm)); // jam dinding WIB
const st = (now) => g.getLinkDeadlineState(DEADLINE, false, now);

// Tanpa pengumuman: sudah tertaut, tanpa tenggat, tenggat rusak.
for (const s of [
  g.getLinkDeadlineState(DEADLINE, true, wib(2026, 10, 6)),
  g.getLinkDeadlineState(undefined, false, wib(2026, 10, 6)),
  g.getLinkDeadlineState(null, undefined, wib(2026, 10, 6)),
  g.getLinkDeadlineState('', false, wib(2026, 10, 6)),
  g.getLinkDeadlineState('bukan-tanggal', false, wib(2026, 10, 6)),
]) {
  assert.strictEqual(s.urgency, 'none');
  assert.strictEqual(s.message, '');
  assert.strictEqual(s.dismissible, false);
}
// google_linked belum diketahui (undefined) + ada tenggat = tetap diumumkan (server hanya mengirim untuk akun belum tertaut).
assert.notStrictEqual(g.getLinkDeadlineState(DEADLINE, undefined, wib(2026, 10, 6)).urgency, 'none');

// REGRESI NYATA: angka harus cocok dengan kalender dan tidak melebih-lebihkan. Pada 6 Okt, tenggat 30 Okt = 24 hari
// (versi lama menulis "25 hari lagi"); pada 28 Okt tinggal 2 hari (versi lama: "3 hari lagi" dan bukan urgent).
const oct6 = st(wib(2026, 10, 6, 8));
assert.strictEqual(oct6.daysLeft, 24);
assert.ok(oct6.message.includes('(24 hari lagi)'), oct6.message);
const oct28 = st(wib(2026, 10, 28, 8));
assert.strictEqual(oct28.daysLeft, 2);
assert.strictEqual(oct28.urgency, 'urgent', '2 hari kalender tersisa harus urgent');
assert.ok(oct28.message.includes('(2 hari lagi)'), oct28.message);

// Jam dalam sehari tidak mengubah angka: sepanjang 6 Okt (00:00 sampai 23:59) tetap 24 hari.
for (const [hh, mm] of [[0, 0], [0, 1], [12, 0], [23, 59]]) assert.strictEqual(st(wib(2026, 10, 6, hh, mm)).daysLeft, 24, `jam ${hh}:${mm}`);

// Tingkat dan penunda per sisa hari kalender (tenggat 30 Okt, "sekarang" = tanggal berikut pukul 12:00).
const table = [
  [31, 'info', 7 * DAY, true],
  [30, 'info', 3 * DAY, true],
  [8, 'info', 3 * DAY, true],
  [7, 'warning', 1 * DAY, true],
  [3, 'warning', 1 * DAY, true],
  [2, 'urgent', 0, false],
  [1, 'urgent', 0, false],
  [0, 'urgent', 0, false],
];
for (const [daysLeft, urgency, snooze, dismissible] of table) {
  const now = new Date(wib(2026, 10, 30, 12).getTime() - daysLeft * DAY);
  const s = st(now);
  assert.strictEqual(s.urgency, urgency, `${daysLeft} hari kalender: harus ${urgency}, dapat ${s.urgency}`);
  assert.strictEqual(s.snoozeMs, snooze, `snooze untuk ${daysLeft} hari`);
  assert.strictEqual(s.dismissible, dismissible, `dismissible untuk ${daysLeft} hari`);
  assert.strictEqual(s.daysLeft, daysLeft);
}

// Wording: "paling lambat" (bukan "sebelum": tenggat berlaku sampai akhir hari itu), "besok", dan "hari ini".
assert.ok(oct6.message.startsWith('Hubungkan akun Google paling lambat '), oct6.message);
assert.ok(!/sebelum/.test(oct6.message), 'jangan memakai "sebelum": menyiratkan harus selesai sehari lebih awal');
assert.ok(st(wib(2026, 10, 29, 9)).message.includes('(besok)'), 'tinggal 1 hari kalender = "besok"');
assert.ok(!/1 hari lagi/.test(st(wib(2026, 10, 29, 9)).message));
const today = st(wib(2026, 10, 30, 9));
assert.strictEqual(today.urgency, 'urgent');
assert.ok(/hari ini/.test(today.message), today.message);
assert.strictEqual(today.dismissible, false);
// Tepat sebelum tenggat (23:59:58) masih "hari ini" dan belum expired.
assert.strictEqual(st(new Date(new Date(DEADLINE).getTime() - 1000)).urgency, 'urgent');

// Sudah lewat (tepat saat tenggat dan sesudahnya): expired, tanpa janji pembekuan/penghapusan.
for (const after of [0, 1, DAY, 90 * DAY]) {
  const s = g.getLinkDeadlineState(DEADLINE, false, new Date(new Date(DEADLINE).getTime() + after));
  assert.strictEqual(s.urgency, 'expired');
  assert.strictEqual(s.dismissible, false);
  assert.strictEqual(s.daysLeft, 0);
  assert.ok(!/bekukan|dibekukan|dihapus/i.test(s.message), 'pesan tidak boleh menjanjikan pembekuan/penghapusan');
}

// Format tanggal (zona waktu perangkat), tanpa Intl.
assert.strictEqual(g.formatDeadlineDate(new Date(2026, 11, 31, 12)), '31 Des 2026');
assert.strictEqual(g.formatDeadlineDate(new Date(2026, 4, 5, 12)), '5 Mei 2026');
assert.ok(oct6.message.includes('30 Okt 2026'), oct6.message);

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

console.log('google-link-deadline: hari kalender (24 hari pada 6 Okt, 2 hari pada 28 Okt), wording, expired tanpa janji pembekuan, penunda');
