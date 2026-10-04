'use strict';
/**
 * Uji penulisan pesan ke SQLite dengan kode `sqliteStorage.ts` ASLI melawan database tiruan yang mencatat setiap
 * pernyataan. Mencakup yang bisa salah diam-diam: data identik, satu pesan berubah, cold start dengan/tanpa hidrasi,
 * transaksi gagal, pruning, dan pembersihan cache.
 *
 * Pola untuk pekerjaan serupa (mis. saveStoredConversations): tambahkan tabel ke `store`, tiru pernyataan SQL-nya di
 * `fakeDb.runAsync`, lalu hitung `store.upserts` / `store.txns` sebelum dan sesudah memanggil fungsi.
 */
const assert = require('assert');
const { state, loadFresh, sleep } = require('./_harness');

const store = { rows: new Map(), upserts: 0, txns: 0, failNext: false }; // key `user|id`

const fakeDb = {
  async execAsync() {},
  async runAsync(sql, p = []) {
    if (/^\s*INSERT INTO local_messages/.test(sql)) {
      store.upserts++;
      const [user, id, room, , , , , , , , , created, raw] = p;
      store.rows.set(user + '|' + id, { user, id, room, created, raw });
      return { changes: 1 };
    }
    if (/DELETE FROM local_messages\s+WHERE user_id = \? AND room_id = \?\s+AND id NOT IN/.test(sql)) {
      const [user, room, , , keep] = p;
      const mine = [...store.rows.values()]
        .filter((r) => r.user === user && r.room === room)
        .sort((a, b) => b.created.localeCompare(a.created));
      const drop = mine.slice(keep);
      drop.forEach((r) => store.rows.delete(r.user + '|' + r.id));
      return { changes: drop.length };
    }
    if (/^\s*DELETE FROM local_messages WHERE user_id = \? AND id = \?\s*$/.test(sql)) {
      const [user, id] = p;
      return { changes: store.rows.delete(user + '|' + id) ? 1 : 0 };
    }
    if (/^\s*DELETE FROM local_messages WHERE user_id = \?\s*$/.test(sql)) {
      const [user] = p;
      let n = 0;
      for (const [k, r] of store.rows) {
        if (r.user === user) {
          store.rows.delete(k);
          n++;
        }
      }
      return { changes: n };
    }
    return { changes: 0 };
  },
  async getFirstAsync(sql, p = []) {
    if (/COUNT\(\*\)/.test(sql)) {
      const [user, room] = p;
      return { count: [...store.rows.values()].filter((r) => r.user === user && r.room === room).length };
    }
    if (/PRAGMA auto_vacuum/.test(sql)) return { auto_vacuum: 2 };
    return null;
  },
  async getAllAsync(sql, p = []) {
    if (/SELECT raw_json FROM local_messages/.test(sql)) {
      const [user, room, limit] = p;
      return [...store.rows.values()]
        .filter((r) => r.user === user && r.room === room)
        .sort((a, b) => b.created.localeCompare(a.created))
        .slice(0, limit)
        .map((r) => ({ raw_json: r.raw }));
    }
    return [];
  },
  async withTransactionAsync(fn) {
    store.txns++;
    if (store.failNext) {
      store.failNext = false;
      await fn();
      throw new Error('commit gagal');
    }
    await fn();
  },
};
state.sqliteDb = fakeDb;

const FILES = ['services/sqliteStorage.ts', 'services/exclusiveQueue.ts', 'api/types.ts'];
const coldStart = () => loadFresh(FILES).sqliteStorage;

const U = 'u1';
const R = 'r1';
const mk = (i, extra = {}) => ({
  id: 'm' + String(i).padStart(4, '0'),
  room_id: 'r1',
  sender_id: 'u2',
  content: 'pesan ' + i,
  status: 'delivered',
  created_at: '2026-10-04T10:' + String(Math.floor(i / 60)).padStart(2, '0') + ':' + String(i % 60).padStart(2, '0') + '.000Z',
  reactions: [],
  ...extra,
});
const reset = () => {
  store.upserts = 0;
  store.txns = 0;
};

