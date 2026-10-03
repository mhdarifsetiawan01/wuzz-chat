'use strict';
/**
 * Uji `roomKeyStore.ts` (kunci AES room di SecureStore) dengan kode ASLI: cold start pertama menurunkan kunci serial
 * dengan jeda, cold start kedua 0 ECDH, kunci berganti / entri rusak jatuh ke derivasi, dedupe, indeks, dan pembersihan.
 * ECDH dihitung lewat penanda yang disisipkan saat transpile (`tapEcdh`), bukan patch runtime (objek p256 noble beku).
 */
const assert = require('assert');
const { state, loadFresh, sleep } = require('./_harness');

const FILES = ['services/crypto.ts', 'services/exclusiveQueue.ts', 'services/secureStorage.ts', 'services/roomKeyStore.ts'];
// Log diagnostik permanen roomKeyStore ("[roomKeyStore] ECDH ...") hanya bising di keluaran uji
const originalWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].startsWith('[roomKeyStore] ECDH')) return;
  originalWarn(...args);
};
const ecdhLog = [];
global.__ecdhTap = () => ecdhLog.push(performance.now());

const coldStart = () => {
  const m = loadFresh(FILES, { 'services/crypto.ts': { tapEcdh: true } });
  return { crypto: m.crypto, store: m.roomKeyStore, ss: m.secureStorage.secureStorage };
};
const eq = (a, b) => Buffer.from(a).equals(Buffer.from(b));
const backing = state.secureStore;
const aesKeys = () => [...backing.keys()].filter((k) => k.startsWith('wuzz_e2ee_aes_') && !k.includes('_idx_'));

