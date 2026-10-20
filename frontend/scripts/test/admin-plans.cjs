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
const { planSummary, enforcementNote, parseDaysInput, grandfatherPreviewText } = load('adminPlans.ts');
const fmt = (iso) => `<${iso.slice(0, 10)}>`;
const status = (over = {}) => ({
  plan: 'free', limits_enforced: true, forums: { active: 0, limit: 1 }, allowed_duration_days: [7],
  ai: { enforced: true, used: 0, limit: 2, reset_at: '2026-11-01T00:00:00Z' }, ...over,
});

// Ringkasan paket: alasan Gratis harus jelas bagi admin.
assert.deepEqual(planSummary(status(), null, fmt), { headline: 'Gratis', tone: 'free', detail: 'Belum pernah diberi paket.' });
assert.equal(planSummary(status(), { plan: 'pro', status: 'revoked', source: 'manual' }, fmt).detail, 'Paket dicabut.');
assert.equal(planSummary(status(), { plan: 'pro', status: 'active', source: 'manual', valid_until: '2026-09-01T00:00:00Z' }, fmt).detail, 'Pro berakhir <2026-09-01>.');
assert.equal(planSummary(status(), { plan: 'pro', status: 'active', source: 'manual' }, fmt).detail, 'Tidak ada paket aktif.');
const pro = planSummary(status({ plan: 'pro', valid_until: '2026-12-20T00:00:00Z' }), { plan: 'pro', status: 'active', source: 'grandfather', valid_until: '2026-12-20T00:00:00Z' }, fmt);
assert.deepEqual(pro, { headline: 'Pro', tone: 'pro', detail: 'Berlaku sampai <2026-12-20> · Pengguna lama' });
assert.equal(planSummary(status({ plan: 'pro' }), { plan: 'pro', status: 'active', source: 'manual' }, fmt).detail, 'Tanpa batas waktu · Manual');
assert.equal(planSummary(status({ plan: 'pro' }), null, fmt).detail, 'Tanpa batas waktu', 'tanpa baris sumber tidak menampilkan "undefined"');
assert.match(planSummary(status(), { plan: 'pro', status: 'active', source: 'manual', valid_until: 'x' }).detail, /Pro berakhir -\./, 'tanggal tidak valid aman');

// Status penegakan.
assert.match(enforcementNote(status()), /Batas forum aktif DITEGAKKAN; kuota ringkasan AI DITEGAKKAN/);
assert.match(enforcementNote(status({ limits_enforced: false, ai: { enforced: false, used: 0, limit: 2, reset_at: '' } })), /BELUM ditegakkan \(informasi saja\); kuota ringkasan AI BELUM ditegakkan/);

// Isian hari.
const free = { allowZero: false, max: 365 }, pro30 = { allowZero: true, max: 3650 };
assert.equal(parseDaysInput('60', free), 60);
assert.equal(parseDaysInput(' 7 ', free), 7);
for (const bad of ['', '0', '-1', '1.5', '1e3', 'abc', '366', '99999999999999999999']) assert.equal(parseDaysInput(bad, free), null, bad);
assert.equal(parseDaysInput('0', pro30), 0, '0 = tanpa batas waktu untuk Pro manual');
assert.equal(parseDaysInput('3650', pro30), 3650);
assert.equal(parseDaysInput('3651', pro30), null);

// Pratinjau grandfather.
assert.match(grandfatherPreviewText({ eligible: 0, sample: [], days: 60 }), /Tidak ada akun yang memenuhi syarat/);
assert.equal(grandfatherPreviewText({ eligible: 2, sample: ['a', 'b'], days: 60 }), '2 akun akan mendapat Pro selama 60 hari: @a, @b.');
assert.equal(grandfatherPreviewText({ eligible: 25, sample: Array.from({ length: 20 }, (_, i) => 'u' + i), days: 30 }).endsWith(', @u19 dan 5 lainnya.'), true);
console.log('Admin plans: ringkasan paket, status penegakan, isian hari, dan pratinjau grandfather passed');