(async () => {
  let st = coldStart();
  const msgs = Array.from({ length: 50 }, (_, i) => mk(i));

  // 1. penulisan pertama
  await st.saveStoredMessages(U, R, msgs);
  assert.equal(store.upserts, 50);
  assert.equal(store.rows.size, 50);
  console.log('1. simpan 50 pesan baru               : 50 baris ditulis');

  // 2. data identik
  reset();
  await st.saveStoredMessages(U, R, msgs.map((m) => ({ ...m })));
  assert.equal(store.upserts, 0);
  assert.equal(store.txns, 0);
  console.log('2. simpan ulang data identik          : 0 baris, 0 transaksi');

  // 3. satu pesan berubah
  reset();
  const changed = msgs.map((m, i) => (i === 7 ? { ...m, status: 'read' } : { ...m }));
  await st.saveStoredMessages(U, R, changed);
  assert.equal(store.upserts, 1);
  assert.equal(JSON.parse(store.rows.get(U + '|m0007').raw).status, 'read');
  console.log('3. satu pesan berubah status          : 1 baris ditulis, isi tersimpan benar');

  // 4. urutan properti objek berbeda / reactions undefined vs []
  reset();
  const reordered = changed.map((m) => {
    const o = {};
    Object.keys(m).reverse().forEach((k) => (o[k] = m[k]));
    return o;
  });
  reordered[3].reactions = undefined;
  await st.saveStoredMessages(U, R, reordered);
  assert.equal(store.upserts, 0);
  console.log('4. urutan properti & reactions kosong : 0 baris (tanda tangan kanonik)');

  // 5. cold start DENGAN hidrasi lalu rekonsiliasi data yang sama
  st = coldStart();
  reset();
  const hydrated = await st.getStoredMessages(U, R, 50);
  assert.equal(hydrated.length, 50);
  await st.saveStoredMessages(U, R, changed.map((m) => ({ ...m })));
  assert.equal(store.upserts, 0);
  console.log('5. cold start + hidrasi + rekonsiliasi: 0 baris');

  // 6. cold start TANPA hidrasi: penulisan pertama sesi itu wajar
  st = coldStart();
  reset();
  await st.saveStoredMessages(U, R, changed);
  assert.equal(store.upserts, 50);
  console.log('6. cold start tanpa hidrasi           : 50 baris (penulisan pertama sesi)');

  // 7. transaksi gagal: tidak dicatat sebagai tertulis, percobaan berikutnya menulis lagi
  st = coldStart();
  store.rows.clear();
  reset();
  store.failNext = true;
  await st.saveStoredMessages(U, R, msgs);
  reset();
  await st.saveStoredMessages(U, R, msgs);
  assert.equal(store.upserts, 50);
  console.log('7. commit gagal                       : percobaan berikutnya menulis ulang 50 baris');

  // 8. pruning menghapus baris -> tanda tangan room dilupakan -> menyimpan ulang pesan terhapus benar-benar menulis
  st = coldStart();
  store.rows.clear();
  reset();
  const big = Array.from({ length: 700 }, (_, i) => mk(i));
  await st.saveStoredMessages(U, R, big);
  await sleep(30); // pruning otomatis dijadwalkan setelah gembok dilepas (700 > 500 + slack 50)
  assert.equal(store.rows.size, 500);
  assert.ok(!store.rows.has(U + '|m0000'), 'pesan tertua harus sudah terpangkas');
  reset();
  await st.saveStoredMessages(U, R, big.slice(0, 10));
  assert.equal(store.upserts, 10);
  assert.ok(store.rows.has(U + '|m0000'));
  console.log('8. pruning otomatis (700 -> 500 baris): pesan lama yang disimpan ulang benar-benar ditulis lagi');

  // 9. pembersihan cache pesan -> tanda tangan dikosongkan
  reset();
  await st.clearMessageCacheOnly(U);
  assert.equal(store.rows.size, 0);
  reset();
  await st.saveStoredMessages(U, R, msgs);
  assert.equal(store.upserts, 50);
  console.log('9. Bersihkan Cache Pesan              : setelahnya 50 pesan ditulis lagi');

  // 10. room berbeda tidak saling memengaruhi
  reset();
  await st.saveStoredMessages(U, 'r2', msgs.map((m) => ({ ...m, room_id: 'r2' })));
  assert.equal(store.upserts, 50);
  console.log('10. room lain                         : tanda tangan terpisah per room');

  // 11. hapus satu pesan: baris hilang dan menyimpan ulang pesan itu benar-benar menulis lagi
  st = coldStart();
  store.rows.clear();
  await st.saveStoredMessages(U, R, msgs.slice(0, 5));
  reset();
  await st.deleteStoredMessage(U, R, msgs[2].id);
  assert.ok(!store.rows.has(U + '|' + msgs[2].id));
  assert.equal(store.rows.size, 4);
  await st.saveStoredMessages(U, R, msgs.slice(0, 5));
  assert.equal(store.upserts, 1);
  console.log('11. hapus satu pesan                  : baris terhapus; simpan ulang menulis 1 baris');
})().catch((e) => {
  console.error('GAGAL:', e);
  process.exit(1);
});
