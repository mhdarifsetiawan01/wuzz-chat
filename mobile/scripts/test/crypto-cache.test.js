'use strict';
/**
 * Uji kunci cache memori `getOrDeriveRoomAESKey` (B2): peer yang berganti kunci dalam satu sesi harus memperoleh
 * kunci baru, termasuk saat 32 karakter pertama JWK-nya sama (dulu tabrakan dan kunci lama terus dipakai).
 */
const assert = require('assert');
const { loadFresh } = require('./_harness');

const { crypto } = loadFresh(['services/crypto.ts']);
const eq = (a, b) => Buffer.from(a).equals(Buffer.from(b));

const me = crypto.generateE2EEKeyPair();
const room = 'dm_t_u1_u2';
const peerA = crypto.generateE2EEKeyPair();
const peerB = crypto.generateE2EEKeyPair();

const kA = crypto.getOrDeriveRoomAESKey(me.privateKeyHex, peerA.publicKeyJWK, room);
assert.ok(eq(kA, crypto.getOrDeriveRoomAESKey(me.privateKeyHex, peerA.publicKeyJWK, room)));

// peer berganti kunci
const kB = crypto.getOrDeriveRoomAESKey(me.privateKeyHex, peerB.publicKeyJWK, room);
assert.ok(eq(kB, crypto.deriveRoomAESKey(me.privateKeyHex, peerB.publicKeyJWK, room)));
assert.ok(!eq(kA, kB));

// JWK dengan 32 karakter pertama identik tetapi `x` berbeda: dulu tabrakan
const jwkOf = (k) => JSON.parse(k.publicKeyJWK);
const a = jwkOf(peerA);
const forged = JSON.stringify({ ...a, x: a.x.slice(0, -1) + (a.x.endsWith('A') ? 'B' : 'A') });
assert.equal(forged.slice(0, 32), peerA.publicKeyJWK.slice(0, 32));
assert.equal(crypto.peekRoomAESKey(me.privateKeyHex, forged, room), undefined, 'JWK berbeda tidak boleh kena cache');
console.log('B2. kunci cache memori memakai masukan lengkap: peer ganti kunci -> kunci baru, tanpa tabrakan');
