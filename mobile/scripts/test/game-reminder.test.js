'use strict';
// Pengingat harian Wuzz Grid: jam dari server, jadwal hari ini/besok, dilewati bila sudah selesai atau jam lewat,
// kalimat bergantian tanpa pengulangan berurutan, dan nomor puzzle tidak pernah tampil sebagai "#undefined".
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFresh } = require('./_harness');

const g = loadFresh(['utils/gameReminder.ts']).gameReminder;
const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0);
const hm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

test('jam dari server diparse; nilai kosong atau rusak memakai 19:00', () => {
  assert.deepEqual(g.parseReminderTime('19:00'), { hour: 19, minute: 0 });
  assert.deepEqual(g.parseReminderTime('07:05'), { hour: 7, minute: 5 });
  assert.deepEqual(g.parseReminderTime(' 20:30 '), { hour: 20, minute: 30 });
  for (const bad of [undefined, null, '', '25:00', '7:30', '19-00', '19:60', 'abc', '24:00']) {
    assert.deepEqual(g.parseReminderTime(bad), { hour: 19, minute: 0 }, `nilai ${bad}`);
  }
});

test('sebelum jam pengingat dan belum selesai: hari ini ikut dijadwalkan (3 hari)', () => {
  const plan = g.planReminders({ now: at(2026, 10, 26, 10, 0), time: '19:00', finishedToday: false, numberToday: 2 });
  assert.equal(plan.length, 3);
  assert.deepEqual(plan.map((p) => p.at.getDate()), [26, 27, 28]);
  assert.ok(plan.every((p) => hm(p.at) === '19:00'));
  assert.ok(plan.every((p) => p.title === 'Wuzz Grid'));
});

test('sudah selesai hari ini: mulai besok', () => {
  const plan = g.planReminders({ now: at(2026, 10, 26, 10, 0), time: '19:00', finishedToday: true, numberToday: 2 });
  assert.deepEqual(plan.map((p) => p.at.getDate()), [27, 28, 29]);
});

test('jam pengingat sudah lewat atau kurang dari semenit lagi: hari ini dilewati', () => {
  assert.deepEqual(
    g.planReminders({ now: at(2026, 10, 26, 19, 30), time: '19:00', finishedToday: false }).map((p) => p.at.getDate()),
    [27, 28, 29],
  );
  assert.deepEqual(
    g.planReminders({ now: new Date(2026, 9, 26, 18, 59, 30), time: '19:00', finishedToday: false }).map((p) => p.at.getDate()),
    [27, 28, 29],
    'kurang dari semenit lagi dianggap lewat',
  );
  assert.equal(
    g.planReminders({ now: at(2026, 10, 26, 18, 58), time: '19:00', finishedToday: false })[0].at.getDate(),
    26,
  );
});

test('jam yang diubah server langsung dipakai', () => {
  const plan = g.planReminders({ now: at(2026, 10, 26, 6, 0), time: '20:30', finishedToday: false });
  assert.ok(plan.every((p) => hm(p.at) === '20:30'));
  const fallback = g.planReminders({ now: at(2026, 10, 26, 6, 0), time: undefined, finishedToday: false });
  assert.ok(fallback.every((p) => hm(p.at) === '19:00'), 'server belum mengirim jam: bawaan 19:00');
});

test('pergantian bulan dan tahun menghitung tanggal dengan benar', () => {
  const plan = g.planReminders({ now: at(2026, 12, 30, 20, 0), time: '19:00', finishedToday: false });
  assert.deepEqual(plan.map((p) => [p.at.getFullYear(), p.at.getMonth() + 1, p.at.getDate()]), [
    [2026, 12, 31], [2027, 1, 1], [2027, 1, 2],
  ]);
});

test('nomor puzzle naik satu per hari dan tidak pernah menjadi #undefined/#0', () => {
  const withN = g.planReminders({ now: at(2026, 10, 26, 10), time: '19:00', finishedToday: false, numberToday: 2, days: 8 });
  for (const [i, p] of withN.entries()) {
    const tpl = g.REMINDER_MESSAGES[Math.floor(Date.UTC(p.at.getFullYear(), p.at.getMonth(), p.at.getDate()) / 86400000) % g.REMINDER_MESSAGES.length];
    if (tpl.includes('{n}')) assert.ok(p.body.includes(`#${2 + i}`), `hari ke-${i}: ${p.body}`);
  }
  for (const num of [undefined, null, 0]) {
    const plan = g.planReminders({ now: at(2026, 10, 26, 10), time: '19:00', finishedToday: false, numberToday: num, days: 8 });
    for (const p of plan) {
      assert.ok(!/undefined|NaN|#0|\{n\}|#\s/.test(p.body), `tanpa nomor: ${p.body}`);
      assert.ok(p.body.length > 10 && !/^\s|\s$/.test(p.body));
    }
  }
});

test('kalimat bergantian: hari berurutan tidak sama, dan semua kalimat dipakai dalam seminggu lebih', () => {
  const plan = g.planReminders({ now: at(2026, 10, 26, 10), time: '19:00', finishedToday: false, numberToday: 2, days: 8 });
  for (let i = 1; i < plan.length; i++) {
    const strip = (s) => s.replace(/#\d+/, '#N');
    assert.notEqual(strip(plan[i].body), strip(plan[i - 1].body), 'hari berurutan memakai kalimat sama');
  }
  assert.equal(new Set(plan.map((p) => p.body.replace(/#\d+/, '#N'))).size, g.REMINDER_MESSAGES.length);
  assert.ok(g.REMINDER_MESSAGES.length >= 6, 'cukup variasi');
});

test('kalimat deterministik per tanggal dan tidak mengandung tekanan streak', () => {
  const d = at(2026, 11, 3, 19);
  assert.equal(g.reminderMessageForDay(d, 9), g.reminderMessageForDay(d, 9));
  for (const m of g.REMINDER_MESSAGES) {
    assert.ok(!/streak|hilang|putus|jangan sampai|terakhir/i.test(m), `bernada menekan: ${m}`);
    assert.ok(m.length <= 80, `terlalu panjang untuk notifikasi: ${m}`);
  }
});

test('horizon kustom dan nilai awal', () => {
  assert.equal(g.REMINDER_HORIZON_DAYS, 3);
  assert.equal(g.planReminders({ now: at(2026, 10, 26, 10), finishedToday: false, days: 1 }).length, 1);
  assert.equal(g.planReminders({ now: at(2026, 10, 26, 10), finishedToday: false, days: 0 }).length, 0);
});
