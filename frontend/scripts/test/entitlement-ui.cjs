const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function load(file) {
  const filename = path.resolve(__dirname, '../../lib', file);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = new Module(filename, module); m.filename = filename; m.paths = module.paths; m._compile(output, filename); return m.exports;
}
// Salinan web harus berperilaku sama dengan mobile (mobile/src/utils/entitlement.ts): teks netral, jujur, aman tanpa status.
const e = load('entitlement.ts');
const base = (over = {}) => ({
  plan: 'free', limits_enforced: true,
  forums: { active: 0, limit: 1 }, allowed_duration_days: [7],
  ai: { enforced: true, used: 0, limit: 2, reset_at: '2026-11-01T00:00:00Z' },
  ...over,
});
for (const ent of [null, undefined, base({ limits_enforced: false })]) {
  assert.equal(e.forumLimitNotice(ent), null);
  assert.equal(e.isDurationAllowed(ent, 30), true);
  assert.equal(e.durationLockedNote(ent, 30), '');
}
assert.equal(e.aiQuotaNotice(null), null);
assert.equal(e.aiQuotaNotice(base({ ai: { enforced: false, used: 5, limit: 2, reset_at: '' } })), null);
assert.deepEqual(e.forumLimitNotice(base()), { text: 'Forum aktif: 0 dari 1 (paket Gratis).', atLimit: false });
const full = e.forumLimitNotice(base({ forums: { active: 1, limit: 1 } }));
assert.equal(full.atLimit, true);
assert.match(full.text, /Batas forum aktif paket Gratis tercapai \(1 dari 1\)/);
assert.match(full.text, /hubungi admin Wuzz untuk akses Pro/);
assert.doesNotMatch(e.forumLimitNotice(base({ plan: 'pro', forums: { active: 5, limit: 5 } })).text, /akses Pro/);
assert.equal(e.isDurationAllowed(base(), 30), false);
assert.equal(e.durationLockedNote(base(), 30), 'Tersedia di paket Pro');
assert.equal(e.isDurationAllowed(base({ plan: 'pro', allowed_duration_days: [7, 30] }), 30), true);
const out = e.aiQuotaNotice(base({ ai: { enforced: true, used: 2, limit: 2, reset_at: '2026-11-01T00:00:00Z' } }));
assert.equal(out.exhausted, true);
assert.match(out.text, /dihitung ulang 1 November\./);
assert.equal(e.formatResetDate('2027-01-01T00:00:00Z'), '1 Januari');
assert.equal(e.formatResetDate('bukan-tanggal'), '');
assert.match(e.expireOutcomeMessage('quota_exceeded', true), /tidak dibuat karena kuota/);
assert.doesNotMatch(e.expireOutcomeMessage('queued', false), /diproses/);
assert.doesNotMatch(e.expireOutcomeMessage(undefined, true), /diproses/);
const all = [full.text, out.text, e.durationLockedNote(base(), 30), e.expireOutcomeMessage('quota_exceeded', true)].join(' ');
assert.doesNotMatch(all.toLowerCase(), /bayar|beli|harga|rp\s?\d|transfer|http|upgrade|langganan/);
// Perpanjangan masa aktif forum: 1-3 hari per kali, total 30 hari.
assert.deepEqual(e.extendChoices(0), [1, 2, 3]);
assert.deepEqual(e.extendChoices(undefined), [1, 2, 3], 'server lama tanpa field = belum pernah diperpanjang');
assert.deepEqual(e.extendChoices(28), [1, 2], 'tidak menawarkan melebihi sisa jatah');
assert.deepEqual(e.extendChoices(29), [1]);
assert.deepEqual(e.extendChoices(30), []);
assert.deepEqual(e.extendChoices(99), [], 'nilai di luar batas tidak menghasilkan pilihan negatif');
assert.equal(e.extendRemainingDays(12), 18);
assert.equal(e.extendRemainingDays(NaN), 30);
assert.match(e.extendSuccessMessage(2, 18), /diperpanjang 2 hari\. Sisa jatah perpanjangan forum ini 18 hari\./);
assert.match(e.extendSuccessMessage(1, 0), /jatah perpanjangan forum ini sudah habis/i);

console.log('Web entitlement UI: batas forum, durasi, kuota AI, pesan akhiri, dan teks netral passed');
