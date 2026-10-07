'use strict';
// Pemetaan galat login Google ke pesan pengguna dan predikat alur (konflik perangkat, token penautan, token Google).
const assert = require('assert');
const { loadFresh } = require('./_harness');

const { googleErrors: g } = loadFresh(['utils/supportContact.ts', 'utils/accountSuspended.ts', 'utils/googleErrors.ts']);

// Predikat
assert.ok(g.isDeviceLimitError({ status: 409, code: 'DEVICE_LIMIT_REACHED' }));
assert.ok(!g.isDeviceLimitError({ status: 409, code: 'USERNAME_TAKEN' }), '409 lain bukan konflik perangkat');
assert.ok(!g.isDeviceLimitError(null) && !g.isDeviceLimitError(undefined));
assert.ok(g.isLinkTokenError({ code: 'LINK_TOKEN_INVALID' }) && !g.isLinkTokenError({ code: 'GOOGLE_TOKEN_INVALID' }));
assert.ok(g.isGoogleTokenError({ code: 'GOOGLE_TOKEN_INVALID' }) && !g.isGoogleTokenError({ code: 'LINK_TOKEN_INVALID' }));

// Setiap kode server yang dikenal punya pesan Indonesia sendiri (bukan fallback), dan tidak ada yang kosong.
const known = [
  'GOOGLE_NOT_CONFIGURED', 'GOOGLE_TOKEN_INVALID', 'GOOGLE_REAUTH_STALE', 'GOOGLE_MISMATCH', 'LINK_TOKEN_INVALID',
  'INVALID_CREDENTIALS', 'GOOGLE_LINKED_TO_OTHER_ACCOUNT', 'ACCOUNT_ALREADY_HAS_GOOGLE', 'USERNAME_TAKEN',
  'PASSWORD_LOGIN_UNAVAILABLE', 'GOOGLE_SAME_ACCOUNT', 'GOOGLE_TENANT_NOT_ALLOWED', 'ACCOUNT_SUSPENDED',
];
const seen = new Set();
for (const code of known) {
  const msg = g.googleErrorMessage({ code, detail: 'detail-server-tidak-boleh-dipakai' }, 'FALLBACK');
  assert.ok(msg && msg !== 'FALLBACK' && !msg.includes('detail-server'), `kode ${code} harus punya pesan sendiri, dapat: ${msg}`);
  seen.add(msg);
}
assert.strictEqual(seen.size, known.length, 'tiap kode harus punya pesan yang berbeda');

// Pesan penangguhan memuat alamat support untuk banding.
assert.ok(g.googleErrorMessage({ code: 'ACCOUNT_SUSPENDED' }, 'F').includes('support@semanticdigital.id'));

// VALIDATION_ERROR memakai pesan server apa adanya; tanpa detail jatuh ke fallback.
assert.strictEqual(g.googleErrorMessage({ code: 'VALIDATION_ERROR', detail: 'username minimal 3 karakter' }, 'F'), 'username minimal 3 karakter');
assert.strictEqual(g.googleErrorMessage({ code: 'VALIDATION_ERROR' }, 'F'), 'F');

// Jaringan, batas laju, dan fallback bertingkat.
assert.ok(/koneksi/i.test(g.googleErrorMessage({ status: 0 }, 'F')));
assert.ok(/terlalu banyak/i.test(g.googleErrorMessage({ status: 429 }, 'F')));
assert.strictEqual(g.googleErrorMessage({ status: 500, detail: 'detail server' }, 'F'), 'detail server');
assert.strictEqual(g.googleErrorMessage({ message: 'pesan galat' }, 'F'), 'pesan galat');
assert.strictEqual(g.googleErrorMessage(null, 'F'), 'F');
assert.strictEqual(g.googleErrorMessage(undefined, 'F'), 'F');
assert.strictEqual(g.googleErrorMessage({}, 'F'), 'F');

console.log(`google-errors: ${known.length} kode server berpesan unik, predikat dan fallback benar`);

// ID token Google ditempel pada galat 409 supaya "Keluarkan & Masuk" mengulang lewat jalur Google (bukan password).
{
  const err = Object.assign(new Error('409'), { status: 409, code: 'DEVICE_LIMIT_REACHED', active_devices: [{ id: 'd1' }] });
  assert.strictEqual(g.googleIdTokenFromError(err), null, 'tanpa token: null');
  assert.strictEqual(g.withGoogleIdToken(err, 'tok-123'), err, 'mengembalikan galat yang sama');
  assert.strictEqual(g.googleIdTokenFromError(err), 'tok-123', 'token terbaca kembali');
  assert.ok(g.isDeviceLimitError(err), 'predikat konflik perangkat tetap benar');
  assert.ok(!JSON.stringify(err).includes('tok-123'), 'token tidak boleh ikut JSON.stringify (tak-enumerable)');
  assert.ok(!Object.keys(err).includes('googleIdToken'), 'token tidak boleh terlihat di Object.keys');
  assert.strictEqual(g.googleIdTokenFromError(null), null);
  assert.strictEqual(g.googleIdTokenFromError('bukan objek'), null);
  assert.strictEqual(g.withGoogleIdToken(null, 'x'), null, 'galat null tidak boleh meledak');
  const frozen = Object.freeze({ code: 'DEVICE_LIMIT_REACHED' });
  assert.doesNotThrow(() => g.withGoogleIdToken(frozen, 'tok'), 'objek beku tidak boleh melempar');
  assert.strictEqual(g.googleIdTokenFromError(frozen), null);
  console.log('google-errors: token Google pada galat konflik perangkat OK');
}
