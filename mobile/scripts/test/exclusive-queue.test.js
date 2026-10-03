'use strict';
// Antrean tulis: serial, FIFO, error terisolasi, tidak ada tumpang tindih; juga mereproduksi error transaksi bersarang tanpa antrean.
const assert = require('assert');
const { loadFresh, sleep } = require('./_harness');

const { exclusiveQueue } = loadFresh(['services/exclusiveQueue.ts']);
const { createExclusiveQueue } = exclusiveQueue;

// Koneksi tiruan: satu koneksi; BEGIN bersarang / COMMIT tanpa transaksi gagal seperti expo-sqlite sungguhan
function makeConn() {
  let inTxn = false;
  const log = [];
  const errors = [];
  return {
    errors,
    log,
    async withTransaction(fn) {
      await sleep(1);
      if (inTxn) {
        errors.push('cannot start a transaction within a transaction');
        throw new Error(errors[errors.length - 1]);
      }
      inTxn = true;
      try {
        await fn();
        await sleep(1);
        inTxn = false;
      } catch (err) {
        if (!inTxn) {
          errors.push('cannot rollback - no transaction is active');
          throw new Error(errors[errors.length - 1]);
        }
        inTxn = false;
        throw err;
      }
    },
    async run(sql) {
      await sleep(Math.random() * 3);
      log.push(sql);
    },
  };
}
const saveBatch = (conn, name) => async () => {
  await conn.withTransaction(async () => {
    for (let i = 0; i < 3; i++) await conn.run(name + i);
  });
};

(async () => {
  // 1. Tanpa antrean: dua penyimpanan bersamaan menghasilkan error yang sama seperti di HP
  let conn = makeConn();
  await Promise.allSettled([saveBatch(conn, 'friends')(), saveBatch(conn, 'feed')()]);
  assert.ok(conn.errors.length > 0, 'tanpa antrean seharusnya terjadi error transaksi');
  console.log('tanpa antrean   : error =', [...new Set(conn.errors)].join(' ; '));

  // 2. Dengan antrean: 30 task bersamaan, tanpa error, tiap transaksi utuh dan berurutan
  conn = makeConn();
  const run = createExclusiveQueue();
  const results = await Promise.allSettled(Array.from({ length: 30 }, (_, i) => run(saveBatch(conn, 't' + i))));
  assert.equal(conn.errors.length, 0);
  assert.ok(results.every((r) => r.status === 'fulfilled'));
  for (let i = 0; i < 30; i++) {
    assert.deepEqual(conn.log.slice(i * 3, i * 3 + 3), [0, 1, 2].map((k) => 't' + i + k));
  }
  console.log('dengan antrean  : 30 task bersamaan, 0 error, tiap transaksi utuh dan berurutan');

  // 3. Hasil dirambatkan; error satu task tidak memblokir berikutnya
  const q2 = createExclusiveQueue();
  const a = q2(async () => {
    await sleep(5);
    return 42;
  });
  const b = q2(async () => {
    throw new Error('boom');
  });
  const c = q2(async () => 'lanjut');
  assert.equal(await a, 42);
  await assert.rejects(b, /boom/);
  assert.equal(await c, 'lanjut');
  console.log('error terisolasi: task gagal ditolak ke pemanggilnya, task berikutnya jalan');

  // 4. Konkurensi maksimum 1
  const q3 = createExclusiveQueue();
  let active = 0;
  let max = 0;
  await Promise.all(
    Array.from({ length: 20 }, () =>
      q3(async () => {
        active++;
        max = Math.max(max, active);
        await sleep(Math.random() * 4);
        active--;
      })
    )
  );
  assert.equal(max, 1);
  console.log('konkurensi maks : 1');

  // 5. Dokumentasi aturan: antrean TIDAK reentrant (await task lain dari dalam antrean = deadlock)
  const q4 = createExclusiveQueue();
  const outcome = await Promise.race([
    q4(async () => {
      await q4(async () => 1);
      return 'selesai';
    }),
    sleep(100).then(() => 'DEADLOCK'),
  ]);
  assert.equal(outcome, 'DEADLOCK');
  console.log('reentrancy      : deadlock terkonfirmasi (aturan di exclusiveQueue.ts valid)');
})().catch((e) => {
  console.error('GAGAL:', e);
  process.exit(1);
});
