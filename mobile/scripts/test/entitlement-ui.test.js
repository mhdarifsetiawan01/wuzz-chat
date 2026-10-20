'use strict';
// Teks batas paket forum & kuota AI: netral (tanpa ajakan bayar), jujur, dan aman bila status belum ada.
const assert = require('assert');
const { loadFresh } = require('./_harness');

const { entitlement: e } = loadFresh(['utils/entitlement.ts']);

const base = (over = {}) => ({
  plan: 'free', limits_enforced: true,
  forums: { active: 0, limit: 1 }, allowed_duration_days: [7],
  ai: { enforced: true, used: 0, limit: 2, reset_at: '2026-11-01T00:00:00Z' },
  ...over,
});

// Tanpa status / batas belum ditegakkan -> tidak ada pembatasan di UI (server tetap menentukan).
for (const ent of [null, undefined, base({ limits_enforced: false })]) {
  assert.strictEqual(e.forumLimitNotice(ent), null);
  assert.strictEqual(e.isDurationAllowed(ent, 30), true);
  assert.strictEqual(e.durationLockedNote(ent, 30), '');
}
assert.strictEqual(e.aiQuotaNotice(null), null);
assert.strictEqual(e.aiQuotaNotice(base({ ai: { enforced: false, used: 5, limit: 2, reset_at: '' } })), null);

// Jatah forum.
assert.deepStrictEqual(e.forumLimitNotice(base()), { text: 'Forum aktif: 0 dari 1 (paket Gratis).', atLimit: false });
const full = e.forumLimitNotice(base({ forums: { active: 1, limit: 1 } }));
assert.strictEqual(full.atLimit, true);
assert.match(full.text, /Batas forum aktif paket Gratis tercapai \(1 dari 1\)/);
assert.match(full.text, /hubungi admin Wuzz untuk akses Pro/);
const proFull = e.forumLimitNotice(base({ plan: 'pro', forums: { active: 5, limit: 5 } }));
assert.strictEqual(proFull.atLimit, true);
assert.doesNotMatch(proFull.text, /akses Pro/, 'pengguna Pro tidak disuruh meminta Pro');

// Durasi.
const free = base();
assert.strictEqual(e.isDurationAllowed(free, 7), true);
assert.strictEqual(e.isDurationAllowed(free, 30), false);
assert.strictEqual(e.durationLockedNote(free, 30), 'Tersedia di paket Pro');
assert.strictEqual(e.isDurationAllowed(base({ plan: 'pro', allowed_duration_days: [7, 30] }), 30), true);

// Kuota AI.
assert.deepStrictEqual(e.aiQuotaNotice(base()), { text: 'Ringkasan AI bulan ini: 0 dari 2.', exhausted: false });
const out = e.aiQuotaNotice(base({ ai: { enforced: true, used: 2, limit: 2, reset_at: '2026-11-01T00:00:00Z' } }));
assert.strictEqual(out.exhausted, true);
assert.match(out.text, /Kuota ringkasan AI bulan ini habis \(2 dari 2\)/);
assert.match(out.text, /tidak dibuat saat topik berakhir/);
assert.match(out.text, /dihitung ulang 1 November\./);
assert.strictEqual(e.formatResetDate('2027-01-01T00:00:00Z'), '1 Januari', 'lintas tahun');
assert.strictEqual(e.formatResetDate('bukan-tanggal'), '', 'tanggal tidak valid tidak menampilkan NaN');
assert.doesNotMatch(e.aiQuotaNotice(base({ ai: { enforced: true, used: 2, limit: 2, reset_at: 'x' } })).text, /undefined|NaN|dihitung ulang/);

// Pesan setelah akhiri manual harus sesuai hasil server.
assert.match(e.expireOutcomeMessage('quota_exceeded', true), /tidak dibuat karena kuota/);
assert.match(e.expireOutcomeMessage('queued', true), /sedang diproses/);
assert.doesNotMatch(e.expireOutcomeMessage('queued', false), /diproses/, 'tanpa fitur AI untuk grup tidak menjanjikan ringkasan');
assert.doesNotMatch(e.expireOutcomeMessage('not_queued', true), /diproses|ringkasan/i);
assert.doesNotMatch(e.expireOutcomeMessage(undefined, true), /diproses/, 'server lama tanpa field memory tidak menjanjikan ringkasan');

// Tidak ada ajakan membayar di teks mana pun.
const all = [full.text, proFull.text, out.text, e.durationLockedNote(free, 30), e.expireOutcomeMessage('quota_exceeded', true)].join(' ');
assert.doesNotMatch(all.toLowerCase(), /bayar|beli|harga|rp\s?\d|transfer|http|upgrade|langganan/);
console.log('entitlement-ui: batas forum, durasi, kuota AI, pesan akhiri, dan teks netral OK');
