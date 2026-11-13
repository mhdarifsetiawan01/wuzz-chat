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
const { creatorShare, parseSettingsForm, settingsToForm, settingsDiff, formatStarDelta, formatMinor, starErrorMessage, newIdempotencyKey } = load('adminStars.ts');

const base = { star_value_minor: 100, currency: 'IDR', packages: [50, 100, 500], group_price_min: 10, group_price_max: 5000, store_fee_pct: 15, platform_pct: 20, hold_days: 14 };

// Rumus bagian kreator sama dengan backend (TestStars_SettingsDefaultsAndValidation: 100 Star -> 10000/6800).
assert.deepEqual(creatorShare(base, 100), { gross: 10000, share: 6800 });
assert.deepEqual(creatorShare({ ...base, platform_pct: 33 }, 7), { gross: 700, share: 398 }, 'dibulatkan ke bawah');

// Formulir: bolak-balik tanpa kehilangan nilai; validasi sama dengan backend.
assert.deepEqual(parseSettingsForm(settingsToForm(base)).settings, base);
const f = settingsToForm(base);
assert.match(parseSettingsForm({ ...f, platform_pct: '95' }).error, /platform/);
assert.match(parseSettingsForm({ ...f, store_fee_pct: '51' }).error, /toko/);
assert.match(parseSettingsForm({ ...f, group_price_max: '5' }).error, /maksimum/);
assert.match(parseSettingsForm({ ...f, packages: '' }).error, /Paket/);
assert.match(parseSettingsForm({ ...f, packages: '10, x' }).error, /Paket/);
assert.match(parseSettingsForm({ ...f, currency: 'rupiah' }).error, /Mata uang/);
assert.match(parseSettingsForm({ ...f, hold_days: '-1' }).error, /Masa tahan/);
assert.equal(parseSettingsForm({ ...f, currency: 'idr', packages: ' 20 ,200 ' }).settings.currency, 'IDR');
assert.deepEqual(parseSettingsForm({ ...f, packages: ' 20 ,200 ' }).settings.packages, [20, 200]);

// Daftar perubahan untuk dialog konfirmasi.
assert.deepEqual(settingsDiff(base, { ...base, platform_pct: 30, packages: [20] }), ['Paket Star: 50, 100, 500 → 20', 'Bagian platform (%): 20 → 30']);
assert.deepEqual(settingsDiff(base, base), []);

// Format.
assert.equal(formatStarDelta(150), '+150');
assert.equal(formatStarDelta(-1000), '−1.000');
assert.equal(formatStarDelta(0), '0');
assert.match(formatMinor(6800, 'IDR'), /6\.800/);
assert.doesNotMatch(formatMinor(6800, 'IDR'), /,00/);

// Pesan galat & kunci idempoten.
assert.match(starErrorMessage('test_grants_disabled', 'x'), /STARS_TEST_GRANTS/);
assert.equal(starErrorMessage('lain', 'cadangan'), 'cadangan');
assert.notEqual(newIdempotencyKey(), newIdempotencyKey());

console.log('admin-stars: OK');
