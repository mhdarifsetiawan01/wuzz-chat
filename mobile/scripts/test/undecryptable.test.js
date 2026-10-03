'use strict';
// Pengenal penanda pesan E2EE yang tidak bisa dibuka: pencocokan persis, tidak menyentuh teks pengguna.
const assert = require('assert');
const { loadFresh } = require('./_harness');

const { undecryptable } = loadFresh(['utils/undecryptable.ts']);
const { isUndecryptablePlaceholder: isPlaceholder, UNDECRYPTABLE_PREVIEW } = undecryptable;

assert.ok(isPlaceholder('🔒 Pesan terenkripsi (kunci tidak cocok)'));
assert.ok(isPlaceholder('  🔒 Pesan terenkripsi (kunci tidak cocok)\n'));
assert.ok(isPlaceholder('🔒 Pesan terenkripsi'));

for (const text of [
  undefined,
  null,
  '',
  'Halo',
  'e2ee:v1:abc:def',
  '🔒 Pesan terenkripsi (sedang menyinkronkan kunci...)',
  'Pesan terenkripsi',
  'kata saya: 🔒 Pesan terenkripsi (kunci tidak cocok) ok',
  '🔒 Pesan terenkripsi gagal dibuka.',
]) {
  assert.ok(!isPlaceholder(text), 'seharusnya tidak cocok: ' + JSON.stringify(text));
}
assert.ok(UNDECRYPTABLE_PREVIEW.startsWith('🔒'), 'label pratinjau harus diawali 🔒 agar IconText menampilkan gembok');
console.log('undecryptable: 3 kasus cocok, 9 kasus sengaja tidak cocok');
