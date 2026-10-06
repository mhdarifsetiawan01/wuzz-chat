'use strict';
// Sinyal akun beku: pendengar, isolasi galat, deteksi galat API dan penutupan WebSocket (termasuk tabrakan kode 4003 lama).
const assert = require('assert');
const { loadFresh } = require('./_harness');

const { linkFrozen: lf } = loadFresh(['utils/linkFrozen.ts']);

// Pendengar menerima kejadian, bisa berhenti, dan galat satu pendengar tidak mematikan yang lain.
const originalError = console.error;
console.error = () => {};
let a = 0;
let b = 0;
const offA = lf.onGoogleLinkRequired(() => {
  a++;
});
const offBad = lf.onGoogleLinkRequired(() => {
  throw new Error('pendengar rusak');
});
const offB = lf.onGoogleLinkRequired(() => {
  b++;
});
lf.notifyGoogleLinkRequired();
assert.deepStrictEqual([a, b], [1, 1], 'galat satu pendengar tidak boleh menghentikan pendengar lain');
offA();
lf.notifyGoogleLinkRequired();
assert.deepStrictEqual([a, b], [1, 2], 'pendengar yang berhenti tidak boleh dipanggil lagi');
offBad();
offB();
lf.notifyGoogleLinkRequired(); // tanpa pendengar: tidak melempar
assert.deepStrictEqual([a, b], [1, 2]);
// Tidak ada status tersimpan: pendengar baru tidak langsung dipanggil oleh kejadian lama.
let late = 0;
const offLate = lf.onGoogleLinkRequired(() => {
  late++;
});
assert.strictEqual(late, 0);
offLate();
console.error = originalError;

// Deteksi galat API.
assert.ok(lf.isGoogleLinkRequiredError({ status: 403, code: 'GOOGLE_LINK_REQUIRED' }));
assert.ok(lf.isGoogleLinkRequiredError({ status: 403, data: { code: 'GOOGLE_LINK_REQUIRED' } }));
for (const e of [null, undefined, {}, { status: 403 }, { status: 403, code: 'DEVICE_KICKED' }, { code: 'USERNAME_TAKEN' }, { data: null }, { data: { code: 'X' } }]) {
  assert.ok(!lf.isGoogleLinkRequiredError(e), 'bukan galat beku: ' + JSON.stringify(e));
}

// Penutupan WebSocket: 4003 + alasan GOOGLE_LINK_REQUIRED saja. 4003 lama (DEVICE_MISMATCH) dan kode lain tidak boleh cocok.
assert.ok(lf.isLinkRequiredClose(4003, 'GOOGLE_LINK_REQUIRED'));
assert.ok(lf.isLinkRequiredClose(4003, 'x GOOGLE_LINK_REQUIRED x'));
assert.ok(!lf.isLinkRequiredClose(4003, 'DEVICE_MISMATCH'), '4003 lama (device mismatch) tidak boleh dianggap beku');
assert.ok(!lf.isLinkRequiredClose(4003, ''));
assert.ok(!lf.isLinkRequiredClose(4003, undefined));
assert.ok(!lf.isLinkRequiredClose(4001, 'GOOGLE_LINK_REQUIRED'), 'kode selain 4003 tidak boleh cocok');
assert.ok(!lf.isLinkRequiredClose(1006, 'GOOGLE_LINK_REQUIRED'));

console.log('link-frozen: pendengar terisolasi, deteksi galat API, penutupan WS tidak bentrok dengan 4003 lama');
