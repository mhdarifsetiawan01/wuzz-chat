'use strict';
// Sinyal "akun ditangguhkan": pendengar, predikat galat API, dan predikat penutupan WebSocket (kode 4004 + alasan).
const assert = require('assert');
const { loadFresh } = require('./_harness');

const { accountSuspended: s } = loadFresh(['utils/accountSuspended.ts']);

// Predikat galat API: kode di level atas ApiError atau di data respons.
assert.ok(s.isAccountSuspendedError({ status: 403, code: 'ACCOUNT_SUSPENDED' }));
assert.ok(s.isAccountSuspendedError({ status: 403, data: { code: 'ACCOUNT_SUSPENDED' } }));
assert.ok(!s.isAccountSuspendedError({ status: 403, code: 'GOOGLE_LINK_REQUIRED' }), 'pembekuan Google bukan penangguhan');
assert.ok(!s.isAccountSuspendedError({ status: 403 }), '403 tanpa kode bukan penangguhan');
assert.ok(!s.isAccountSuspendedError({ status: 401, code: 'INVALID_CREDENTIALS' }));
assert.ok(!s.isAccountSuspendedError(null) && !s.isAccountSuspendedError(undefined));

// Penutupan WebSocket: harus kode 4004 DAN alasan yang cocok. 4003 (pembekuan/device mismatch) dan alasan lain tidak.
assert.ok(s.isSuspendedClose(4004, 'ACCOUNT_SUSPENDED'));
assert.ok(s.isSuspendedClose(4004, 'ACCOUNT_SUSPENDED: Akun Anda ditangguhkan.'));
assert.ok(!s.isSuspendedClose(4004, ''), 'kode 4004 tanpa alasan bukan penangguhan');
assert.ok(!s.isSuspendedClose(4004, undefined));
assert.ok(!s.isSuspendedClose(4004, 'SESSION_REPLACED'));
assert.ok(!s.isSuspendedClose(4003, 'ACCOUNT_SUSPENDED'), 'kode 4003 dipakai pembekuan Google/device mismatch');
// Server lama menendang dengan 4001: alasan ACCOUNT_SUSPENDED tetap harus dikenali (jangan jatuh ke "sesi digantikan" yang
// menghapus kunci E2EE dan data lokal), sedangkan 4001 biasa (SESSION_REPLACED/ACCOUNT_DELETED) bukan penangguhan.
assert.ok(s.isSuspendedClose(4001, 'ACCOUNT_SUSPENDED: Akun Anda ditangguhkan.'));
assert.ok(!s.isSuspendedClose(4001, 'SESSION_REPLACED: Akun Anda dibuka dari perangkat lain.'));
assert.ok(!s.isSuspendedClose(4001, 'ACCOUNT_DELETED: Akun telah dihapus.'));
assert.ok(!s.isSuspendedClose(1000, 'ACCOUNT_SUSPENDED'));
assert.strictEqual(s.SUSPENDED_CLOSE_CODE, 4004);

// Pendengar: dipanggil tiap kejadian, bisa berhenti, galat satu pendengar tidak menghentikan yang lain.
let a = 0, b = 0;
const offA = s.onAccountSuspended(() => { a++; });
const offThrow = s.onAccountSuspended(() => { throw new Error('boom'); });
const offB = s.onAccountSuspended(() => { b++; });
const origError = console.error; console.error = () => {};
try { s.notifyAccountSuspended(); s.notifyAccountSuspended(); } finally { console.error = origError; }
assert.strictEqual(a, 2); assert.strictEqual(b, 2, 'galat satu pendengar tidak menghentikan yang lain');
offA(); offThrow();
console.error = () => {};
try { s.notifyAccountSuspended(); } finally { console.error = origError; }
assert.strictEqual(a, 2, 'pendengar yang berhenti tidak dipanggil lagi'); assert.strictEqual(b, 3);
offB();
s.notifyAccountSuspended(); // tanpa pendengar: aman
assert.strictEqual(b, 3);
console.log('account-suspended: predikat galat/penutupan, pendengar, isolasi galat');
