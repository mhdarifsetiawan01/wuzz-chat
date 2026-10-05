'use strict';
// Pelaporan crash tidak boleh pernah melempar error (modul native tak ada di uji unit/Expo Go => no-op).
const assert = require('assert');
const { loadFresh } = require('./_harness');

const { crashReporting } = loadFresh(['services/crashReporting.ts']);
const { initCrashReporting, setCrashUser, recordNonFatal } = crashReporting;

assert.doesNotThrow(() => initCrashReporting());
assert.doesNotThrow(() => initCrashReporting(), 'init kedua harus idempoten');
assert.doesNotThrow(() => setCrashUser('11111111-2222-3333-4444-555555555555'));
assert.doesNotThrow(() => setCrashUser(null));
assert.doesNotThrow(() => setCrashUser(undefined));
for (const input of [new Error('x'), 'string error', null, undefined, 42, { a: 1 }]) {
  assert.doesNotThrow(() => recordNonFatal(input, 'uji'), 'recordNonFatal menerima nilai apa pun');
}
assert.doesNotThrow(() => recordNonFatal(new Error('tanpa konteks')));

console.log('crash-reporting: init idempoten, setCrashUser, recordNonFatal (6 jenis masukan) tidak melempar');
