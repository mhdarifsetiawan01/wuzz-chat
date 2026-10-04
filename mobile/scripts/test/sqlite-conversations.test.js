'use strict';
/**
 * Uji penulisan daftar percakapan (saveStoredConversations) dengan kode ASLI melawan database tiruan.
 * Pola sama dengan sqlite-storage.test.js: hitung `store.upserts` / `store.txns` sebelum dan sesudah.
 */
const assert = require('assert');
const { state, loadFresh } = require('./_harness');

const store = { rows: new Map(), upserts: 0, txns: 0, failNext: false, replaces: 0 }; // key `user|id`

const fakeDb = {
  async execAsync() {},
  async runAsync(sql, p = []) {
    if (/INSERT OR REPLACE INTO local_conversations/.test(sql)) store.replaces++;
    if (/^\s*INSERT INTO local_conversations/.test(sql)) {
      store.upserts++;
      const [user, id] = p;
      store.rows.set(user + '|' + id, { user, id, pinned: p[8], raw: p[12] });
      return { changes: 1 };
    }
    if (/UPDATE local_conversations\s+SET is_pinned/.test(sql)) {
      const [pinned, user, id] = p;
      const r = store.rows.get(user + '|' + id);
      if (r) r.pinned = pinned;
      return { changes: r ? 1 : 0 };
    }
    if (/DELETE FROM local_conversations WHERE user_id = \?/.test(sql)) {
      for (const [k, r] of store.rows) if (r.user === p[0]) store.rows.delete(k);
      return { changes: 1 };
    }
    return { changes: 0 };
  },
  async getFirstAsync() {
    return null;
  },
  async getAllAsync(sql, p = []) {
    if (/SELECT raw_json FROM local_conversations/.test(sql)) {
      return [...store.rows.values()].filter((r) => r.user === p[0]).map((r) => ({ raw_json: r.raw }));
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
const mk = (i, extra = {}) => ({
  id: 'r' + i,
  type: 'direct',
  name: 'Chat ' + i,
  last_message: 'halo ' + i,
  unread_count: 0,
  updated_at: '2026-10-04T10:00:' + String(i).padStart(2, '0') + '.000Z',
  ...extra,
});
const reset = () => {
  store.upserts = 0;
  store.txns = 0;
};

(async () => {
  let st = coldStart();
  const convs = Array.from({ length: 24 }, (_, i) => mk(i));

  await st.saveStoredConversations(U, convs);
  assert.equal(store.upserts, 24);
  assert.equal(store.replaces, 0, 'harus UPSERT, bukan INSERT OR REPLACE');
  console.log('1. simpan 24 percakapan baru          : 24 baris, UPSERT');

  reset();
  await st.saveStoredConversations(U, convs.map((c) => ({ ...c })));
  assert.equal(store.upserts, 0);
  assert.equal(store.txns, 0);
  console.log('2. simpan ulang data identik          : 0 baris, 0 transaksi');

  reset();
  const changed = convs.map((c, i) => (i === 5 ? { ...c, unread_count: 3, last_message: 'baru' } : { ...c }));
  await st.saveStoredConversations(U, changed);
  assert.equal(store.upserts, 1);
  assert.equal(JSON.parse(store.rows.get(U + '|r5').raw).unread_count, 3);
  console.log('3. satu percakapan berubah            : 1 baris ditulis');

  reset();
  const reordered = changed.map((c) => {
    const o = {};
    Object.keys(c).reverse().forEach((k) => (o[k] = c[k]));
    return o;
  });
  await st.saveStoredConversations(U, reordered);
  assert.equal(store.upserts, 0);
  console.log('4. urutan properti berbeda            : 0 baris (tanda tangan kanonik)');

  // 5. cold start dengan hidrasi lalu refresh data sama
  st = coldStart();
  reset();
  const hydrated = await st.getStoredConversations(U);
  assert.equal(hydrated.length, 24);
  await st.saveStoredConversations(U, changed.map((c) => ({ ...c })));
  assert.equal(store.upserts, 0);
  console.log('5. cold start + hidrasi + refresh     : 0 baris');

  // 6. cold start tanpa hidrasi
  st = coldStart();
  reset();
  await st.saveStoredConversations(U, changed);
  assert.equal(store.upserts, 24);
  console.log('6. cold start tanpa hidrasi           : 24 baris (penulisan pertama sesi)');

  // 7. commit gagal
  st = coldStart();
  store.rows.clear();
  store.failNext = true;
  await st.saveStoredConversations(U, convs);
  reset();
  await st.saveStoredConversations(U, convs);
  assert.equal(store.upserts, 24);
  console.log('7. commit gagal                       : percobaan berikutnya menulis ulang');

  // 8. pin diubah lewat jalur terpisah -> save berikutnya menulis ulang percakapan itu
  reset();
  await st.updateStoredConversationPin(U, 'r2', true);
  await st.saveStoredConversations(U, convs);
  assert.equal(store.upserts, 1);
  console.log('8. pin lewat jalur lain               : 1 baris ditulis ulang');

  // 9. clearUserCache -> tulis ulang semuanya
  await st.clearUserCache(U);
  assert.equal(store.rows.size, 0);
  reset();
  await st.saveStoredConversations(U, convs);
  assert.equal(store.upserts, 24);
  console.log('9. clearUserCache                     : setelahnya 24 baris ditulis lagi');

  // 10. user lain terpisah
  reset();
  await st.saveStoredConversations('u2', convs);
  assert.equal(store.upserts, 24);
  console.log('10. user lain                         : tanda tangan terpisah per user');
})().catch((e) => {
  console.error('GAGAL:', e);
  process.exit(1);
});