(async () => {
  let app = coldStart();
  const me = app.crypto.generateE2EEKeyPair();
  const peers = [0, 1, 2, 3].map(() => app.crypto.generateE2EEKeyPair());
  const rooms = ['dm_tenant1_u1_u2', 'dm_default_aaaa-bbbb', 'dm_x.y_z', 'dm_b61ac029_cc'];
  const U = 'user-1';
  const direct = (i) => app.crypto.deriveRoomAESKey(me.privateKeyHex, peers[i].publicKeyJWK, rooms[i]);
  const ensure = (a, i, peer = peers[i]) => a.store.ensureRoomAESKey(U, me.privateKeyHex, peer.publicKeyJWK, rooms[i]);
  ecdhLog.length = 0;

  // A. cold start pertama: 4 DM bersamaan -> 4 ECDH, serial, ada jeda antar-derivasi
  const keys = await Promise.all(rooms.map((_, i) => ensure(app, i)));
  assert.equal(ecdhLog.length, 4, 'cold start pertama harus tepat 4 ECDH, dapat ' + ecdhLog.length);
  const ecdhTimes = [...ecdhLog]; // ambil SEBELUM menghitung nilai harapan (yang juga memicu ECDH)
  const expected = rooms.map((_, i) => direct(i));
  keys.forEach((k, i) => assert.ok(eq(k, expected[i]), 'kunci salah room ' + i));
  const gaps = ecdhTimes.slice(1).map((t, i) => t - ecdhTimes[i]);
  assert.ok(gaps.every((g) => g >= 12), 'derivasi harus diberi jeda antar-room, gaps=' + gaps.map((g) => g.toFixed(0)));
  console.log(`A. cold start #1  : 4 ECDH serial (jeda >= ${Math.min(...gaps).toFixed(0)} ms), kunci benar`);

  await sleep(30);
  assert.equal(aesKeys().length, 4);
  assert.equal(JSON.parse(backing.get('wuzz_e2ee_aes_idx_' + U)).length, 4);
  for (const k of aesKeys()) {
    const v = JSON.parse(backing.get(k));
    assert.equal(v.v, 1);
    assert.equal(v.fp.length, 64);
  }
  console.log('B. persisten      : 4 entri + indeks tersimpan di SecureStore');

  // C. cold start kedua: 0 ECDH, kunci identik, jalur sinkron kena cache memori
  app = coldStart();
  ecdhLog.length = 0;
  const keys2 = await Promise.all(rooms.map((_, i) => ensure(app, i)));
  assert.equal(ecdhLog.length, 0, 'cold start kedua tidak boleh ECDH');
  keys2.forEach((k, i) => assert.ok(eq(k, expected[i])));
  assert.ok(eq(app.crypto.getOrDeriveRoomAESKey(me.privateKeyHex, peers[0].publicKeyJWK, rooms[0]), expected[0]));
  assert.equal(ecdhLog.length, 0);
  console.log('C. cold start #2  : 0 ECDH, kunci identik, jalur sinkron kena cache');

  // D. peer ganti kunci publik -> sidik jari tak cocok -> derivasi ulang
  app = coldStart();
  ecdhLog.length = 0;
  const newPeer = app.crypto.generateE2EEKeyPair();
  const k0 = await ensure(app, 0, newPeer);
  assert.equal(ecdhLog.length, 1);
  assert.ok(!eq(k0, expected[0]));
  assert.ok(eq(k0, app.crypto.deriveRoomAESKey(me.privateKeyHex, newPeer.publicKeyJWK, rooms[0])));
  console.log('D. peer ganti kunci: sidik jari tak cocok -> derivasi ulang');

  // E. dedupe: tiga permintaan bersamaan untuk room yang sama -> 1 ECDH
  app = coldStart();
  backing.clear();
  ecdhLog.length = 0;
  await Promise.all([ensure(app, 1), ensure(app, 1), ensure(app, 1)]);
  assert.equal(ecdhLog.length, 1);
  await sleep(60); // tunggu penulisan fire-and-forget selesai
  console.log('E. dedupe         : 3 permintaan bersamaan, 1 ECDH');

  // F. entri rusak / panjang salah / versi salah / byte rusak (panjang 32) -> derivasi ulang, hasil benar
  for (const label of ['bukan JSON', 'panjang kunci salah', 'versi tak dikenal', 'byte kunci rusak (panjang 32)']) {
    await sleep(60);
    app = coldStart();
    backing.clear();
    await ensure(app, 0);
    await sleep(60);
    const name = 'wuzz_e2ee_aes_' + U + '_' + rooms[0].replace(/[^A-Za-z0-9._-]/g, '_');
    assert.ok(backing.has(name), 'entri room 0 harus ada');
    const good = JSON.parse(backing.get(name));
    const flipped = Buffer.from(good.k, 'base64');
    flipped[0] ^= 0xff;
    backing.set(
      name,
      label === 'bukan JSON'
        ? 'garbage{{'
        : JSON.stringify(
            label === 'panjang kunci salah'
              ? { ...good, k: Buffer.from('short').toString('base64') }
              : label === 'versi tak dikenal'
                ? { ...good, v: 99 }
                : { ...good, k: flipped.toString('base64') }
          )
    );
    app = coldStart();
    ecdhLog.length = 0;
    const k = await ensure(app, 0);
    assert.equal(ecdhLog.length, 1, label);
    assert.ok(eq(k, expected[0]), label);
  }
  console.log('F. entri rusak    : bukan-JSON / panjang salah / versi salah / byte rusak -> derivasi ulang, hasil benar');

  // G. indeks: 4 penulisan paralel tidak boleh saling menimpa
  app = coldStart();
  backing.clear();
  await Promise.all(rooms.map((r) => app.ss.setDerivedRoomKey(U, r, 'x')));
  assert.equal(JSON.parse(backing.get('wuzz_e2ee_aes_idx_' + U)).length, 4);
  console.log('G. indeks         : 4 penulisan paralel -> 4 nama (tanpa lost-update)');

  // H. kunci privat diganti -> kunci turunan lama dihapus; kunci sama dipertahankan
  await app.ss.setE2EEKeyPair(U, { privateKeyHex: 'aa'.repeat(32), publicKeyJWK: '{}' });
  assert.equal(aesKeys().length, 4, 'simpan kunci pertama kali tidak boleh menghapus');
  await app.ss.setE2EEKeyPair(U, { privateKeyHex: 'aa'.repeat(32), publicKeyJWK: '{}' });
  assert.equal(aesKeys().length, 4, 'menyimpan kunci SAMA tidak boleh menghapus');
  await app.ss.setE2EEKeyPair(U, { privateKeyHex: 'bb'.repeat(32), publicKeyJWK: '{}' });
  assert.equal(aesKeys().length, 0);
  assert.ok(!backing.has('wuzz_e2ee_aes_idx_' + U));
  console.log('H. reset kunci    : kunci sama dipertahankan; kunci privat berbeda menghapus semua kunci turunan');

  // I. deleteE2EEKeyPair membersihkan; user lain tidak ikut terhapus
  await Promise.all(rooms.map((r) => app.ss.setDerivedRoomKey(U, r, 'x')));
  await app.ss.setDerivedRoomKey('user-2', 'dm_other', 'y');
  await app.ss.setE2EEKeyPair(U, { privateKeyHex: 'cc'.repeat(32), publicKeyJWK: '{}' });
  assert.equal(aesKeys().length, 1);
  assert.ok(backing.has('wuzz_e2ee_aes_user-2_dm_other'));
  await app.ss.deleteE2EEKeyPair('user-2');
  assert.equal(aesKeys().length, 0);
  console.log('I. hapus kunci    : membersihkan; user lain tidak ikut terhapus saat user-1 direset');
})().catch((e) => {
  console.error('GAGAL:', e);
  process.exit(1);
});
