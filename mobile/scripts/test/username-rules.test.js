'use strict';
// Petunjuk username klien: batas panjang, karakter, spasi, dan pesan. Server tetap berwenang.
const assert = require('assert');
const { loadFresh } = require('./_harness');

const { usernameRules: u } = loadFresh(['utils/usernameRules.ts']);
const h = (v) => u.getUsernameHint(v);

// Kosong atau spasi saja: hanya aturan, bukan galat (jangan memarahi sebelum mengetik).
for (const v of ['', '   ']) {
  assert.strictEqual(h(v).state, 'idle');
  assert.strictEqual(h(v).message, u.USERNAME_RULES_TEXT);
}

// Batas panjang tepat.
assert.strictEqual(h('ab').state, 'error');
assert.ok(/Minimal 3/.test(h('ab').message));
assert.strictEqual(h('abc').state, 'ok');
assert.strictEqual(h('a'.repeat(30)).state, 'ok');
assert.strictEqual(h('a'.repeat(31)).state, 'error');
assert.ok(/Maksimal 30/.test(h('a'.repeat(31)).message));

// Karakter yang diizinkan server.
for (const v of ['alice', 'Alice_01', 'a.b-c', 'user.name', '123', 'a-b_c.d']) assert.strictEqual(h(v).state, 'ok', v);
// Karakter terlarang: spasi di tengah, simbol, huruf non-latin, emoji, @ di depan.
for (const v of ['a b c', 'alice!', 'ali@ce', '@alice', 'üser', 'user😀', 'a/b', 'a#b']) {
  assert.strictEqual(h(v).state, 'error', v);
  assert.ok(/Hanya huruf/.test(h(v).message), v);
}

// Spasi di tepi diabaikan (server memangkasnya juga).
assert.strictEqual(h('  alice  ').state, 'ok');
assert.strictEqual(h('  ab  ').state, 'error');

// Pesan "ok" tidak boleh menjanjikan ketersediaan.
assert.ok(!/tersedia\b(?! )/.test(h('alice').message.replace('Ketersediaan', '')), 'jangan klaim username tersedia');
assert.ok(/diperiksa saat akun dibuat/.test(h('alice').message));

// Konsisten dengan konstanta.
assert.strictEqual(u.USERNAME_MIN, 3);
assert.strictEqual(u.USERNAME_MAX, 30);

console.log('username-rules: batas 3/30, karakter, spasi tepi, pesan jujur soal ketersediaan');
